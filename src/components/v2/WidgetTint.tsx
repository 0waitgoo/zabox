import type { WidgetTint } from '../../store/localStore';
import { useDisplayPrefs } from '../../store/displayPrefs';

/**
 * A 型小组件的专属底色层（第二十三轮；第三十六轮水印改为居中 Emoji）：
 * - 一层低透明度线性渐变（from 约 34% → to 约 19% → 约 8%，第七十九轮提浓）叠在卡片基底之上、内容之下
 * - 一枚大号 Emoji 字符居中作水印，低透明度、轻微倾斜，不拦截点击
 * 整体绝对定位铺满卡片、pointer-events-none；卡片内容需以 relative 层级盖在其上。
 * data-widget-tint 记色板 id，供自测断言逐卡底色与持久化；
 * data-widget-watermark 记水印字符，供自测断言居中 Emoji 水印。
 * 第五十五轮：渐变 tint 的强度曾由「底框透明度」滑杆（displayPrefs.groupCardAlpha）耦合驱动。
 * 第六十轮：滑杆拆分——tint 强度改吃独立字段 displayPrefs.widgetAlpha（背景面板「小组件底色
 * 不透明度」滑杆），与编组卡滑杆彻底解耦；旧耦合公式只留在 displayPrefs 里作老用户迁移推导。
 * 水印不透明度不随滑杆变（仍走 watermarkOpacity）。卡片与面板共用本组件，渲染口径一致。
 * 第七十八轮（用户定版「底色跟随整体变化」）：底色拆两层——基底改与编组卡同款的面
 * （.widget-panel：同底色变量/同透明度归属，见 index.css 与各卡壳），本层
 * 只剩「专属色渐变 + 水印」的颜色身份职责；widgetAlpha 的唯一职责从此是本渐变层的浓淡
 * （整层 opacity），不再决定卡面透不透。渐变色值与峰值（约 16%/9%/4%）不变——旧观感
 * 之所以「拉满还淡」，病根在旧基底是写死 0.4 的磨砂壳、页面背景直透，与本层无关。
 * 第七十九轮（用户线上实测：「100% 的饱和度应该在 50% 左右再增加才行」）：基底换源后
 * 渐变本身的浓度成为短板——两手提浓：① 三档 alpha 整体放大约 2.1 倍（29/17/0a →
 * 57/31/15，即约 34%/19%/8%）；② 色板色在渲染时经 vivid() 提饱和：保持色相不变，
 * 只压明度上限（from ≤0.60、to ≤0.74）并托饱和下限（HSL S ≥0.85）——色板原色多为
 * 高明度粉彩（色相纯但太浅），压明度后才是「浓」的来源。色板常量、每卡分配、140deg
 * 方向与滑杆「整层 opacity」语义全部不变，低值仍可淡。
 */

/** 色板色提饱和（第七十九轮）：hex → HSL，保持色相，压明度上限 + 托饱和下限，再转回 hex。
 *  只在本层的渲染口径里生效，色板常量本身不动。
 *  第九十一轮：导出供右键选色面板的预览条共用——面板预览与卡面渲染走同一个 vivid，
 *  用户在面板里看到的就是实际上卡的效果（含浅色被压明度托饱和的对比保护）。 */
export function vivid(hex: string, maxL: number, minS: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  const L = Math.min(l, maxL);
  const S = Math.max(s, minS);
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const to2 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to2(rgb[0])}${to2(rgb[1])}${to2(rgb[2])}`;
}
export default function WidgetTintLayer({
  tint,
  emoji,
  watermarkOpacity,
}: {
  tint: WidgetTint;
  /** 水印字符：由各卡片按语义传入的 Emoji（如 📰 / 🔥 / 🏆 / 📋） */
  emoji: string;
  /** 水印不透明度覆盖（第五十二轮：计划卡单独调低到 0.1，避免 2x 时水印压住内容区干扰阅读；其他组件不传 = 默认 0.16） */
  watermarkOpacity?: number;
}) {
  const { widgetAlpha } = useDisplayPrefs();
  const tintStrength = Math.min(1, Math.max(0, widgetAlpha));
  const fromVivid = vivid(tint.from, 0.6, 0.85);
  const toVivid = vivid(tint.to, 0.74, 0.85);
  return (
    <div
      aria-hidden
      data-widget-tint={tint.id}
      className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none"
    >
      <div
        data-widget-tint-gradient
        className="absolute inset-0"
        style={{
          background: `linear-gradient(140deg, ${fromVivid}57 0%, ${toVivid}31 52%, ${toVivid}15 100%)`,
          opacity: tintStrength,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          data-widget-watermark={emoji}
          className="select-none"
          style={{
            fontSize: 'clamp(96px, 28cqw, 168px)',
            lineHeight: 1,
            opacity: watermarkOpacity ?? 0.16,
            transform: 'rotate(-8deg)',
            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          }}
        >
          {emoji}
        </span>
      </div>
    </div>
  );
}
