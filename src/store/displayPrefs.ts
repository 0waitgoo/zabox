import { useEffect, useState } from 'react';

/**
 * 本机显示偏好（第四十二轮）：外观模式（暗夜/白天）+ 编组卡底框透明度。
 * 与背景设置同属「这台设备上的显示设置」家族，但按产品口径**不进 store.data**：
 * 不参与 JSON 导出/导入、不随 GitHub 同步走，换设备各设各的。故独立存一个 localStorage key。
 * 生效方式：App 把 theme 写到 <html data-theme>、把 alpha 写成 CSS 变量 --group-card-alpha。
 * 白天模式的最终定义（第五十八轮收敛为一句话）：与暗夜完全相同，只有 B 卡与 C 卡
 * （含组合卡）卡面变白底深字。为此 App 背景层不随主题变（旧版白色遮罩 veil 已撤除）、
 * 小组件/顶栏/弹窗保持暗夜观感、搜索框与数据按钮白天也钉回暗夜深色毛玻璃
 * （index.css 的 [data-theme="light"] .card-glass-surface 规则）；
 * index.css 里其余 light 覆盖仍全部限定在编组卡作用域（.group-card-panel / .group-card-scope）内。
 * 液态玻璃（原外观第三档 'glass'）：第一百零二轮按用户指令整体删除（渲染体系 +
 * 本档一并下线），存档 theme='glass' 加载时显式落回暗夜（见 normalizePrefs）。
 * 第六十轮：透明度滑杆拆成两根——groupCardAlpha 只管编组卡（B/C/组合卡 + 搜索面）；
 * 新增 widgetAlpha 只管 A 型小组件的渐变 tint（见 WidgetTint），两者解耦。
 * 迁移：旧存档没有 widgetAlpha 时，按第五十五轮旧耦合公式 strength = alpha / 0.45
 * 由编组卡现值推导初值（钳 [0,1]），保证升级后小组件第一眼观感与升级前一致，此后独立保存。
 * 第六十二轮：新增 bgBlur——本地图片背景之上的模糊强度（0–1），背景面板「背景模糊」滑杆
 * 控制。此前该模糊在 App 遮罩层写死 backdrop-blur 6px，故默认值 0.3 恰对应 6px
 * （换算见 BG_BLUR_MAX_PX / bgBlurPx：0%→0px、30%→6px、100%→20px），老用户升级后
 * 第一眼观感不变。只作用于本地图片背景，预设背景不受影响；同层的压黑遮罩 bg-black/50 不动。
 */
export type DisplayTheme = 'dark' | 'light' | 'liquid';

export interface DisplayPrefs {
  theme: DisplayTheme;
  /** 编组卡（B/C/组合卡）底框不透明度 0–1；默认 0.4 = 改版前的 rgba(30,30,35,0.4) */
  groupCardAlpha: number;
  /** 小组件专属色渐变层的浓淡 0–1（第六十轮新增，与编组卡滑杆解耦）。
   *  第七十八轮语义定版：只管渐变浓淡，不再决定卡面透不透——小组件基底已改与
   *  编组卡同款的面（.widget-panel），其透明度归 groupCardAlpha 那套，两根滑杆
   *  分工为「基底归整体外观、颜色归本滑杆」。字段名与存档口径不变，无迁移。 */
  widgetAlpha: number;
  /** 本地图片背景的模糊强度 0–1（第六十二轮新增）；经 bgBlurPx 换算成 backdrop blur 像素，默认 0.3 = 旧写死值 6px */
  bgBlur: number;
  /** 「深海蓝」纯色版的颜色（第九十二轮）：该预设从动态背景改为纯色自选，颜色存这里
   *  （与显示偏好同路径、本机保存），背景面板点开即选色；默认 OCEAN_DEFAULT_COLOR。 */
  oceanColor: string;
}

/** 「深海蓝」纯色版默认色 = 原渐变的主色 #0d2140（第九十二轮）：老用户升级后第一眼仍是深海蓝 */
export const OCEAN_DEFAULT_COLOR = '#0d2140';

const STORAGE_KEY = 'ainav-display-prefs-v1';

/** 第五十五轮旧耦合公式：小组件 tint 强度 = 编组卡 alpha / 0.45 钳 [0,1]。
 *  第六十轮起仅用于老用户迁移推导（见 normalizePrefs），运行时不再使用。 */
export function legacyWidgetStrength(groupCardAlpha: number): number {
  return Math.min(1, Math.max(0, groupCardAlpha / 0.45));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 背景模糊上限：滑杆 100% 对应的 backdrop blur 像素（第六十二轮） */
export const BG_BLUR_MAX_PX = 20;

/** 模糊强度（0–1）→ backdrop blur 像素：线性换算，0.3（默认）→ 6px = 第六十二轮前的写死值 */
export function bgBlurPx(strength: number): number {
  return Math.round(clamp01(strength) * BG_BLUR_MAX_PX);
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  theme: 'dark',
  groupCardAlpha: 0.4,
  // 缺省种子用户从没动过滑杆：小组件初值按旧耦合公式由默认 0.4 推导（≈0.89），与拆分前观感一致
  widgetAlpha: legacyWidgetStrength(0.4),
  // 背景模糊默认 0.3 ↔ 6px，即第六十二轮前 App 遮罩层写死的 backdrop-blur-[6px]，观感不变
  bgBlur: 0.3,
  oceanColor: OCEAN_DEFAULT_COLOR,
};

function normalizePrefs(raw: unknown): DisplayPrefs {
  if (raw && typeof raw === 'object') {
    const p = raw as {
      theme?: unknown;
      groupCardAlpha?: unknown;
      widgetAlpha?: unknown;
      bgBlur?: unknown;
      oceanColor?: unknown;
    };
    const groupCardAlpha =
      typeof p.groupCardAlpha === 'number' && Number.isFinite(p.groupCardAlpha)
        ? clamp01(p.groupCardAlpha)
        : DEFAULT_DISPLAY_PREFS.groupCardAlpha;
    return {
      // 第一百零二轮迁移：液态玻璃档已删除，存档 theme='glass' 显式落回暗夜；其余偏好不动
      theme: p.theme === 'light' || p.theme === 'liquid' ? p.theme : 'dark',
      groupCardAlpha,
      // 第六十轮迁移：存档里已有合法 widgetAlpha 就用它；没有（老用户）则按旧耦合公式推导
      widgetAlpha:
        typeof p.widgetAlpha === 'number' && Number.isFinite(p.widgetAlpha)
          ? clamp01(p.widgetAlpha)
          : legacyWidgetStrength(groupCardAlpha),
      // 第六十二轮迁移：老存档没有 bgBlur 时回落默认 0.3（= 旧写死 6px），观感不变
      bgBlur:
        typeof p.bgBlur === 'number' && Number.isFinite(p.bgBlur)
          ? clamp01(p.bgBlur)
          : DEFAULT_DISPLAY_PREFS.bgBlur,
      // 第九十二轮迁移：老存档没有 oceanColor 时回落深海蓝原色；只接受 #rrggbb 并归一小写
      oceanColor:
        typeof p.oceanColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.oceanColor)
          ? p.oceanColor.toLowerCase()
          : OCEAN_DEFAULT_COLOR,
    };
  }
  return { ...DEFAULT_DISPLAY_PREFS };
}

export function loadDisplayPrefs(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePrefs(JSON.parse(raw)) : { ...DEFAULT_DISPLAY_PREFS };
  } catch {
    return { ...DEFAULT_DISPLAY_PREFS };
  }
}

/** 把偏好应用到文档根：data-theme 供编组卡作用域内的 CSS 覆盖翻色，--group-card-alpha 供编组卡底色取 alpha */
export function applyDisplayPrefs(prefs: DisplayPrefs): void {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.style.setProperty('--group-card-alpha', String(prefs.groupCardAlpha));
}

/* ---------- 极简订阅：多个组件（App 应用副作用 / 背景面板控件）共享同一份状态 ---------- */

let current: DisplayPrefs = loadDisplayPrefs();
const listeners = new Set<(p: DisplayPrefs) => void>();

export function setDisplayPrefs(patch: Partial<DisplayPrefs>): void {
  current = normalizePrefs({ ...current, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* 本地存储不可用时仅本次会话生效 */
  }
  applyDisplayPrefs(current);
  listeners.forEach((fn) => fn(current));
}

/** 读当前偏好（供预设快照直接取数，不经过 React 订阅） */
export function getDisplayPrefs(): DisplayPrefs {
  return current;
}

/** 订阅偏好变化（第一百一十一轮：预设状态机监听外观改动，触发自动保存进「我的」） */
export function subscribeDisplayPrefs(fn: (p: DisplayPrefs) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDisplayPrefs(): DisplayPrefs {
  const [prefs, setPrefs] = useState<DisplayPrefs>(current);
  useEffect(() => {
    const fn = (p: DisplayPrefs) => setPrefs(p);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return prefs;
}
