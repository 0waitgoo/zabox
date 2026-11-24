import type React from 'react';

/**
 * 小组件自定义底色（纯色，2026-11-24 用户令：右键可自己换底色）：
 * - 每卡一个 hex 色，存在 store.widgetBaseColors（key = widget:<id>），缺省 = 黑底 + 标准蓝；
 * - 换色后：强调色 = 该色本身，底色 = 该色的深色版（HSL 明度压到 20%，保时间组件的深色底观感、
 *   且亮色强调在深底上看得清）；白字 / #A3A3A3 次字不动；底色透明度仍吃全局 --widget-alpha；
 * - 浅色例外（2026-11-24 用户反馈：选偏白的 #F1EDFD 后底色被压成深紫、等于没更新）：
 *   所选色明度 L > 0.75 视为浅色——底色明度取 0.60（该色相的中等亮色调，看得出是所选色，
 *   白字仍可读），强调色取该色相明度 0.45 的中色调（浅底上看得见，白字/白图标在其上可读）；
 *   L ≤ 0.75 时走旧分支（底色明度 0.20，强调色 = 所选色本身），色板 8 色明度均 ≤ 0.58 不受影响；
 * - 卡根挂两个 CSS 变量：--widget-base-rgb（底色 "r g b"）与 --widget-accent（强调色 hex），
 *   .widget-panel 的 background 吃前者，卡内强调色统一走后者（color-mix 做透明度变体）。
 * - 本字段是显示偏好、不进预设快照（与 widgetTints 的「不进预设」口径一致，但更进一步：
 *   连快照也不进，切预设不碰它，换色一次就一直留着）。
 */

/** 默认强调色：标准蓝（用户原话「默认目前的标准蓝」） */
export const DEFAULT_WIDGET_ACCENT = '#2563EB';

/** 右键换色色板：标准蓝首位（默认），其余为与白字可读的中等饱和色（Tailwind 600 档） */
export const WIDGET_BASE_COLORS: { hex: string; name: string }[] = [
  { hex: '#2563EB', name: '标准蓝' },
  { hex: '#DC2626', name: '红' },
  { hex: '#16A34A', name: '绿' },
  { hex: '#EA580C', name: '橙' },
  { hex: '#7C3AED', name: '紫' },
  { hex: '#DB2777', name: '粉' },
  { hex: '#0891B2', name: '青' },
  { hex: '#CA8A04', name: '深黄' },
];

export function isValidHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const mx = Math.max(rn, gn, bn);
  const mn = Math.min(rn, gn, bn);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = 0;
  if (mx === rn) h = 60 * (((gn - bn) / d) % 6);
  else if (mx === gn) h = 60 * ((bn - rn) / d + 2);
  else h = 60 * ((rn - gn) / d + 4);
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255)) as [number, number, number];
}

/** 浅色阈值与两档明度（2026-11-24）：所选色明度 L 高于此值视为浅色，不再压到 0.20；
 *  浅色底色明度取 0.60、强调色取 0.45（同色相）。色板 8 色明度均 ≤ 0.58，走旧分支。 */
export const LIGHT_COLOR_THRESHOLD = 0.75;
export const LIGHT_BASE_LIGHTNESS = 0.6;
export const LIGHT_ACCENT_LIGHTNESS = 0.45;

/** HSL → hex（与 hslToRgb 同源，供强调色输出 hex 用） */
function hslToHex(h: number, s: number, l: number): string {
  return `#${hslToRgb(h, s, l)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** 把 hex 色压暗到指定明度（默认 0.20），返回 "r g b" 三元组（供 rgb(var(--widget-base-rgb) / ...) 用）；
 *  只动明度，色相与饱和度原样保留，故底色仍带该色的色相、只是很深。
 *  浅色例外：输入明度 > 0.75 时目标明度改取 0.60（不再压成深紫，见文件头注释）。 */
export function darkenHexToRgbTriplet(hex: string, lightness = 0.2): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const target = l > LIGHT_COLOR_THRESHOLD ? LIGHT_BASE_LIGHTNESS : lightness;
  const [dr, dg, db] = hslToRgb(h, s, target);
  return `${dr} ${dg} ${db}`;
}

/** 强调色 hex：深色取所选色本身；浅色（L > 0.75）取同色相明度 0.45 的中色调
 *  （浅底上看得见，白字/白图标在其上可读；所选色本身太浅、作强调色会看不清）。 */
export function accentHexFor(hex: string): string {
  const lower = hex.toLowerCase();
  const [r, g, b] = hexToRgb(lower);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l <= LIGHT_COLOR_THRESHOLD) return lower;
  return hslToHex(h, s, LIGHT_ACCENT_LIGHTNESS);
}

/** 按某卡的自定义底色算出卡根要挂的两个 CSS 变量；无自定义色（undefined/非法）时回落黑底 + 标准蓝。 */
export function widgetColorVars(hex?: string): React.CSSProperties {
  if (!hex || !isValidHexColor(hex)) {
    return {
      '--widget-base-rgb': '0 0 0',
      '--widget-accent': DEFAULT_WIDGET_ACCENT,
    } as React.CSSProperties;
  }
  const lower = hex.toLowerCase();
  return {
    '--widget-base-rgb': darkenHexToRgbTriplet(lower),
    '--widget-accent': accentHexFor(lower),
  } as React.CSSProperties;
}
