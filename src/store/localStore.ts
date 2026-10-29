import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cleanSiteTags,
  autoSiteLogo,
  navGroups,
  type GroupDisplay,
  type NavGroup,
  type SiteEntry,
} from '../data/groups';
import {
  DEFAULT_DISPLAY_PREFS,
  OCEAN_DEFAULT_COLOR,
  getDisplayPrefs,
  setDisplayPrefs,
  subscribeDisplayPrefs,
  type DisplayTheme,
} from './displayPrefs';

/**
 * 本地数据层（方案三第一步：本地优先）
 * - 编组数据首次从 src/data/groups.ts 种子初始化，存入 localStorage（单一 key、带 version）
 * - 之后页面一律读本地数据；用户增删改即时落盘，刷新不丢
 * - 布局配置（哪些 A 组件显示）也存这里
 * - 同步层（GitHub 仓库 / 云端）以后只替换这一层的读写后端，组件不感知
 */

export type WidgetId = 'task' | 'news' | 'trending' | 'tools' | 'colors';

/** A 型原生组件在网格中的占位：宽度跨栏数（最多 2 栏） + 高度单位（1X / 2X） */
export interface WidgetLayout {
  colSpan: 1 | 2;
  heightUnits: 1 | 2;
}

export const DEFAULT_WIDGET_LAYOUTS: Record<WidgetId, WidgetLayout> = {
  task: { colSpan: 1, heightUnits: 1 },
  news: { colSpan: 2, heightUnits: 2 },
  trending: { colSpan: 2, heightUnits: 1 },
  /** 文件工具卡（第六十八轮）：默认 2 栏 × 1x，6 个工具一排摆下 */
  tools: { colSpan: 2, heightUnits: 1 },
  /** 中式色卡（第一百零七轮）：默认 2 栏 × 1x，当日配色色带横排（设计稿注册定版） */
  colors: { colSpan: 2, heightUnits: 1 },
};

/** B 型编组卡收起态的默认占位：2 栏 × 2x（与组件共用 WidgetLayout 形状，右键菜单可改） */
export const DEFAULT_GROUP_LAYOUT: WidgetLayout = { colSpan: 2, heightUnits: 2 };

/**
 * 背景设置：来源只有两种——内置预设（纯 CSS）或用户本地图片。
 * 本地图片的 Blob 本体存 IndexedDB（见 bgImageDb.ts），绝不上服务器；
 * 这里只记 kind 与选中的预设（kind='local' 时 presetId 是移除本地图后的回落背景）。
 */
export interface BackgroundSetting {
  kind: 'preset' | 'local';
  presetId: string;
  /** 本地图片最近一次更换的时间戳：让 App 在 kind 不变（换图）时也能感知并重读 IndexedDB */
  localStamp?: number;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  /** 完整的 CSS background 值（渐变/纯色），不引用任何图片资源；
   *  动态预设下作面板缩略与画布挂载前的兜底底色 */
  css: string;
  /** 动态背景（第九十二轮）：挂载对应的自研 Canvas 组件（components/backgrounds/） */
  dynamic?: 'dappled';
}

/** 内置背景预设：全部纯 CSS 实现 */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'violet',
    name: '星云紫',
    css: 'radial-gradient(1200px 800px at 85% -10%, rgba(139, 92, 246, 0.5), transparent 60%), radial-gradient(1000px 760px at 8% 108%, rgba(76, 29, 149, 0.6), transparent 55%), linear-gradient(155deg, #221344 0%, #150a2e 48%, #0a0a12 100%)',
  },
  {
    // 第九十二轮：「深空灰」下架，自研动态背景「斑驳光影」顶到它的位置（面板第 2 位）
    id: 'dappled',
    name: '斑驳光影',
    dynamic: 'dappled',
    css: 'radial-gradient(900px 620px at 10% -12%, rgba(153, 191, 255, 0.38), transparent 55%), linear-gradient(165deg, #101014 0%, #0a0a0a 60%, #060607 100%)',
  },
  {
    // 第九十二轮：「深海蓝」改纯色自选——渲染色取 displayPrefs.oceanColor（默认即下面
    // 渐变的首色 #0d2140），此 css 只作面板/兜底参考，不再直接上屏
    id: 'ocean',
    name: '深海蓝',
    css: 'radial-gradient(1100px 750px at 80% -10%, rgba(37, 99, 235, 0.38), transparent 60%), linear-gradient(160deg, #0d2140 0%, #081426 52%, #05070d 100%)',
  },
];

export const DEFAULT_BACKGROUND: BackgroundSetting = { kind: 'preset', presetId: 'violet' };

/** 按 id 取预设：未知 id 回落默认预设（老数据/导入数据兼容） */
export function backgroundPresetOf(presetId: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find((p) => p.id === presetId) ?? BACKGROUND_PRESETS[0];
}

/** 已下架的背景预设 id（显式名单，不靠「不在预设表」兜底碰运气）：
 *  'space'（深空灰）/'forest'（墨绿）第九十二轮下架；'tide'（等高潮汐）第一百零一轮按用户要求删除。
 *  选中这些 id 的老存档在归一化时一律回落默认预设 'violet'（星云紫），其余设置不受影响。 */
const RETIRED_BACKGROUND_PRESET_IDS: readonly string[] = ['space', 'forest', 'tide'];

/** 归一化背景设置：老数据无此字段时回落默认预设；presetId 必须是已知预设。
 *  迁移：已下架预设（见 RETIRED_BACKGROUND_PRESET_IDS）自动回落 'violet'；
 *  'ocean'（深海蓝）保留 id、渲染为纯色版。 */
function normalizeBackground(raw: unknown): BackgroundSetting {
  if (raw && typeof raw === 'object') {
    const b = raw as { kind?: unknown; presetId?: unknown; localStamp?: unknown };
    const presetId =
      typeof b.presetId === 'string' &&
      !RETIRED_BACKGROUND_PRESET_IDS.includes(b.presetId) &&
      BACKGROUND_PRESETS.some((p) => p.id === b.presetId)
        ? b.presetId
        : 'violet';
    return {
      kind: b.kind === 'local' ? 'local' : 'preset',
      presetId,
      localStamp: typeof b.localStamp === 'number' ? b.localStamp : undefined,
    };
  }
  return { ...DEFAULT_BACKGROUND };
}

/**
 * 预设里的外观（第一百一十一轮）：外观设置并进预设、跟预设一起保存。
 * 只含预设背景与显示偏好——本地图片背景（kind='local'）不进预设：应用预设时
 * 一律回到预设背景（图片本体仍在 IndexedDB，之后可重选）。
 */
export interface PresetAppearance {
  background: { presetId: string; oceanColor: string };
  theme: DisplayTheme;
  groupCardAlpha: number;
  widgetAlpha: number;
  bgBlur: number;
}

/** 四套内置预设共用的外观（第一百一十一轮）：星云紫 + 暗夜 + 默认透明度，可预测、不玩花样 */
export const DEFAULT_PRESET_APPEARANCE: PresetAppearance = {
  background: { presetId: 'violet', oceanColor: OCEAN_DEFAULT_COLOR },
  theme: 'dark',
  groupCardAlpha: DEFAULT_DISPLAY_PREFS.groupCardAlpha,
  widgetAlpha: DEFAULT_DISPLAY_PREFS.widgetAlpha,
  bgBlur: DEFAULT_DISPLAY_PREFS.bgBlur,
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 归一化外观：字段非法逐项回落默认；整体不是对象时返回 null（调用方按当前全局外观补齐） */
function normalizeAppearance(raw: unknown): PresetAppearance | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as {
    background?: unknown;
    theme?: unknown;
    groupCardAlpha?: unknown;
    widgetAlpha?: unknown;
    bgBlur?: unknown;
  };
  const bg = (a.background ?? {}) as { presetId?: unknown; oceanColor?: unknown };
  const presetId =
    typeof bg.presetId === 'string' && BACKGROUND_PRESETS.some((p) => p.id === bg.presetId)
      ? bg.presetId
      : 'violet';
  const oceanColor =
    typeof bg.oceanColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(bg.oceanColor)
      ? bg.oceanColor.toLowerCase()
      : OCEAN_DEFAULT_COLOR;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : fallback;
  return {
    background: { presetId, oceanColor },
    theme: a.theme === 'light' ? 'light' : 'dark',
    groupCardAlpha: num(a.groupCardAlpha, DEFAULT_DISPLAY_PREFS.groupCardAlpha),
    widgetAlpha: num(a.widgetAlpha, DEFAULT_DISPLAY_PREFS.widgetAlpha),
    bgBlur: num(a.bgBlur, DEFAULT_DISPLAY_PREFS.bgBlur),
  };
}

/** 从一份 store 数据 + 当前全局显示偏好拼出完整外观（快照与指纹共用） */
function appearanceOf(d: StoreData, prefs: { oceanColor: string; theme: DisplayTheme; groupCardAlpha: number; widgetAlpha: number; bgBlur: number }): PresetAppearance {
  return {
    background: { presetId: d.background.presetId, oceanColor: prefs.oceanColor },
    theme: prefs.theme,
    groupCardAlpha: prefs.groupCardAlpha,
    widgetAlpha: prefs.widgetAlpha,
    bgBlur: prefs.bgBlur,
  };
}

/** 老快照缺 appearance 时的补齐（第一百一十一轮迁移口径）：按当前全局外观补齐，
 *  调用方（validateStoreData）从已归一化的 background + 当前偏好拼出，不许一切换就重置用户外观 */
function fallbackAppearance(backgroundPresetId: string): PresetAppearance {
  const prefs = getDisplayPrefs();
  return {
    background: { presetId: backgroundPresetId, oceanColor: prefs.oceanColor },
    theme: prefs.theme,
    groupCardAlpha: prefs.groupCardAlpha,
    widgetAlpha: prefs.widgetAlpha,
    bgBlur: prefs.bgBlur,
  };
}

/** 读某编组的布局：未存过时回落默认（老数据兼容） */
export function groupLayoutOf(layouts: Record<string, WidgetLayout>, groupId: string): WidgetLayout {
  return layouts[groupId] ?? DEFAULT_GROUP_LAYOUT;
}

/** C 型编组（文件夹式）的默认占位：1 栏 × 1x（与 B 型共用 groupLayouts 存储，仅缺省值不同） */
export const DEFAULT_STACK_LAYOUT: WidgetLayout = { colSpan: 1, heightUnits: 1 };

/** 读某 C 型编组的布局：未存过时回落 1 栏 × 1x */
export function stackLayoutOf(layouts: Record<string, WidgetLayout>, groupId: string): WidgetLayout {
  return layouts[groupId] ?? DEFAULT_STACK_LAYOUT;
}

/* ---------- 计划任务小工具数据（第十八轮；第十九轮重构） ---------- */

/** 待办子任务：组内的一项 */
export interface TaskChild {
  id: string;
  title: string;
  done: boolean;
}

/**
 * 短期待办：数组顺序即展示顺序。
 * 第十九轮起顶层条目可带 children —— 只要 children 是数组（哪怕空）就是「组」：
 * 组本身不单独勾选，完成态由子任务全勾推导（见 taskGroupDone）；普通待办 children 缺省。
 */
export interface TaskItem {
  id: string;
  title: string;
  /** 普通待办的完成态；组忽略此字段（由子任务推导） */
  done: boolean;
  createdAt: number;
  children?: TaskChild[];
}

/** 是否为组（children 为数组即是组，空组也算） */
export const isTaskGroup = (t: TaskItem): boolean => Array.isArray(t.children);

/** 组的子任务进度（非组返回 0/0） */
export function taskChildProgress(t: TaskItem): { done: number; total: number } {
  const kids = t.children ?? [];
  return { done: kids.filter((c) => c.done).length, total: kids.length };
}

/** 组完成态：至少一个子任务且全部勾完（空组不算完成） */
export const taskGroupDone = (t: TaskItem): boolean => {
  if (!isTaskGroup(t)) return false;
  const { done, total } = taskChildProgress(t);
  return total > 0 && done === total;
};

/** 顶层条目是否算「已完成」：普通待办看 done，组看子任务全勾 */
export const taskEntryDone = (t: TaskItem): boolean => (isTaskGroup(t) ? taskGroupDone(t) : t.done);

/**
 * 卡面/面板统一的待办计数口径（第十九轮）：把组按子任务摊平计数——
 * 普通待办计 1，组计 children.length；分子同样摊平（组内已勾数）。
 */
export function taskFlatStats(tasks: TaskItem[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const t of tasks) {
    if (isTaskGroup(t)) {
      const p = taskChildProgress(t);
      total += p.total;
      done += p.done;
    } else {
      total += 1;
      if (t.done) done += 1;
    }
  }
  return { total, done };
}

/** 长期计划类型：次数型（执行了多少次） / 日期型（设一个完成时间） */
export type PlanMode = 'count' | 'date';

/**
 * 长期计划（第十九轮重构；第十八轮的 steps「计划组」形态已废弃，存量在归一化时迁移为次数型）：
 * - count：进度 = currentCount / targetCount，unit 为自由文本单位（次/节/笔…，默认「次」）
 * - date：deadline 为目标完成日（YYYY-MM-DD），startDate 为创建日，时间进度 = 已流逝比例；done 为手动完成标记
 */
export interface PlanItem {
  id: string;
  title: string;
  mode: PlanMode;
  targetCount?: number;
  unit?: string;
  currentCount?: number;
  deadline?: string;
  startDate?: string;
  /** 日期型计划的可选时间（HH:MM）：推进表时间轴落块用；没填就是全天（只按日期排） */
  startTime?: string;
  endTime?: string;
  /** 日期型计划的可选事件日（YYYY-MM-DD）：日程表/推进表按事件日排，不填则用截止日；
      截止日仍是目标完成日（计划行进度与完成状态的锚），两者分开 */
  eventDate?: string;
  done?: boolean;
  createdAt: number;
}

/** 本地日期转 YYYY-MM-DD（按本地时区，不走 UTC 避免差一天） */
export function toDateStr(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const todayDateStr = (): string => toDateStr(new Date());

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateStr = (s: unknown): s is string => typeof s === 'string' && DATE_STR_RE.test(s);

/** 两个 YYYY-MM-DD 之间相差的整天数（b - a，可为负） */
export function dateStrDiffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

/** 「M月d日」展示用 */
export function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}月${d}日`;
}

/** 次数型进度 0~1（无目标时 0） */
export function planCountRatio(p: PlanItem): number {
  const target = p.targetCount ?? 0;
  if (target <= 0) return 0;
  return Math.min(1, (p.currentCount ?? 0) / target);
}

/** 日期型时间进度 0~1：startDate→deadline 已流逝比例（同日/过期夹到边界） */
export function planDateRatio(p: PlanItem): number {
  if (!isDateStr(p.deadline)) return 0;
  const start = isDateStr(p.startDate) ? p.startDate : p.deadline;
  const total = dateStrDiffDays(start, p.deadline);
  if (total <= 0) return 1;
  const elapsed = dateStrDiffDays(start, todayDateStr());
  return Math.min(1, Math.max(0, elapsed / total));
}

/** 卡面样式（目前只有任务卡有双样式）：按卡片稳定 key 存，缺省列表式 */
export type CardFaceStyle = 'list' | 'focus';

export function cardFaceStyleOf(styles: Record<string, CardFaceStyle>, cardKey: string): CardFaceStyle {
  return styles[cardKey] === 'focus' ? 'focus' : 'list';
}

/* ---------- A 型小组件专属底色（第二十三轮） ---------- */

/**
 * 小组件底色色板：每张 A 型小组件卡在首次出现时随机抽一色、落盘后不再变。
 * 渲染为低透明度线性渐变（深色玻璃底之上、内容之下）+ 同色大号水印图标。
 * from/to 为渐变两端色（渲染侧以 8%–16% 透明度叠加，文字可读性不受影响）。
 */
export interface WidgetTint {
  id: string;
  name: string;
  from: string;
  to: string;
}

/**
 * 自定义双色渐变（第九十一轮）：用户在右键菜单「换个底色」面板里自选起点/终点两色。
 * widgetTints 的值除色板索引（number）外可为此形态；渲染时经 widgetTintOf 展开成
 * WidgetTint（id='custom'）后走与色板完全相同的一条渲染链（vivid 提饱和 + 同 alpha 档），
 * 不另起渲染口径。from/to 只收 #rrggbb，归一化时非法值整项丢弃（回落补抽）。
 */
export interface WidgetTintCustom {
  kind: 'custom';
  from: string;
  to: string;
}

/** widgetTints 的落盘值：色板索引或自定义双色 */
export type WidgetTintValue = number | WidgetTintCustom;

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

/** 校验并清洗一个自定义双色值：形态/色值任一非法返回 null */
function sanitizeWidgetTintCustom(raw: unknown): WidgetTintCustom | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as { kind?: unknown; from?: unknown; to?: unknown };
  if (v.kind !== 'custom') return null;
  if (typeof v.from !== 'string' || !HEX6_RE.test(v.from)) return null;
  if (typeof v.to !== 'string' || !HEX6_RE.test(v.to)) return null;
  return { kind: 'custom', from: v.from.toLowerCase(), to: v.to.toLowerCase() };
}

/**
 * 小组件底色色板（第四十轮按用户给的参考图整套更换，共 8 个双色渐变模板；
 * id 与 name 即图上的命名，后续维护按名找色。存量 widgetTints 存的是索引，
 * 换板后旧索引按新板重新解释（颜色整体换一遍是预期行为）；越界索引在归一化时取模兜底。
 * 07 青岚漫野 / 08 冰屿青澜：原图印的色值有误印，按图面观感取近似值。
 */
export const WIDGET_TINTS: WidgetTint[] = [
  { id: 'midnight-mirage', name: '午夜幻影 Midnight Mirage', from: '#4A53FF', to: '#ACFFFF' },
  { id: 'twilight-haze', name: '暮霞绮梦 Twilight Haze', from: '#FF7BE1', to: '#FCE3BF' },
  { id: 'mist-isle', name: '雾屿青岚 Mist Isle', from: '#72CDFF', to: '#BFFFCC' },
  { id: 'serene-horizon', name: '赤霞绯梦 Serene Horizon', from: '#FF7374', to: '#FDB5E3' },
  { id: 'crimson-dream', name: '星河垂落 Crimson Dream', from: '#AB74FF', to: '#67EAF9' },
  { id: 'aurora-gold', name: '暖阳熔金 Aurora Gold', from: '#FF8867', to: '#FFFF96' },
  { id: 'emerald-glow', name: '青岚漫野 Emerald Glow', from: '#2EEA8B', to: '#B9F73C' },
  { id: 'ice-cyan', name: '冰屿青澜 Ice Cyan', from: '#43D9FF', to: '#5FFBCB' },
];

/** 按卡片 key 读底色：未分配（老数据/尚未补抽）时返回 undefined（渲染侧不叠底色）；
 * 索引越界（色板换代后存量数据可能出现）时取模回绕，永远有底色、不报错；
 * 自定义双色（第九十一轮）展开为同形 WidgetTint（id='custom'），渲染链与色板一致 */
export function widgetTintOf(tints: Record<string, WidgetTintValue>, cardKey: string): WidgetTint | undefined {
  const v = tints[cardKey];
  if (v && typeof v === 'object') {
    const c = sanitizeWidgetTintCustom(v);
    return c ? { id: 'custom', name: '自定义渐变', from: c.from, to: c.to } : undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const len = WIDGET_TINTS.length;
  return WIDGET_TINTS[((Math.trunc(v) % len) + len) % len];
}

/**
 * 随机抽一个底色索引：优先避开 exclude 里已占用的色（同屏组件尽量各不相同），
 * 全部占用时退化为全色板随机（色板 8 色、组件至多 4 个，正常不会走到）。
 */
export function pickWidgetTintIndex(exclude: Iterable<number>): number {
  const used = new Set(exclude);
  const all = WIDGET_TINTS.map((_, i) => i);
  const free = all.filter((i) => !used.has(i));
  const pool = free.length > 0 ? free : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 归一化 widgetTints：采纳合法色板索引与自定义双色（第九十一轮）；
 * 老数据无此字段时为空表（渲染前由 HomePage 补抽）。加载/导入/同步共用 validateStoreData 一条路径 */
function normalizeWidgetTints(raw: unknown): Record<string, WidgetTintValue> {
  const out: Record<string, WidgetTintValue> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
        // 色板换代兜底（第四十轮）：旧色板有 9 色、新板 8 色，存量索引 8 取模回绕到 0，不丢底色
        out[k] = v % WIDGET_TINTS.length;
      } else {
        const c = sanitizeWidgetTintCustom(v);
        if (c) out[k] = c;
      }
    }
  }
  return out;
}

/** 归一化 tasks：老数据无此字段 / 元素残缺时逐项清洗，非法整体回落空数组（首次即空状态，不塞假数据）。
 *  children 是数组的元素按「组」保留（子任务逐项清洗），非数组一律不当组。 */
function normalizeTasks(raw: unknown): TaskItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskItem[] = [];
  for (const t of raw as Partial<TaskItem>[]) {
    if (!t || typeof t.title !== 'string' || !t.title) continue;
    const item: TaskItem = {
      id: typeof t.id === 'string' && t.id ? t.id : genId('t'),
      title: t.title,
      done: t.done === true,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : 0,
    };
    if (Array.isArray(t.children)) {
      const kids: TaskChild[] = [];
      for (const c of t.children as Partial<TaskChild>[]) {
        if (!c || typeof c.title !== 'string' || !c.title) continue;
        kids.push({
          id: typeof c.id === 'string' && c.id ? c.id : genId('tc'),
          title: c.title,
          done: c.done === true,
        });
      }
      item.children = kids;
    }
    out.push(item);
  }
  return out;
}

/**
 * 归一化 plans（第十九轮）：
 * - 新形态按 mode 清洗字段：count 需正整数目标（非法回落 1）与非负已执行数；date 需合法 deadline，
 *   无合法 deadline 的 date 型回落次数型；startDate 非法时用创建日/今天兜底。
 * - 存量迁移：第十八轮的 steps 形态（无 mode 且带 steps 数组）→ 次数型：
 *   targetCount = steps 总数（0 步回落 1 防除零）、currentCount = 已勾数、unit 取「次」，迁移后不再保留 steps。
 */
function normalizePlans(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const p of raw as (Partial<PlanItem> & { steps?: unknown })[]) {
    if (!p || typeof p.title !== 'string' || !p.title) continue;
    const base: PlanItem = {
      id: typeof p.id === 'string' && p.id ? p.id : genId('p'),
      title: p.title,
      mode: 'count',
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
    };
    const cleanCount = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
    const cleanCurrent = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    const cleanUnit = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 4) : '次');

    if (p.mode === 'date' && isDateStr(p.deadline)) {
      base.mode = 'date';
      base.deadline = p.deadline;
      base.startDate = isDateStr(p.startDate)
        ? p.startDate
        : base.createdAt > 0
          ? toDateStr(new Date(base.createdAt))
          : todayDateStr();
      base.done = p.done === true;
      // 可选时间（推进表用）：只收合法 HH:MM；结束不晚于开始时只留开始（当全天+开始时刻处理）
      const cleanTime = (v: unknown) =>
        typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
      const st = cleanTime(p.startTime);
      const et = cleanTime(p.endTime);
      if (st) base.startTime = st;
      if (et && (!st || et > st)) base.endTime = et;
      // 可选事件日：只收合法日期；非法丢弃（回落截止日）
      if (isDateStr(p.eventDate)) base.eventDate = p.eventDate;
    } else if (p.mode === 'count' || p.mode === 'date') {
      // 新形态次数型（date 型但 deadline 坏了也落这里，保证计划可用）
      base.targetCount = cleanCount(p.targetCount, 1);
      base.currentCount = cleanCurrent(p.currentCount);
      base.unit = cleanUnit(p.unit);
    } else if (Array.isArray(p.steps)) {
      // —— 存量迁移：steps 式旧计划 → 次数型 ——
      const steps = p.steps as { done?: unknown }[];
      base.targetCount = Math.max(1, steps.length);
      base.currentCount = steps.filter((s) => s && s.done === true).length;
      base.unit = '次';
    } else {
      base.targetCount = cleanCount(p.targetCount, 1);
      base.currentCount = cleanCurrent(p.currentCount);
      base.unit = cleanUnit(p.unit);
    }
    out.push(base);
  }
  return out;
}

/**
 * C 卡组合（第二十一轮）：两个文件夹式（stack）编组拖拽合并成一张卡，一组最多 2 个组。
 * 组合只记成员与当前 tab，两个组本体数据（名字/站点/tabColor/类型）完全不动；
 * 卡片顺序里组合占一个条目（key = combo:<id>），尺寸存 groupLayouts 的同一 key。
 */
export interface ComboItem {
  id: string;
  /** 恰好 2 个成员组 id：[0] 为左 tab、[1] 为右 tab */
  groupIds: [string, string];
  /** 当前选中的 tab（必须是成员之一） */
  activeGroupId: string;
}

/** 归一化组合：成员必须真实存在且仍为 stack 型、两两不重复、一个组至多属于一个组合；
 *  任一条件不满足（成员被删/改型等）即解散该组合，剩余组按普通卡渲染（渲染侧另有兜底） */
function normalizeCombos(raw: unknown, groups: NavGroup[]): ComboItem[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const used = new Set<string>();
  const out: ComboItem[] = [];
  for (const c of raw as Partial<ComboItem>[]) {
    if (!c || typeof c.id !== 'string' || !c.id || !Array.isArray(c.groupIds)) continue;
    const [a, b] = c.groupIds as unknown[];
    if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
    const ga = byId.get(a);
    const gb = byId.get(b);
    if (!ga || !gb || ga.display !== 'stack' || gb.display !== 'stack') continue;
    if (used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    out.push({
      id: c.id,
      groupIds: [a, b],
      activeGroupId: c.activeGroupId === b ? b : a,
    });
  }
  return out;
}

/**
 * A 型组件摞（第七十二轮）：多个小组件叠成一张卡，顶部标题排切换当前成员，一摞最多 4 个。
 * 摞只记成员顺序与当前成员；成员各自的数据（计划任务、组件独立存储等）完全不动，
 * 成员仍留在 widgets 列表里（摞是纯布局层分组，不产生第二份实体，商店里仍显示「已添加」）。
 * 卡片顺序里摞占一个条目（key = wstack:<id>），尺寸存 groupLayouts 的同一 key（同组合口径）。
 */
export const WIDGET_STACK_MAX = 4;

export interface WidgetStackItem {
  id: string;
  /** 成员组件 id（有序，2..WIDGET_STACK_MAX 个）：顶部标题排从左到右即此序 */
  widgetIds: WidgetId[];
  /** 当前显示的成员（必须是成员之一） */
  activeWidgetId: WidgetId;
}

/** 拖拽/菜单合并的参与方：单个组件或一整摞（HomePage 与 store 方法共用） */
export type WidgetMergeEntity = { type: 'widget'; id: WidgetId } | { type: 'stack'; id: string };

/** 归一化组件摞：成员必须是合法组件且当前在 widgets 列表中、两两不重复、一个组件至多属于一摞；
 *  成摞需 2..上限 个成员，不足 2 个整摞丢弃（成员按普通卡渲染）；超上限截断到上限 */
function normalizeWidgetStacks(raw: unknown, widgets: WidgetId[]): WidgetStackItem[] {
  if (!Array.isArray(raw)) return [];
  const visible = new Set(widgets);
  const used = new Set<WidgetId>();
  const out: WidgetStackItem[] = [];
  for (const s of raw as Partial<WidgetStackItem>[]) {
    if (!s || typeof s.id !== 'string' || !s.id || !Array.isArray(s.widgetIds)) continue;
    if (out.some((o) => o.id === s.id)) continue;
    const members: WidgetId[] = [];
    for (const m of s.widgetIds as unknown[]) {
      if (typeof m !== 'string') continue;
      const id = m as WidgetId;
      if (!ALL_WIDGETS.some((w) => w.id === id)) continue;
      if (!visible.has(id) || used.has(id) || members.includes(id)) continue;
      members.push(id);
      if (members.length >= WIDGET_STACK_MAX) break;
    }
    if (members.length < 2) continue;
    for (const m of members) used.add(m);
    out.push({
      id: s.id,
      widgetIds: members,
      activeWidgetId: members.includes(s.activeWidgetId as WidgetId) ? (s.activeWidgetId as WidgetId) : members[0],
    });
  }
  return out;
}

/** 归一化卡面样式表：只采纳合法值 */
function normalizeCardFaceStyles(raw: unknown): Record<string, CardFaceStyle> {  const out: Record<string, CardFaceStyle> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === 'list' || v === 'focus') out[k] = v;
    }
  }
  return out;
}

export interface StoreData {
  version: 1;
  groups: NavGroup[];
  /** 当前显示的 A 型组件（按 ALL_WIDGETS 顺序渲染过滤） */
  widgets: WidgetId[];
  /** 每个 A 型组件的网格占位（右键菜单可改），缺省走 DEFAULT_WIDGET_LAYOUTS */
  widgetLayouts: Record<WidgetId, WidgetLayout>;
  /** 每个 B 型编组的收起态网格占位（右键菜单可改），按 groupId 存，缺省走 DEFAULT_GROUP_LAYOUT */
  groupLayouts: Record<string, WidgetLayout>;
  /**
   * 主页卡片顺序（用户拖拽排序后落盘）：元素为卡片稳定 key，
   * 编组 = group:<groupId>，原生组件 = widget:<widgetId>。
   * 空数组 = 用默认顺序；读取时经 resolveCardOrder 与当前卡片集合对齐。
   */
  cardOrder: string[];
  /**
   * 主页卡片栏锚点（第三十四轮，按栏排放）：key = 卡片稳定 key，value = 起始栏（0–3，桌面 4 栏制）。
   * 栏内顺序由 cardOrder 在栏内过滤得到，不另存序号。放置规则见 components/v2/laneLayout.ts。
   * 空表 = 尚未迁移，HomePage 首次渲染时按旧瀑布流位置生成锚点并静默落盘；
   * 个别 key 缺失（新加的卡）由放置引擎回落到当前最矮的栏，HomePage 随即补写。
   */
  cardCols: Record<string, number>;
  /** 背景设置（预设或本地图片标记）；老数据无此字段时回落默认预设 */
  background: BackgroundSetting;
  /**
   * 数据最后变更时间戳（毫秒）：每次经 update() 的用户变更都会刷新；
   * importData 不刷新（保留来源的时间戳），供 GitHub 同步按新旧裁决冲突。
   * 老数据无此字段时为 0（任何带真实时间戳的一端都比它新）。
   */
  updatedAt: number;
  /** 计划任务小工具：短期待办（第十八轮）；老数据无此字段时归一化为空数组 */
  tasks: TaskItem[];
  /** 计划任务小工具：长期计划；老数据无此字段时归一化为空数组 */
  plans: PlanItem[];
  /** 卡面样式（按卡片稳定 key 存，如 widget:task）；老数据无此字段时为空表（各卡回落缺省样式） */
  cardFaceStyles: Record<string, CardFaceStyle>;
  /** C 卡组合（第二十一轮）：老数据无此字段时归一化为空数组 */
  combos: ComboItem[];
  /** A 型组件摞（第七十二轮）：老数据无此字段时归一化为空数组（无摞时行为与此前完全一致） */
  widgetStacks: WidgetStackItem[];
  /**
   * A 型小组件专属底色（第二十三轮）：key = 卡片稳定 key（widget:<id>），value = WIDGET_TINTS 色板索引，
   * 或用户自选的自定义双色（第九十一轮，WidgetTintCustom）。
   * 组件首次出现时随机抽一次并落盘，之后刷新/同步都不变；老数据无此字段时为空表（渲染前补抽）。
   */
  widgetTints: Record<string, WidgetTintValue>;
  /**
   * 当前主页预设（第一百零六轮建、第一百零九轮改语义）：内置预设 id 或 'my'
   * （用户自己的排版）。老存档无此字段时归一化为 'my'：既有排版即用户的「我的」。
   * 任一构成变更都经 update() 自动处理：内置预设期翻为 'my' 并立即刷新存档，
   * 本来就在 'my' 时同样刷新存档——「我的」恒等于当前排版（见 update）。
   */
  activePreset: PresetId;
  /**
   * 「我的」预设存档（第一百零六轮建、第一百零九轮改语义）：用户自有构成的快照，
   * 构成一变即由 update() 自动刷新（无需用户点任何东西）；null = 尚无存档
   * （老存档/新装初期），面板上「我的」显示「暂无存档」、点击无操作，
   * 首次构成变更时自动生成。内置预设之间互切不覆盖存档。
   */
  myPreset: CompositionSnapshot | null;
}

/** 内置预设 id（第一百零六轮）：构成数据在 data/presets.ts，本层只认 id */
export type BuiltinPresetId = 'default' | 'designer' | 'developer' | 'tools' | 'entertainment';

/** 当前预设：内置预设 id 或 'my'（自定义态） */
export type PresetId = BuiltinPresetId | 'my';

export const BUILTIN_PRESET_IDS: readonly BuiltinPresetId[] = ['default', 'designer', 'developer', 'tools', 'entertainment'];

/**
 * 主页构成快照（第一百零六轮， 第一百一十一轮起含外观）：预设切换与「我的」存档的统一形态——
 * 主页构成（编组+站点、组件构成、布局尺寸/栏位/顺序、组合、摞、卡面样式与组件底色）+ 外观。
 * 明确不含：tasks/plans（计划数据独立，绝不随预设变）。外观（背景预设/明暗/透明度/模糊）
 * 第一百一十一轮起随预设走：切换预设连同外观一起换，改外观同样自动存进「我的」。
 */
export interface CompositionSnapshot {
  groups: NavGroup[];
  widgets: WidgetId[];
  widgetLayouts: Record<WidgetId, WidgetLayout>;
  groupLayouts: Record<string, WidgetLayout>;
  cardOrder: string[];
  cardCols: Record<string, number>;
  combos: ComboItem[];
  widgetStacks: WidgetStackItem[];
  cardFaceStyles: Record<string, CardFaceStyle>;
  widgetTints: Record<string, WidgetTintValue>;
  appearance: PresetAppearance;
}

/** 从整份 store 数据里摘出主页构成快照（浅摘引用，落盘/应用前由调用方 structuredClone） */
export function compositionOf(d: StoreData): CompositionSnapshot {
  return {
    groups: d.groups,
    widgets: d.widgets,
    widgetLayouts: d.widgetLayouts,
    groupLayouts: d.groupLayouts,
    cardOrder: d.cardOrder,
    cardCols: d.cardCols,
    combos: d.combos,
    widgetStacks: d.widgetStacks,
    cardFaceStyles: d.cardFaceStyles,
    widgetTints: d.widgetTints,
    appearance: appearanceOf(d, getDisplayPrefs()),
  };
}

/**
 * 构成指纹（第一百零六轮，预设状态机专用）：判断「构成是否被改动过」。
 * 只覆盖用户定版的构成口径（编组/站点、组件构成、布局、顺序/栏位、组合与摞的成员关系）；
 * 组合/摞的当前 tab、卡面样式与组件底色不算构成改动（切个 tab、换个底色不该把预设打回自定义）。
 * 第一百一十一轮起另含外观（背景预设 + 显示偏好五项）：背景走 update() 故指纹直接覆盖；
 * 显示偏好走 displayPrefs 独立通道，由 useLocalStore 的订阅桥接进同一翻转逻辑。
 */
function compositionFingerprint(d: StoreData): string {
  return JSON.stringify({
    groups: d.groups,
    widgets: d.widgets,
    widgetLayouts: d.widgetLayouts,
    groupLayouts: d.groupLayouts,
    cardOrder: d.cardOrder,
    cardCols: d.cardCols,
    combos: d.combos.map((c) => [c.id, c.groupIds]),
    widgetStacks: d.widgetStacks.map((s) => [s.id, s.widgetIds]),
    appearance: appearanceOf(d, getDisplayPrefs()),
  });
}

/** 主页卡片的稳定 key：编组用 group id、原生组件用 widget key，加前缀防撞 */
export const groupCardKey = (groupId: string) => `group:${groupId}`;
export const widgetCardKey = (widgetId: WidgetId) => `widget:${widgetId}`;
/** 组合卡的稳定 key（顺序与尺寸布局都按这个 key 存） */
export const comboCardKey = (comboId: string) => `combo:${comboId}`;
/** 组件摞的稳定 key（顺序与尺寸布局都按这个 key 存） */
export const widgetStackCardKey = (stackId: string) => `wstack:${stackId}`;

/**
 * 把已存顺序与当前应有的卡片集合（defaultOrder）对齐：
 * 已存且仍存在的在前（过滤掉已删除/已隐藏的），新出现的卡片按默认顺序追加到末尾。
 */
export function resolveCardOrder(stored: string[], defaultOrder: string[]): string[] {
  const existing = new Set(defaultOrder);
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const key of stored) {
    if (existing.has(key) && !seen.has(key)) {
      resolved.push(key);
      seen.add(key);
    }
  }
  for (const key of defaultOrder) {
    if (!seen.has(key)) {
      resolved.push(key);
      seen.add(key);
    }
  }
  return resolved;
}

export const ALL_WIDGETS: { id: WidgetId; name: string; desc: string }[] = [
  // 名称与卡面标题统一为「计划」（组件规范第 7 节收编口径，第七十四轮）；UI 显示名以 widgetRegistry 注册表为准
  { id: 'task', name: '计划', desc: '待办、日程表与推进表小工具' },
  { id: 'news', name: 'AI 资讯', desc: '今日最热头条 + 热门榜单' },
  { id: 'trending', name: '热门话题', desc: '社区热门话题帖子数' },
  { id: 'tools', name: '文件工具', desc: 'PDF 转图片/长图、图片转 PDF、合并与拆分' },
  { id: 'colors', name: '中式色卡', desc: '158 种中国传统色：色墙浏览、传统配色、一键复制色值' },
];

const STORAGE_KEY = 'ainav-store-v1';
const DEFAULT_WIDGETS: WidgetId[] = ['task', 'news', 'trending', 'tools'];

const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 给缺少 id 的站点补稳定 ID（种子与导入共用，就地修改传入对象） */
function ensureSiteIds(groups: NavGroup[]): NavGroup[] {
  for (const group of groups) {
    for (const site of group.sites) {
      if (!site.id) site.id = genId('s');
    }
  }
  return groups;
}

/**
 * 站点标签迁移（第二十六轮单标签；第七十六轮改多标签，种子与校验共用，就地修改）：
 * 新字段 tags 优先逐项清洗（仅英文字母/大写/≤4、去重、最多 2 个）；无 tags 时读旧单字段 tag
 * 迁成单元素数组；两者皆无但带更旧的 needVpn 标记 → ['VPN']。迁移后旧字段 tag 一律删除，
 * 此后徽标只认 tags；无标签则删字段（不显示徽标）。
 * 本函数在种子生成、本地加载校验、导入/同步校验三处都会跑，老格式（含云端旧文件）自动无损升级。
 */
function migrateSiteTags(groups: NavGroup[]): NavGroup[] {
  for (const group of groups) {
    for (const site of group.sites) {
      let tags = cleanSiteTags(site.tags);
      if (!tags.length) tags = cleanSiteTags(site.tag);
      if (!tags.length && site.needVpn) tags = ['VPN'];
      if (tags.length) site.tags = tags;
      else delete site.tags;
      delete site.tag;
    }
  }
  return groups;
}

/** 种子/预设共用的编组制备（第一百零六轮抽出）：深克隆后补站点 id + 标签迁移，入参不被修改 */
export function prepareGroups(groups: NavGroup[]): NavGroup[] {
  return migrateSiteTags(ensureSiteIds(structuredClone(groups)));
}

/**
 * 默认主页构成（第一百零九轮）：用户 live 布局，seedData（新访客/恢复默认）与
 * 默认预设（data/presets.ts）同源共用——两边逐项一致。
 * 来源：用户导出的 ainav-data.json live 构成（组、站点、顺序、尺寸、栏位、组合、摞）。
 * 不含：widgetTints（底色属显示偏好，不进预设）、background、tasks/plans、旧 myPreset 快照。
 * 相对种子编组的组级差异只两处：编程工具改列表卡、图像/视频文件夹小角颜色；
 * 其余三套预设仍用种子编组原样（编程工具在程序员预设里仍是文件夹卡），
 * 故这里只对默认构成做覆盖，不动 data/groups.ts 的种子本身。
 */
export function defaultPresetGroups(): NavGroup[] {
  const groups = prepareGroups(navGroups);
  const code = groups.find((g) => g.id === 'code');
  if (code) code.display = 'list';
  const image = groups.find((g) => g.id === 'image');
  if (image) image.tabColor = '#e0655a';
  const video = groups.find((g) => g.id === 'video');
  if (video) video.tabColor = '#8b6fd8';
  return groups;
}

/** 默认主页的小组件尺寸（用户 live 布局：计划 2×2、资讯 1×2，其余同缺省） */
export const DEFAULT_PRESET_WIDGET_LAYOUTS: Record<WidgetId, WidgetLayout> = {
  task: { colSpan: 2, heightUnits: 2 },
  news: { colSpan: 1, heightUnits: 2 },
  trending: { colSpan: 2, heightUnits: 1 },
  tools: { colSpan: 2, heightUnits: 1 },
  colors: { colSpan: 2, heightUnits: 1 },
};

/** 默认主页的编组/组合/摞尺寸（用户 live 布局：编程工具 1×2、组合 1×1、摞 1×2） */
export const DEFAULT_PRESET_GROUP_LAYOUTS: Record<string, WidgetLayout> = {
  code: { colSpan: 1, heightUnits: 2 },
  'combo:c-mvm8celnynhjv': { colSpan: 1, heightUnits: 1 },
};

/** 默认主页的卡片顺序（用户 live 布局） */
export const DEFAULT_PRESET_CARD_ORDER: string[] = [
  'group:ai-chat',
  'widget:task',
  'combo:c-mvm8celnynhjv',
  'group:writing',
  'group:audio',
  'group:office',
  'widget:news',
  'widget:trending',
  'widget:tools',
  'group:code',
];

/** 默认主页的栏锚点（用户 live 布局） */
export const DEFAULT_PRESET_CARD_COLS: Record<string, number> = {
  'group:ai-chat': 0,
  'widget:task': 2,
  'group:image': 3,
  'widget:news': 2,
  'group:video': 0,
  'group:writing': 1,
  'group:code': 3,
  'group:audio': 3,
  'group:office': 2,
  'widget:trending': 0,
  'widget:tools': 0,
  'combo:c-mvm8celnynhjv': 0,
};

/** 默认主页的组合（用户 live 布局：图像 + 视频，当前 tab 图像） */
export const DEFAULT_PRESET_COMBOS: ComboItem[] = [
  { id: 'c-mvm8celnynhjv', groupIds: ['image', 'video'], activeGroupId: 'image' },
];

/** 默认主页的资讯为独立卡片；组件摞至少需要两个成员。 */
export const DEFAULT_PRESET_WIDGET_STACKS: WidgetStackItem[] = [];

function seedData(): StoreData {
  return {
    version: 1,
    groups: defaultPresetGroups(),
    widgets: [...DEFAULT_WIDGETS],
    widgetLayouts: structuredClone(DEFAULT_PRESET_WIDGET_LAYOUTS),
    groupLayouts: structuredClone(DEFAULT_PRESET_GROUP_LAYOUTS),
    cardOrder: [...DEFAULT_PRESET_CARD_ORDER],
    cardCols: { ...DEFAULT_PRESET_CARD_COLS },
    background: { ...DEFAULT_BACKGROUND },
    updatedAt: Date.now(),
    tasks: [],
    plans: [],
    cardFaceStyles: {},
    combos: structuredClone(DEFAULT_PRESET_COMBOS),
    widgetStacks: structuredClone(DEFAULT_PRESET_WIDGET_STACKS),
    widgetTints: {},
    // 新装即默认预设的主页（构成与默认预设同源），「我的」尚无存档
    activePreset: 'default',
    myPreset: null,
  };
}

/**
 * 归一化 widgetLayouts：从默认值出发，仅采纳合法的已存值（旧数据无此字段时全走默认）。
 * 宽度上限为 2 栏：第三轮存量数据里的 4 栏在加载时自动夹到 2，老用户数据不破版。
 */
function normalizeWidgetLayouts(raw: unknown): Record<WidgetId, WidgetLayout> {
  const layouts = structuredClone(DEFAULT_WIDGET_LAYOUTS);
  if (raw && typeof raw === 'object') {
    for (const w of ALL_WIDGETS) {
      const l = (raw as Record<string, { colSpan?: unknown; heightUnits?: unknown } | undefined>)[w.id];
      if (!l) continue;
      if (l.colSpan === 1) layouts[w.id].colSpan = 1;
      else if (typeof l.colSpan === 'number' && l.colSpan >= 2) layouts[w.id].colSpan = 2;
      if (l.heightUnits === 1 || l.heightUnits === 2) layouts[w.id].heightUnits = l.heightUnits;
    }
  }
  return layouts;
}

/** 渲染/写入侧的宽度上限保护：任何来源的 colSpan 都不超过 2 栏 */
export function clampColSpan(span: number | undefined): 1 | 2 {
  return span !== undefined && span >= 2 ? 2 : 1;
}

/** 归一化一个布局值：非法字段逐项回落到 fallback（宽度同样夹到 ≤2 栏） */
function normalizeLayout(raw: unknown, fallback: WidgetLayout): WidgetLayout {
  const layout: WidgetLayout = { ...fallback };
  if (raw && typeof raw === 'object') {
    const l = raw as { colSpan?: unknown; heightUnits?: unknown };
    if (l.colSpan === 1) layout.colSpan = 1;
    else if (typeof l.colSpan === 'number' && l.colSpan >= 2) layout.colSpan = 2;
    if (l.heightUnits === 1 || l.heightUnits === 2) layout.heightUnits = l.heightUnits;
  }
  return layout;
}

/** 归一化卡片栏锚点（第三十四轮）：只采纳有限数值，夹到 0–3 并取整；老数据无此字段时为空表（待迁移） */
function normalizeCardCols(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(3, Math.floor(v)));
    }
  }
  return out;
}

/** 归一化 groupLayouts：老数据无此字段时为空表（各组回落 DEFAULT_GROUP_LAYOUT）；逐组采纳合法值 */
function normalizeGroupLayouts(raw: unknown): Record<string, WidgetLayout> {
  const out: Record<string, WidgetLayout> = {};
  if (raw && typeof raw === 'object') {
    for (const [gid, l] of Object.entries(raw as Record<string, unknown>)) {
      if (l && typeof l === 'object') out[gid] = normalizeLayout(l, DEFAULT_GROUP_LAYOUT);
    }
  }
  return out;
}

/**
 * 图标路径迁移（第一百轮）：中文名图标文件已改 ASCII 名（扩展包不解码非 ASCII 路径），
 * 另 minimax 误引用 .png 一并纠正。老存档里存的旧路径在校验时统一重写——
 * 加载/导入/同步共用 validateStoreData 一条路径，三处同时生效。
 */
const LEGACY_LOGO_PATHS: Record<string, string> = {
  '/icon_APP/元气AI.png': '/icon_APP/yuanqi-ai.png',
  '/元气AI.png': '/icon_APP/yuanqi-ai.png',
  '/icon_APP/有道龙虾.svg': '/icon_APP/youdao-longxia.svg',
  '/有道龙虾.svg': '/icon_APP/youdao-longxia.svg',
  '/icon_APP/海螺.png': '/icon_APP/hailuo.png',
  '/icon_APP/盒豚生活.png': '/icon_APP/hetun-life.png',
  '/icon_APP/秘塔写作.png': '/icon_APP/mita-writing.png',
  '/icon_APP/腾讯混元.svg': '/icon_APP/tencent-hunyuan.svg',
  '/icon_APP/minimax.png': '/icon_APP/minimax.svg',
};

/** 旧图标路径 → 新路径（存的是百分号编码形式时先解码再查表） */
export function migrateLegacyLogoPath(logo: string): string {
  const direct = LEGACY_LOGO_PATHS[logo];
  if (direct) return direct;
  try {
    const decoded = decodeURIComponent(logo);
    if (decoded !== logo) return LEGACY_LOGO_PATHS[decoded] ?? logo;
  } catch {
    // 编码非法时原样保留
  }
  return logo;
}

/**
 * 编组字段归一化（第一百零六轮从 validateStoreData 抽出，主数据 groups 与「我的」
 * 存档快照里的 groups 共用同一条校验/迁移路径）：结构非法（组/站点缺必填）整体返回 null；
 * 形态/副标题/小角颜色/图标配置等逐项做向后兼容清洗，最后统一补站点 id、迁移标签。
 */
function normalizeGroupsField(raw: unknown): NavGroup[] | null {
  if (!Array.isArray(raw)) return null;
  const data = { groups: raw };
  for (const group of data.groups as NavGroup[]) {
    if (!group || typeof group.id !== 'string' || typeof group.name !== 'string' || !Array.isArray(group.sites)) {
      return null;
    }
    // 形态字段向后兼容：新字段 display 优先；旧数据只有 type 时迁移过来；
    // 两者都缺时按种子呈现补默认（AI 对话 = list，其余 = stack）
    const legacy = group as NavGroup & { type?: unknown };
    if (legacy.display !== 'list' && legacy.display !== 'stack') {
      legacy.display =
        legacy.type === 'list' || legacy.type === 'stack'
          ? legacy.type
          : legacy.id === 'ai-chat'
            ? 'list'
            : 'stack';
    }
    delete legacy.type;
    // 自定义副标题向后兼容：老数据无此字段时默认为空字符串（卡面回落显示站点数）
    if (typeof group.subtitle !== 'string') group.subtitle = '';
    // 小角颜色向后兼容：只接受 #rrggbb，其余（老数据无此字段）一律回落空 = 默认灰
    if (typeof group.tabColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(group.tabColor)) group.tabColor = '';
    for (const site of group.sites as SiteEntry[]) {
      if (!site || typeof site.name !== 'string' || typeof site.url !== 'string') return null;
      if (typeof site.description !== 'string') site.description = '';
      if (typeof site.logo !== 'string' || !site.logo) site.logo = logoForSite(site.name, site.url);
      // 图标路径迁移（第一百轮）：老存档的中文名/误引用路径重写为现行路径
      site.logo = migrateLegacyLogoPath(site.logo);
      if (typeof site.frequency !== 'number') site.frequency = 0;
      // 图标配置（第四十九轮）：只保留合法组合，脏数据（模式不对/图片不是 data URL/体积失控）整组丢弃回 auto
      if (site.iconMode !== 'text' && site.iconMode !== 'upload') {
        delete site.iconMode;
        delete site.iconText;
        delete site.iconImage;
      } else if (site.iconMode === 'text') {
        if (typeof site.iconText !== 'string' || ![...site.iconText.trim()].length) delete site.iconMode;
        else site.iconText = [...site.iconText.trim()].slice(0, 2).join('');
        delete site.iconImage;
      } else {
        if (
          typeof site.iconImage !== 'string' ||
          !site.iconImage.startsWith('data:image/') ||
          site.iconImage.length > 262144
        ) {
          delete site.iconMode;
          delete site.iconImage;
        }
        delete site.iconText;
      }
    }
  }
  return migrateSiteTags(ensureSiteIds(data.groups as NavGroup[]));
}

/** 当前预设归一化：合法 id 采纳，其余（老存档无此字段等）一律 'my'——既有排版即用户的「我的」 */
function normalizeActivePreset(raw: unknown): PresetId {
  return raw === 'my' || (BUILTIN_PRESET_IDS as readonly string[]).includes(raw as string)
    ? (raw as PresetId)
    : 'my';
}

/** 构成快照归一化（「我的」存档）：逐字段走与主数据相同的归一器；结构非法整体返回 null（视为无存档）。
 *  第一百一十一轮：快照含 appearance；老快照缺此字段时按调用方给的当前全局外观补齐，不重置用户外观 */
function normalizeSnapshot(raw: unknown, appearanceFallback: PresetAppearance): CompositionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<CompositionSnapshot>;
  const groups = normalizeGroupsField(s.groups);
  if (!groups) return null;
  const widgets = Array.isArray(s.widgets)
    ? (s.widgets.filter((w) => ALL_WIDGETS.some((aw) => aw.id === w)) as WidgetId[])
    : [...DEFAULT_WIDGETS];
  const rawOrder = s.cardOrder as unknown;
  return {
    groups,
    widgets,
    widgetLayouts: normalizeWidgetLayouts(s.widgetLayouts),
    groupLayouts: normalizeGroupLayouts(s.groupLayouts),
    cardOrder: Array.isArray(rawOrder) ? (rawOrder.filter((k) => typeof k === 'string') as string[]) : [],
    cardCols: normalizeCardCols(s.cardCols),
    combos: normalizeCombos(s.combos, groups),
    widgetStacks: normalizeWidgetStacks(s.widgetStacks, widgets),
    cardFaceStyles: normalizeCardFaceStyles(s.cardFaceStyles),
    widgetTints: normalizeWidgetTints(s.widgetTints),
    appearance: normalizeAppearance(s.appearance) ?? structuredClone(appearanceFallback),
  };
}

/** 校验任意来源（localStorage / 导入文件）的数据结构，合法则归一化返回，否则 null */
export function validateStoreData(raw: unknown): StoreData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<StoreData>;
  if (data.version !== 1 || !Array.isArray(data.groups)) return null;
  const groups = normalizeGroupsField(data.groups);
  if (!groups) return null;
  const widgets = Array.isArray(data.widgets)
    ? (data.widgets.filter((w) => ALL_WIDGETS.some((aw) => aw.id === w)) as WidgetId[])
    : [...DEFAULT_WIDGETS];
  const widgetLayouts = normalizeWidgetLayouts((data as { widgetLayouts?: unknown }).widgetLayouts);
  const groupLayouts = normalizeGroupLayouts((data as { groupLayouts?: unknown }).groupLayouts);
  // 卡片顺序：老数据无此字段时为空（回落默认顺序）；只采纳字符串元素
  const rawOrder = (data as { cardOrder?: unknown }).cardOrder;
  const cardOrder = Array.isArray(rawOrder) ? (rawOrder.filter((k) => typeof k === 'string') as string[]) : [];
  // 旧默认预设误把资讯存成单成员摞，渲染时摞被过滤，资讯因此被追加到末尾。
  // 仅修复默认预设的旧标记；自定义布局和已有的资讯顺序不改动。
  const legacyNewsStack = 'wstack:ws-mvm8czz1m8o8n';
  if (data.activePreset === 'default' && cardOrder.includes(legacyNewsStack) && !cardOrder.includes('widget:news')) {
    cardOrder.splice(cardOrder.indexOf(legacyNewsStack), 1);
    const office = cardOrder.indexOf('group:office');
    const trending = cardOrder.indexOf('widget:trending');
    const insertAt = office >= 0 ? office + 1 : trending >= 0 ? trending : cardOrder.length;
    cardOrder.splice(insertAt, 0, 'widget:news');
  }
  const background = normalizeBackground((data as { background?: unknown }).background);
  const cardCols = normalizeCardCols((data as { cardCols?: unknown }).cardCols);
  return {
    version: 1,
    groups,
    widgets,
    widgetLayouts,
    groupLayouts,
    cardOrder,
    cardCols,
    background,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    tasks: normalizeTasks((data as { tasks?: unknown }).tasks),
    plans: normalizePlans((data as { plans?: unknown }).plans),
    cardFaceStyles: normalizeCardFaceStyles((data as { cardFaceStyles?: unknown }).cardFaceStyles),
    combos: normalizeCombos((data as { combos?: unknown }).combos, groups),
    widgetStacks: normalizeWidgetStacks((data as { widgetStacks?: unknown }).widgetStacks, widgets),
    widgetTints: normalizeWidgetTints((data as { widgetTints?: unknown }).widgetTints),
    activePreset: normalizeActivePreset((data as { activePreset?: unknown }).activePreset),
    myPreset: normalizeSnapshot((data as { myPreset?: unknown }).myPreset, fallbackAppearance(background.presetId)),
  };
}

/** 长期计划分类删除的一次性清空标记（2026-10-26 用户定：旧计划全部删掉）：
    独立 key，不进同步 JSON；只在首次加载新版时清一次，之后新计划正常读写 */
const PLANS_RESET_KEY = 'ainav-plans-reset-20261026';

function loadInitial(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = validateStoreData(JSON.parse(raw));
      if (parsed) {
        // 首次加载新版：旧计划（日期型 + 次数型）全部清空，待办与其它数据不动；
        // 清空结果立即落盘，后续同步也会把空计划推上去；标记写失败时下次加载再清
        try {
          if (!localStorage.getItem(PLANS_RESET_KEY)) {
            localStorage.setItem(PLANS_RESET_KEY, '1');
            if (parsed.plans.length > 0) {
              parsed.plans = [];
              localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            }
          }
        } catch {
          /* 忽略，下次加载再清，不影响本次显示 */
        }
        return parsed;
      }
    }
  } catch {
    // 存储损坏/不可用时回落种子
  }
  return seedData();
}

/** 用户新增站点的图标：优先内置映射，其次站点 favicon，再由 SiteLogo 兜底 */
export function logoForSite(name: string, url: string): string {
  return autoSiteLogo(name, url);
}

export interface SiteDraft {
  name: string;
  url: string;
  description: string;
  /** 别名：表单已无编辑入口（第二十六轮），编辑时由表单原样回传既有别名，不清除 */
  aliases: string[];
  pinned: boolean;
  /** 站点标签（第二十六轮单标签；第七十六轮多标签）：最多 2 个，落盘前经 cleanSiteTags 清洗 */
  tags: string[];
  /** 图标来源（第四十九轮）：auto = 自动管线；text = iconText 字母图；upload = iconImage 上传图 */
  iconMode: 'auto' | 'text' | 'upload';
  iconText: string;
  iconImage: string;
  /** auto 模式下表单「重新检索」得到的新 logo（空 = 保存时按既有管线处理） */
  autoLogo: string;
}

/** 图标配置落盘（第四十九轮）：auto 不留字段（行为与改版前一致）；text/upload 写对应字段、清另一个 */
function applyDraftIcon(site: SiteEntry, draft: SiteDraft): void {
  if (draft.iconMode === 'text' && [...draft.iconText.trim()].length) {
    site.iconMode = 'text';
    site.iconText = [...draft.iconText.trim()].slice(0, 2).join('');
    delete site.iconImage;
  } else if (draft.iconMode === 'upload' && draft.iconImage.startsWith('data:image/')) {
    site.iconMode = 'upload';
    site.iconImage = draft.iconImage;
    delete site.iconText;
  } else {
    delete site.iconMode;
    delete site.iconText;
    delete site.iconImage;
  }
}

/** 外观基线（第一百一十一轮，模块级、单 store 实例共用）：显示偏好走独立通道，
 *  订阅桥接靠它判断本次偏好变化是否真的改了外观；在 update()/applyPreset()/resetData()
 *  三处同步（背景改动、预设应用、恢复默认都会改外观），首渲染用初始数据定下。 */
let lastAppearance: PresetAppearance | null = null;
/** 应用预设写显示偏好时的抑制旗（第一百一十一轮）：应用本身不是「改动外观」，不能被桥接误翻为自定义 */
let suppressAppearanceFlip = false;

export function useLocalStore() {
  const [data, setData] = useState<StoreData>(loadInitial);
  const dataRef = useRef(data);
  dataRef.current = data;
  if (lastAppearance === null) lastAppearance = appearanceOf(data, getDisplayPrefs());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 存储空间不足等情况下静默失败，不阻断使用
    }
  }, [data]);

  /* 显示偏好订阅桥接（第一百一十一轮）：偏好改动同样走自动保存语义——
   * 内置预设期翻为 'my' 并刷新快照，本来就在 'my' 时同样刷新快照；
   * 与基线相等（点已激活项、无实际变化）不触发；计划内容不走此通道，永不触发。 */
  useEffect(() => {
    return subscribeDisplayPrefs((prefs) => {
      if (suppressAppearanceFlip || !lastAppearance) return;
      const nextAppearance: PresetAppearance = {
        background: { presetId: lastAppearance.background.presetId, oceanColor: prefs.oceanColor },
        theme: prefs.theme,
        groupCardAlpha: prefs.groupCardAlpha,
        widgetAlpha: prefs.widgetAlpha,
        bgBlur: prefs.bgBlur,
      };
      if (JSON.stringify(nextAppearance) === JSON.stringify(lastAppearance)) return;
      lastAppearance = nextAppearance;
      setData((prev) => {
        const next = structuredClone(prev);
        next.activePreset = 'my';
        next.myPreset = structuredClone(compositionOf(next));
        next.updatedAt = Date.now();
        return next;
      });
    });
  }, []);

  const update = useCallback((fn: (d: StoreData) => StoreData) => {
    setData((prev) => {
      const next = fn(structuredClone(prev));
      // 每次用户变更都刷新时间戳：GitHub 同步靠它判断本地/云端谁更新
      next.updatedAt = Date.now();
      /* 预设状态机（第一百零六轮建、第一百零九轮改语义：预设一有变化自动变「我的」，
       * 并且自动保存「我的」；第一百一十一轮起外观同样触发）：任一经 update() 的构成
       * 或外观变更（增删改编组/站点、改尺寸、拖拽排序、合并/拆分、换背景等）都立即翻为
       * 'my' 并把当前构成存进 myPreset——内置预设期如此，本来就在 'my' 时同样刷新快照，
       * 「我的」恒等于当前排版。显示偏好不走 update()，由订阅桥接进同一逻辑。
       * 计划内容不改指纹，不触发。静默写回（栏锚点补写/迁移、底色补抽走 setData 直写）
       * 不经此处，不会误翻误存。 */
      if (compositionFingerprint(next) !== compositionFingerprint(prev)) {
        next.activePreset = 'my';
        next.myPreset = structuredClone(compositionOf(next));
      }
      lastAppearance = appearanceOf(next, getDisplayPrefs());
      return next;
    });
  }, []);

  const addSite = useCallback(
    (groupId: string, draft: SiteDraft) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (group) {
          const minFreq = group.sites.reduce((min, s) => Math.min(min, s.frequency), 0);
          const tags = cleanSiteTags(draft.tags);
          const site: SiteEntry = {
            id: genId('s'),
            name: draft.name,
            url: draft.url,
            description: draft.description,
            logo: draft.autoLogo || logoForSite(draft.name, draft.url),
            aliases: draft.aliases,
            pinned: draft.pinned,
            frequency: Math.min(0, minFreq) - 1,
            ...(tags.length ? { tags } : {}),
          };
          applyDraftIcon(site, draft);
          group.sites.push(site);
        }
        return d;
      });
    },
    [update],
  );

  const updateSite = useCallback(
    (groupId: string, siteId: string, draft: SiteDraft) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        const site = group?.sites.find((s) => s.id === siteId);
        if (group && site) {
          const wasPinned = !!site.pinned;
          site.name = draft.name;
          site.url = draft.url;
          site.description = draft.description;
          site.aliases = draft.aliases;
          site.pinned = draft.pinned;
          // 图标（第四十九轮）：表单带回的 autoLogo 优先（「重新检索」或名称/网址变更时表单已重取）；
          // 没带回则维持既有 logo，不再每次保存都无条件重算（图标已可手动管理）
          site.logo = draft.autoLogo || site.logo || logoForSite(draft.name, draft.url);
          applyDraftIcon(site, draft);
          // 标签：清洗后落盘（最多 2 个），全不选即移除标签（徽标随之消失）；旧单字段一并清掉
          const tags = cleanSiteTags(draft.tags);
          if (tags.length) site.tags = tags;
          else delete site.tags;
          delete site.tag;
          /* 置顶状态变化时换区落位（第三十八轮，配合区内拖动排序的分区模型）：
           * 新置顶 → 进置顶区末尾；取消置顶 → 进普通区开头。其余编辑不改变位置。 */
          if (!!draft.pinned !== wasPinned) {
            group.sites = group.sites.filter((s) => s !== site);
            if (draft.pinned) {
              const lastPinned = group.sites.map((s) => !!s.pinned).lastIndexOf(true);
              group.sites.splice(lastPinned + 1, 0, site);
            } else {
              const pinnedTotal = group.sites.filter((s) => s.pinned).length;
              group.sites.splice(pinnedTotal, 0, site);
            }
          }
        }
        return d;
      });
    },
    [update],
  );

  /**
   * 组内站点手动排序落盘（第三十八轮）：入参为完整的显示顺序（站点 id 数组，
   * 已由拖动侧按置顶分区夹好）。存储数组即显示顺序（sortSites 只做置顶分区稳定划分），
   * 这里再按 pinned 稳定分区一次兜底，保证任何调用方传错序也不会跨区；
   * 未出现在入参里的站点按原相对顺序补在末尾，未知 id 忽略。
   */
  const reorderSites = useCallback(
    (groupId: string, orderedIds: string[]) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (!group) return d;
        const byId = new Map<string, SiteEntry>();
        for (const s of group.sites) if (s.id) byId.set(s.id, s);
        const picked: SiteEntry[] = [];
        for (const id of orderedIds) {
          const site = id ? byId.get(id) : undefined;
          if (site) {
            picked.push(site);
            byId.delete(id);
          }
        }
        const next = [...picked, ...group.sites.filter((s) => byId.has(s.id))];
        group.sites = [...next.filter((s) => s.pinned), ...next.filter((s) => !s.pinned)];
        return d;
      });
    },
    [update],
  );

  const deleteSite = useCallback(
    (groupId: string, siteId: string) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (group) group.sites = group.sites.filter((s) => s.id !== siteId);
        return d;
      });
    },
    [update],
  );

  /** 跨组移动（长按 1 秒拖拽）：源组取出、目标组末尾追加，属性（置顶等）原样保留；同组/不存在 = 不动 */
  const moveSite = useCallback(
    (fromGroupId: string, siteId: string, toGroupId: string) => {
      if (fromGroupId === toGroupId) return;
      update((d) => {
        const from = d.groups.find((g) => g.id === fromGroupId);
        const to = d.groups.find((g) => g.id === toGroupId);
        if (!from || !to) return d;
        const idx = from.sites.findIndex((s) => s.id === siteId);
        if (idx < 0) return d;
        const [site] = from.sites.splice(idx, 1);
        to.sites = [...to.sites, site];
        return d;
      });
    },
    [update],
  );

  const addGroup = useCallback((name: string, display: GroupDisplay): string => {
    const id = genId('g');
    update((d) => {
      d.groups.push({ id, name, display, subtitle: '', tabColor: '', sites: [] });
      return d;
    });
    return id;
  }, [update]);

  const setGroupDisplay = useCallback(
    (groupId: string, display: GroupDisplay) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (!group || group.display === display) return d;
        // 第一百一十二轮：切换只换显示方式、不动尺寸。B/C 共用 groupLayouts 一条存条、
        // 但缺省值不同（C 1×1、B 2×2）：无存条的组若不先写死，切换后尺寸会被缺省值带跑。
        // 因此切换时先把旧形态下的当前有效尺寸写进存条，有存条的组不动。
        if (d.groupLayouts[groupId] === undefined) {
          d.groupLayouts[groupId] =
            group.display === 'stack'
              ? { ...stackLayoutOf(d.groupLayouts, groupId) }
              : { ...groupLayoutOf(d.groupLayouts, groupId) };
        }
        group.display = display;
        return d;
      });
    },
    [update],
  );

  const setWidgetLayout = useCallback(
    (widgetId: WidgetId, patch: Partial<WidgetLayout>) => {
      update((d) => {
        const cur = d.widgetLayouts[widgetId] ?? DEFAULT_WIDGET_LAYOUTS[widgetId];
        const next = { ...cur, ...patch };
        next.colSpan = clampColSpan(next.colSpan);
        d.widgetLayouts[widgetId] = next;
        return d;
      });
    },
    [update],
  );

  /** 编组右键改尺寸：按 groupId 存占位（宽度夹到 ≤2 栏）；
   *  合并基底按 display 取缺省——stack 组是 1 栏 × 1x，只改高度时不能把宽度带成 B 卡默认的 2 栏 */
  const setGroupLayout = useCallback(
    (groupId: string, patch: Partial<WidgetLayout>) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        const fallback = group?.display === 'stack' ? DEFAULT_STACK_LAYOUT : DEFAULT_GROUP_LAYOUT;
        const cur = d.groupLayouts[groupId] ?? fallback;
        const next = { ...cur, ...patch };
        next.colSpan = clampColSpan(next.colSpan);
        d.groupLayouts[groupId] = next;
        return d;
      });
    },
    [update],
  );

  const renameGroup = useCallback(
    (groupId: string, name: string) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (group) group.name = name;
        return d;
      });
    },
    [update],
  );

  /** 设置编组自定义副标题（C 卡卡面第二行）；空字符串 = 回落显示「N 个站点」 */
  const setGroupSubtitle = useCallback(
    (groupId: string, subtitle: string) => {
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (group) group.subtitle = subtitle;
        return d;
      });
    },
    [update],
  );

  /** 设置编组文件夹小角颜色（空字符串 = 默认同色灰）；非法值不落盘 */
  const setGroupTabColor = useCallback(
    (groupId: string, color: string) => {
      const safe = color === '' || /^#[0-9a-fA-F]{6}$/.test(color) ? color : '';
      update((d) => {
        const group = d.groups.find((g) => g.id === groupId);
        if (group) group.tabColor = safe;
        return d;
      });
    },
    [update],
  );

  const deleteGroup = useCallback(
    (groupId: string) => {
      update((d) => {
        // 删掉组合的成员组时组合随之解散（第二十一轮联动）：另一组以普通卡留在组合原来的位置
        for (const combo of d.combos.filter((c) => c.groupIds.includes(groupId))) {
          const otherId = combo.groupIds.find((id) => id !== groupId);
          d.combos = d.combos.filter((c) => c.id !== combo.id);
          delete d.groupLayouts[comboCardKey(combo.id)];
          // 栏锚点（第三十四轮）：另一组继承组合所在的栏，删组合锚点
          const comboCol = d.cardCols[comboCardKey(combo.id)];
          if (comboCol !== undefined && otherId) d.cardCols[groupCardKey(otherId)] = comboCol;
          delete d.cardCols[comboCardKey(combo.id)];
          const idx = d.cardOrder.indexOf(comboCardKey(combo.id));
          if (idx >= 0 && otherId) d.cardOrder.splice(idx, 1, groupCardKey(otherId));
        }
        d.groups = d.groups.filter((g) => g.id !== groupId);
        return d;
      });
    },
    [update],
  );

  /* ---------- C 卡组合（第二十一轮） ---------- */

  /**
   * 合并两个文件夹式编组：拖拽 dragged 充能满 2 秒后压住 target 松手时调用（第三十七轮时长口径）。
   * 组合落在 target 的位置；groupIds = [dragged, target]——被拖来的组放左 tab 且默认选中（与用户示意图一致）；
   * 组合尺寸继承 target 当前尺寸（存 groupLayouts 的 combo key；成员各自的布局条目不动，拆分时自然恢复）。
   */
  const mergeCombo = useCallback(
    (draggedId: string, targetId: string, currentOrder: string[]) => {
      if (draggedId === targetId) return;
      update((d) => {
        const dg = d.groups.find((g) => g.id === draggedId);
        const tg = d.groups.find((g) => g.id === targetId);
        if (!dg || !tg || dg.display !== 'stack' || tg.display !== 'stack') return d;
        if (d.combos.some((c) => c.groupIds.includes(draggedId) || c.groupIds.includes(targetId))) return d;
        const id = genId('c');
        d.combos.push({ id, groupIds: [draggedId, targetId], activeGroupId: draggedId });
        d.groupLayouts[comboCardKey(id)] = { ...stackLayoutOf(d.groupLayouts, targetId) };
        // 栏锚点（第三十四轮）：组合落在 target 所在的栏；成员锚点先保留，拆分时以组合锚点为准重写
        const targetCol = d.cardCols[groupCardKey(targetId)] ?? d.cardCols[groupCardKey(draggedId)];
        if (targetCol !== undefined) d.cardCols[comboCardKey(id)] = targetCol;
        const order = currentOrder.filter((k) => k !== groupCardKey(draggedId));
        const ti = order.indexOf(groupCardKey(targetId));
        if (ti >= 0) order[ti] = comboCardKey(id);
        else order.push(comboCardKey(id));
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /** 拆分组合：组合条目原位替换回两个组条目（原左右顺序），删组合记录与其尺寸条目 */
  const splitCombo = useCallback(
    (comboId: string, currentOrder: string[]) => {
      update((d) => {
        const combo = d.combos.find((c) => c.id === comboId);
        if (!combo) return d;
        d.combos = d.combos.filter((c) => c.id !== comboId);
        delete d.groupLayouts[comboCardKey(comboId)];
        // 栏锚点（第三十四轮）：两个组都回到组合所在的栏（顺序由 cardOrder 决定上下），删组合锚点
        const comboCol = d.cardCols[comboCardKey(comboId)];
        if (comboCol !== undefined) {
          for (const gid of combo.groupIds) d.cardCols[groupCardKey(gid)] = comboCol;
        }
        delete d.cardCols[comboCardKey(comboId)];
        const order = [...currentOrder];
        const idx = order.indexOf(comboCardKey(comboId));
        const keys = combo.groupIds.map((gid) => groupCardKey(gid));
        if (idx >= 0) order.splice(idx, 1, ...keys);
        else order.push(...keys);
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /** 组合内某组切成详细列表时脱离组合：另一组变回普通 C 卡留在组合位，该组（已是 B 卡）排在其后，删组合记录 */
  const detachComboMemberAsList = useCallback(
    (comboId: string, groupId: string, currentOrder: string[]) => {
      update((d) => {
        const combo = d.combos.find((c) => c.id === comboId);
        if (!combo || !combo.groupIds.includes(groupId)) return d;
        const otherId = combo.groupIds.find((id) => id !== groupId);
        d.combos = d.combos.filter((c) => c.id !== comboId);
        delete d.groupLayouts[comboCardKey(comboId)];
        // 栏锚点（第三十四轮）：留下的一组与脱离的一组都先落在组合原来的栏（顺序紧邻），删组合锚点
        const comboCol = d.cardCols[comboCardKey(comboId)];
        if (comboCol !== undefined) {
          if (otherId) d.cardCols[groupCardKey(otherId)] = comboCol;
          d.cardCols[groupCardKey(groupId)] = comboCol;
        }
        delete d.cardCols[comboCardKey(comboId)];
        const order = [...currentOrder];
        const idx = order.indexOf(comboCardKey(comboId));
        const keys = otherId ? [groupCardKey(otherId), groupCardKey(groupId)] : [groupCardKey(groupId)];
        if (idx >= 0) order.splice(idx, 1, ...keys);
        else order.push(...keys);
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /**
   * tab 拖出落定（第二十一轮修订新增的解组方式）：把某组从组合中拖出成独立卡，
   * 组合随之解散、另一组留作普通 C 卡；落点顺序以拖拽预览的最终顺序为准
   * （预览里组合条目已拆成两个组条目，这里只做兜底校正）。
   * 栏锚点（第三十四轮）：colsPatch 为拖拽预览给出的两组最终栏位（被拖组 = 落点栏，
   * 另一组 = 组合原来的栏）；缺省时两组都回落到组合原来的栏。
   */
  const extractComboGroup = useCallback(
    (comboId: string, groupId: string, finalOrder: string[], colsPatch: Record<string, number> = {}) => {
      update((d) => {
        const combo = d.combos.find((c) => c.id === comboId);
        if (!combo || !combo.groupIds.includes(groupId)) return d;
        d.combos = d.combos.filter((c) => c.id !== comboId);
        delete d.groupLayouts[comboCardKey(comboId)];
        const comboCol = d.cardCols[comboCardKey(comboId)];
        if (comboCol !== undefined) {
          for (const gid of combo.groupIds) d.cardCols[groupCardKey(gid)] = comboCol;
        }
        delete d.cardCols[comboCardKey(comboId)];
        for (const [k, v] of Object.entries(colsPatch)) {
          if (Number.isFinite(v)) d.cardCols[k] = Math.max(0, Math.min(3, Math.floor(v)));
        }
        const order = finalOrder.filter((k) => k !== comboCardKey(comboId));
        for (const gid of combo.groupIds) {
          const k = groupCardKey(gid);
          if (!order.includes(k)) order.push(k);
        }
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /** 切换组合当前 tab（持久化，刷新/跨设备同步后保持） */
  const setComboActive = useCallback(
    (comboId: string, groupId: string) => {
      update((d) => {
        const combo = d.combos.find((c) => c.id === comboId);
        if (combo && combo.groupIds.includes(groupId)) combo.activeGroupId = groupId;
        return d;
      });
    },
    [update],
  );

  /** 组合卡右键改尺寸：按 combo key 存 groupLayouts，缺省同 C 卡（1 栏 × 1x），宽度夹到 ≤2 栏 */
  const setComboLayout = useCallback(
    (comboId: string, patch: Partial<WidgetLayout>) => {
      update((d) => {
        const key = comboCardKey(comboId);
        const cur = d.groupLayouts[key] ?? DEFAULT_STACK_LAYOUT;
        const next = { ...cur, ...patch };
        next.colSpan = clampColSpan(next.colSpan);
        d.groupLayouts[key] = next;
        return d;
      });
    },
    [update],
  );

  /* ---------- A 型组件摞（第七十二轮） ---------- */

  /**
   * 合并小组件（拖拽充能后压住目标松手时调用）：
   * - 目标是单个组件：新建摞落在 target 的位置与栏，尺寸继承 target 当前组件尺寸；
   *   成员顺序 = [target, ...被拖方成员]，当前成员 = target（被压住的那张保持显示）。
   * - 目标已是摞：被拖方成员依次追加到摞尾，摞的位置/尺寸/当前成员全不变。
   * - 被拖方是摞：整摞成员一并并入，被拖摞的尺寸/栏条目随之删除。
   * 合并后总成员数超过上限（WIDGET_STACK_MAX）整次拒绝；成员各自的布局条目
   * （widgetLayouts）与底色不动，拆分/移出时自然恢复各自尺寸。
   */
  const mergeWidgetEntities = useCallback(
    (dragged: WidgetMergeEntity, target: WidgetMergeEntity, currentOrder: string[]) => {
      if (dragged.type === target.type && dragged.id === target.id) return;
      update((d) => {
        const stackOf = (wid: WidgetId) => d.widgetStacks.find((s) => s.widgetIds.includes(wid));
        const dragStack = dragged.type === 'stack' ? d.widgetStacks.find((s) => s.id === dragged.id) : undefined;
        const targetStack = target.type === 'stack' ? d.widgetStacks.find((s) => s.id === target.id) : undefined;
        if (dragged.type === 'stack' && !dragStack) return d;
        if (target.type === 'stack' && !targetStack) return d;
        if (dragStack && targetStack && dragStack.id === targetStack.id) return d;
        // 实体若报的是单个组件，它必须尚未入摞（入摞成员没有独立卡面，正常路径到不了这里）
        if (dragged.type === 'widget' && stackOf(dragged.id)) return d;
        if (target.type === 'widget' && stackOf(target.id)) return d;
        const dragMembers: WidgetId[] = dragged.type === 'stack' ? [...dragStack!.widgetIds] : [dragged.id];
        const targetMembers: WidgetId[] = target.type === 'stack' ? [...targetStack!.widgetIds] : [target.id];
        if (dragMembers.some((m) => targetMembers.includes(m))) return d;
        if (dragMembers.length + targetMembers.length > WIDGET_STACK_MAX) return d;
        const dragKey = dragged.type === 'stack' ? widgetStackCardKey(dragged.id) : widgetCardKey(dragged.id);
        const targetKey = target.type === 'stack' ? widgetStackCardKey(target.id) : widgetCardKey(target.id);
        // 被拖方是摞：其摞记录与布局/栏条目一并收掉（成员本身的条目保留）
        if (dragStack) {
          d.widgetStacks = d.widgetStacks.filter((s) => s.id !== dragStack.id);
          delete d.groupLayouts[widgetStackCardKey(dragStack.id)];
          delete d.cardCols[widgetStackCardKey(dragStack.id)];
        }
        if (targetStack) {
          targetStack.widgetIds = [...targetStack.widgetIds, ...dragMembers];
          d.cardOrder = currentOrder.filter((k) => k !== dragKey);
          return d;
        }
        const id = genId('ws');
        const key = widgetStackCardKey(id);
        d.widgetStacks.push({
          id,
          widgetIds: [target.id as WidgetId, ...dragMembers],
          activeWidgetId: target.id as WidgetId,
        });
        d.groupLayouts[key] = { ...d.widgetLayouts[target.id as WidgetId] };
        const targetCol = d.cardCols[widgetCardKey(target.id as WidgetId)];
        if (targetCol !== undefined) d.cardCols[key] = targetCol;
        const order = currentOrder.filter((k) => k !== dragKey);
        const ti = order.indexOf(targetKey);
        if (ti >= 0) order[ti] = key;
        else order.push(key);
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /** 拆分组件摞：摞条目原位替换回全部成员条目（成员顺序），删摞记录与其尺寸条目；成员各自尺寸条目未动、自然恢复 */
  const splitWidgetStack = useCallback(
    (stackId: string, currentOrder: string[]) => {
      update((d) => {
        const stack = d.widgetStacks.find((s) => s.id === stackId);
        if (!stack) return d;
        d.widgetStacks = d.widgetStacks.filter((s) => s.id !== stackId);
        const key = widgetStackCardKey(stackId);
        delete d.groupLayouts[key];
        const col = d.cardCols[key];
        if (col !== undefined) {
          for (const wid of stack.widgetIds) d.cardCols[widgetCardKey(wid)] = col;
        }
        delete d.cardCols[key];
        const order = [...currentOrder];
        const idx = order.indexOf(key);
        const keys = stack.widgetIds.map((wid) => widgetCardKey(wid));
        if (idx >= 0) order.splice(idx, 1, ...keys);
        else order.push(...keys);
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /**
   * 从摞里移出单个成员：成员恢复独立卡、排在摞后面（栏同摞）；
   * 移出后摞只剩 1 个成员时整摞解散——剩余成员与移出者依次排在摞原位。
   */
  const extractWidgetFromStack = useCallback(
    (stackId: string, widgetId: WidgetId, currentOrder: string[]) => {
      update((d) => {
        const stack = d.widgetStacks.find((s) => s.id === stackId);
        if (!stack || !stack.widgetIds.includes(widgetId)) return d;
        const key = widgetStackCardKey(stackId);
        const col = d.cardCols[key];
        const remaining = stack.widgetIds.filter((w) => w !== widgetId);
        const order = [...currentOrder];
        const idx = order.indexOf(key);
        if (remaining.length >= 2) {
          stack.widgetIds = remaining;
          if (stack.activeWidgetId === widgetId) stack.activeWidgetId = remaining[0];
          if (col !== undefined) d.cardCols[widgetCardKey(widgetId)] = col;
          if (idx >= 0) order.splice(idx + 1, 0, widgetCardKey(widgetId));
          else order.push(widgetCardKey(widgetId));
        } else {
          d.widgetStacks = d.widgetStacks.filter((s) => s.id !== stackId);
          delete d.groupLayouts[key];
          delete d.cardCols[key];
          const keys =
            remaining.length === 1 ? [widgetCardKey(remaining[0]), widgetCardKey(widgetId)] : [widgetCardKey(widgetId)];
          if (col !== undefined) {
            for (const k of keys) d.cardCols[k] = col;
          }
          if (idx >= 0) order.splice(idx, 1, ...keys);
          else order.push(...keys);
        }
        d.cardOrder = order;
        return d;
      });
    },
    [update],
  );

  /** 切换摞的当前成员（点顶部标题排，持久化，刷新/跨设备同步后保持） */
  const setWidgetStackActive = useCallback(
    (stackId: string, widgetId: WidgetId) => {
      update((d) => {
        const stack = d.widgetStacks.find((s) => s.id === stackId);
        if (stack && stack.widgetIds.includes(widgetId)) stack.activeWidgetId = widgetId;
        return d;
      });
    },
    [update],
  );

  /** 摞右键改尺寸：按 wstack key 存 groupLayouts（成员各自尺寸条目不动），宽度夹到 ≤2 栏 */
  const setWidgetStackLayout = useCallback(
    (stackId: string, patch: Partial<WidgetLayout>) => {
      update((d) => {
        const key = widgetStackCardKey(stackId);
        const cur = d.groupLayouts[key] ?? DEFAULT_STACK_LAYOUT;
        const next = { ...cur, ...patch };
        next.colSpan = clampColSpan(next.colSpan);
        d.groupLayouts[key] = next;
        return d;
      });
    },
    [update],
  );

  /** 切换背景：选预设或标记使用本地图片（图片本体在 IndexedDB，由调用方先存好） */
  const setBackground = useCallback(
    (next: BackgroundSetting) => {
      update((d) => {
        d.background = normalizeBackground(next);
        return d;
      });
    },
    [update],
  );

  /** 拖拽排序后保存主页卡片顺序（传入的是已与当前卡片集合对齐的完整顺序） */
  const setCardOrder = useCallback(
    (order: string[]) => {
      update((d) => {
        d.cardOrder = [...order];
        return d;
      });
    },
    [update],
  );

  /**
   * 拖拽落盘（第三十四轮）：一次写入最终顺序 + 被拖卡的栏锚点补丁（colsPatch 只含本次变化的 key）。
   * 走 update()：这是用户编辑，刷新 updatedAt 供同步裁决。
   */
  const setCardPlacement = useCallback(
    (order: string[], colsPatch: Record<string, number>) => {
      update((d) => {
        d.cardOrder = [...order];
        for (const [k, v] of Object.entries(colsPatch)) {
          if (Number.isFinite(v)) d.cardCols[k] = Math.max(0, Math.min(3, Math.floor(v)));
        }
        return d;
      });
    },
    [update],
  );

  /**
   * 静默补写栏锚点（第三十四轮）：放置引擎回落/夹取出的锚点与已存值不一致时由 HomePage 调用。
   * 直写 setData 且不刷新 updatedAt——回落不是用户编辑，不应触发同步冲突裁决；
   * 补丁与现状完全一致时返回原对象（不触发重渲染）。
   */
  const ensureCardCols = useCallback((patch: Record<string, number>) => {
    setData((prev) => {
      let changed = false;
      const next = { ...prev.cardCols };
      for (const [k, v] of Object.entries(patch)) {
        if (!Number.isFinite(v)) continue;
        const c = Math.max(0, Math.min(3, Math.floor(v)));
        if (next[k] !== c) {
          next[k] = c;
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, cardCols: next };
    });
  }, []);

  /**
   * 存量迁移落盘（第三十四轮）：cardCols 为空时，HomePage 按旧瀑布流位置生成
   * （顺序, 锚点）并经此一次性写入；已有锚点时不覆盖。静默写入，不刷新 updatedAt。
   */
  const applyCardMigration = useCallback((order: string[], cols: Record<string, number>) => {
    setData((prev) => {
      if (Object.keys(prev.cardCols).length > 0) return prev;
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(cols)) {
        if (Number.isFinite(v)) clean[k] = Math.max(0, Math.min(3, Math.floor(v)));
      }
      if (Object.keys(clean).length === 0) return prev;
      return { ...prev, cardOrder: [...order], cardCols: clean };
    });
  }, []);

  /**
   * 静默补写小组件底色（第二十三轮）：HomePage 渲染前为缺底色的已显示组件抽好色后调用。
   * 直写 setData 且不刷新 updatedAt——补抽不是用户编辑，不应触发同步冲突裁决
   * （底色随 store.data 整体在下一次同步/导出时自然带走）；与现状一致时返回原对象防循环。
   */
  const ensureWidgetTints = useCallback((patch: Record<string, number>) => {
    setData((prev) => {
      let changed = false;
      const next = { ...prev.widgetTints };
      for (const [k, v] of Object.entries(patch)) {
        if (!Number.isInteger(v) || v < 0 || v >= WIDGET_TINTS.length) continue;
        if (next[k] === undefined) {
          next[k] = v;
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, widgetTints: next };
    });
  }, []);

  /** 「换个底色」（第二十三轮，右键菜单）：用户主动重抽，走 update() 正常落盘（索引非法不写） */
  const setWidgetTint = useCallback(
    (cardKey: string, index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= WIDGET_TINTS.length) return;
      update((d) => {
        d.widgetTints[cardKey] = index;
        return d;
      });
    },
    [update],
  );

  /** 自定义双色（第九十一轮，选色面板边选边存）：任一色值非法整次不写；走 update() 正常落盘 */
  const setWidgetTintCustom = useCallback(
    (cardKey: string, from: string, to: string) => {
      const c = sanitizeWidgetTintCustom({ kind: 'custom', from, to });
      if (!c) return;
      update((d) => {
        d.widgetTints[cardKey] = c;
        return d;
      });
    },
    [update],
  );

  const setWidgetVisible = useCallback(
    (widgetId: WidgetId, visible: boolean) => {
      update((d) => {
        const set = new Set(d.widgets);
        if (visible) set.add(widgetId);
        else set.delete(widgetId);
        // 保持 ALL_WIDGETS 的固有顺序，布局稳定
        d.widgets = ALL_WIDGETS.map((w) => w.id).filter((id) => set.has(id));
        /* 组件摞联动（第七十二轮）：从主页移除正在摞中的成员时同步把它摘出摞——
         * 摞还剩 ≥2 个则摞保留（当前成员被摘时改指第一个剩余成员）；只剩 1 个则整摞
         * 解散，剩余成员顶替摞在顺序/栏上的位置。重新添加该组件时按独立卡回来，不自动回摞 */
        if (!visible) {
          const stack = d.widgetStacks.find((s) => s.widgetIds.includes(widgetId));
          if (stack) {
            const remaining = stack.widgetIds.filter((w) => w !== widgetId);
            const key = widgetStackCardKey(stack.id);
            if (remaining.length >= 2) {
              stack.widgetIds = remaining;
              if (stack.activeWidgetId === widgetId) stack.activeWidgetId = remaining[0];
            } else {
              d.widgetStacks = d.widgetStacks.filter((s) => s.id !== stack.id);
              delete d.groupLayouts[key];
              const col = d.cardCols[key];
              delete d.cardCols[key];
              if (remaining.length === 1) {
                if (col !== undefined) d.cardCols[widgetCardKey(remaining[0])] = col;
                const idx = d.cardOrder.indexOf(key);
                if (idx >= 0) d.cardOrder.splice(idx, 1, widgetCardKey(remaining[0]));
              }
            }
          }
        }
        return d;
      });
    },
    [update],
  );

  /* ---------- 计划任务小工具（第十八轮；第十九轮：待办分组 + 计划两型） ---------- */

  const addTask = useCallback(
    (title: string) => {
      const t = title.trim();
      if (!t) return;
      update((d) => {
        d.tasks.push({ id: genId('t'), title: t, done: false, createdAt: Date.now() });
        return d;
      });
    },
    [update],
  );

  /** 新建空组（children 为空数组即成组，之后往里加子任务） */
  const addTaskGroup = useCallback(
    (title: string) => {
      const t = title.trim();
      if (!t) return;
      update((d) => {
        d.tasks.push({ id: genId('t'), title: t, done: false, createdAt: Date.now(), children: [] });
        return d;
      });
    },
    [update],
  );

  const addSubTask = useCallback(
    (taskId: string, title: string) => {
      const t = title.trim();
      if (!t) return;
      update((d) => {
        const task = d.tasks.find((x) => x.id === taskId);
        if (task && Array.isArray(task.children)) {
          task.children.push({ id: genId('tc'), title: t, done: false });
        }
        return d;
      });
    },
    [update],
  );

  const toggleSubTask = useCallback(
    (taskId: string, childId: string) => {
      update((d) => {
        const child = d.tasks.find((x) => x.id === taskId)?.children?.find((c) => c.id === childId);
        if (child) child.done = !child.done;
        return d;
      });
    },
    [update],
  );

  const deleteSubTask = useCallback(
    (taskId: string, childId: string) => {
      update((d) => {
        const task = d.tasks.find((x) => x.id === taskId);
        if (task && Array.isArray(task.children)) {
          task.children = task.children.filter((c) => c.id !== childId);
        }
        return d;
      });
    },
    [update],
  );

  /** 勾选普通待办；组没有独立勾选态，调用到组上时忽略（完成态由子任务推导） */
  const toggleTask = useCallback(
    (taskId: string) => {
      update((d) => {
        const task = d.tasks.find((t) => t.id === taskId);
        if (task && !Array.isArray(task.children)) task.done = !task.done;
        return d;
      });
    },
    [update],
  );

  /** 改标题：普通待办与组共用（组改名也走这里） */
  const renameTask = useCallback(
    (taskId: string, title: string) => {
      const t = title.trim();
      if (!t) return;
      update((d) => {
        const task = d.tasks.find((x) => x.id === taskId);
        if (task) task.title = t;
        return d;
      });
    },
    [update],
  );

  /** 删除顶层条目：删组时连子任务一起删 */
  const deleteTask = useCallback(
    (taskId: string) => {
      update((d) => {
        d.tasks = d.tasks.filter((t) => t.id !== taskId);
        return d;
      });
    },
    [update],
  );

  /** 清空全部已完成待办（第四十八轮，「已完成」分组头右键删除）：
   * 顶层已完成条目（普通待办 done / 整组全勾）整条删除；未全勾的组保留结构，
   * 只摘掉组内已勾的子项；未完成项与空组不动 */
  const clearCompletedTasks = useCallback(() => {
    update((d) => {
      d.tasks = d.tasks
        .filter((t) => !taskEntryDone(t))
        .map((t) =>
          Array.isArray(t.children) ? { ...t, children: t.children.filter((c) => !c.done) } : t,
        );
      return d;
    });
  }, [update]);

  /** 拖拽合并（第五十四轮落盘口径；第五十七轮按用户口径改命名/归属规则）：
   * - 普通 × 普通：不再让目标就地升组——新建组自动命名「小组N」（N = 现有「小组k」组最大 k + 1，
   *   没有则 1），新组落在 target 原来的位置，两条都成为它的子任务，顺序 [target, source]，
   *   各自完成态原样带入（子任务 id 沿用原条目 id）。
   * - 普通拖到组上：成为该组子任务追加末尾，组名不变（同第五十四轮）。
   * - 组拖到普通上：普通成为该组子任务追加末尾，组名不变、组保持原位，普通从顶层消失。
   * - 组 × 组：维持第五十四轮平铺——source 自身（完成态取推导值）+ 其子任务依次追加进 target，组名不变。
   * source===target 或任一不存在时忽略 */
  const mergeTaskIntoGroup = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      update((d) => {
        const source = d.tasks.find((t) => t.id === sourceId);
        const target = d.tasks.find((t) => t.id === targetId);
        if (!source || !target) return d;
        const sourceIsGroup = isTaskGroup(source);
        const targetIsGroup = isTaskGroup(target);
        if (!sourceIsGroup && !targetIsGroup) {
          let maxSeq = 0;
          for (const t of d.tasks) {
            if (!isTaskGroup(t)) continue;
            const m = /^小组(\d+)$/.exec(t.title);
            if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
          }
          const newGroup: TaskItem = {
            id: genId('t'),
            title: `小组${maxSeq + 1}`,
            done: false,
            createdAt: target.createdAt,
            children: [
              { id: target.id, title: target.title, done: target.done },
              { id: source.id, title: source.title, done: source.done },
            ],
          };
          d.tasks = d.tasks.filter((t) => t.id !== sourceId);
          const idx = d.tasks.findIndex((t) => t.id === targetId);
          d.tasks.splice(idx, 1, newGroup);
          return d;
        }
        if (!sourceIsGroup && targetIsGroup) {
          target.children!.push({ id: source.id, title: source.title, done: source.done });
          d.tasks = d.tasks.filter((t) => t.id !== sourceId);
          return d;
        }
        if (sourceIsGroup && !targetIsGroup) {
          source.children!.push({ id: target.id, title: target.title, done: target.done });
          d.tasks = d.tasks.filter((t) => t.id !== targetId);
          return d;
        }
        const flat: TaskChild[] = [
          { id: source.id, title: source.title, done: taskGroupDone(source) },
        ];
        for (const c of source.children ?? []) flat.push({ id: c.id, title: c.title, done: c.done });
        target.children!.push(...flat);
        d.tasks = d.tasks.filter((t) => t.id !== sourceId);
        return d;
      });
    },
    [update],
  );

  /** 新建长期计划（第十九轮两型）：count 带目标数+单位；date 带目标日，startDate 记今天；
      date 型可带可选开始/结束时间（推进表时间轴用，不填即全天）与可选事件日（日程按事件日排，不填则用截止日） */
  const addPlan = useCallback(
    (
      title: string,
      opts: {
        mode: PlanMode;
        targetCount?: number;
        unit?: string;
        deadline?: string;
        startDate?: string;
        startTime?: string;
        endTime?: string;
        eventDate?: string;
      },
    ) => {
      const t = title.trim();
      if (!t) return;
      update((d) => {
        if (opts.mode === 'date') {
          if (!isDateStr(opts.deadline)) return d;
          const cleanTime = (v: unknown) =>
            typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
          const st = cleanTime(opts.startTime);
          const et = cleanTime(opts.endTime);
          d.plans.push({
            id: genId('p'),
            title: t,
            mode: 'date',
            deadline: opts.deadline,
            startDate: isDateStr(opts.startDate) ? opts.startDate : todayDateStr(),
            ...(st ? { startTime: st } : {}),
            ...(et && (!st || et > st) ? { endTime: et } : {}),
            ...(isDateStr(opts.eventDate) ? { eventDate: opts.eventDate } : {}),
            done: false,
            createdAt: Date.now(),
          });
        } else {
          const target =
            typeof opts.targetCount === 'number' && opts.targetCount > 0 ? Math.floor(opts.targetCount) : 10;
          d.plans.push({
            id: genId('p'),
            title: t,
            mode: 'count',
            targetCount: target,
            unit: (opts.unit ?? '').trim().slice(0, 4) || '次',
            currentCount: 0,
            createdAt: Date.now(),
          });
        }
        return d;
      });
    },
    [update],
  );

  /** 编辑计划：按其当前类型改标题与目标（次数型的目标/单位、日期型的目标日）；
      日期型可改可选开始/结束时间（空字符串 = 清除该时间）、可选开始日（非法忽略，保留旧值）
      与可选事件日（空字符串 = 清除，回落截止日） */
  const updatePlan = useCallback(
    (
      planId: string,
      patch: {
        title?: string;
        targetCount?: number;
        unit?: string;
        deadline?: string;
        startDate?: string;
        startTime?: string;
        endTime?: string;
        eventDate?: string;
      },
    ) => {
      update((d) => {
        const plan = d.plans.find((p) => p.id === planId);
        if (!plan) return d;
        if (typeof patch.title === 'string' && patch.title.trim()) plan.title = patch.title.trim();
        if (plan.mode === 'count') {
          if (typeof patch.targetCount === 'number' && patch.targetCount > 0) {
            plan.targetCount = Math.floor(patch.targetCount);
          }
          if (typeof patch.unit === 'string') plan.unit = patch.unit.trim().slice(0, 4) || '次';
        } else if (isDateStr(patch.deadline)) {
          plan.deadline = patch.deadline;
        }
        if (plan.mode === 'date') {
          if (isDateStr(patch.startDate)) plan.startDate = patch.startDate;
          if (patch.eventDate !== undefined) {
            if (isDateStr(patch.eventDate)) plan.eventDate = patch.eventDate;
            else delete plan.eventDate;
          }
          const cleanTime = (v: unknown) =>
            typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
          if (patch.startTime !== undefined) {
            const st = cleanTime(patch.startTime);
            if (st) plan.startTime = st;
            else delete plan.startTime;
          }
          if (patch.endTime !== undefined) {
            const et = cleanTime(patch.endTime);
            if (et && (!plan.startTime || et > plan.startTime)) plan.endTime = et;
            else delete plan.endTime;
          }
        }
        return d;
      });
    },
    [update],
  );

  /** 次数型 +1 / −1：夹在 0 与目标之间（到顶即满，−1 供纠错） */
  const bumpPlanCount = useCallback(
    (planId: string, delta: number) => {
      update((d) => {
        const plan = d.plans.find((p) => p.id === planId);
        if (plan && plan.mode === 'count') {
          const target = plan.targetCount ?? 0;
          const next = (plan.currentCount ?? 0) + delta;
          plan.currentCount = Math.max(0, target > 0 ? Math.min(target, next) : next);
        }
        return d;
      });
    },
    [update],
  );

  /** 日期型手动完成 / 取消完成 */
  const setPlanDone = useCallback(
    (planId: string, done: boolean) => {
      update((d) => {
        const plan = d.plans.find((p) => p.id === planId);
        if (plan && plan.mode === 'date') plan.done = done;
        return d;
      });
    },
    [update],
  );

  const deletePlan = useCallback(
    (planId: string) => {
      update((d) => {
        d.plans = d.plans.filter((p) => p.id !== planId);
        return d;
      });
    },
    [update],
  );

  /** AI 整理确认落库：勾选的待办标题与次数型计划草稿一次性写入，走同一次 update（同步只推一次） */
  const addSplitResult = useCallback(
    (todos: string[], planDrafts: { title: string; targetCount: number; unit: string }[]) => {
      update((d) => {
        for (const title of todos) {
          const t = title.trim();
          if (t) d.tasks.push({ id: genId('t'), title: t, done: false, createdAt: Date.now() });
        }
        for (const draft of planDrafts) {
          const t = draft.title.trim();
          if (!t) continue;
          d.plans.push({
            id: genId('p'),
            title: t,
            mode: 'count',
            targetCount: draft.targetCount > 0 ? Math.floor(draft.targetCount) : 10,
            unit: (draft.unit ?? '').trim().slice(0, 4) || '次',
            currentCount: 0,
            createdAt: Date.now(),
          });
        }
        return d;
      });
    },
    [update],
  );

  /** 卡面样式切换（按卡片稳定 key 存，如 widget:task） */
  const setCardFaceStyle = useCallback(
    (cardKey: string, style: CardFaceStyle) => {
      update((d) => {
        d.cardFaceStyles[cardKey] = style;
        return d;
      });
    },
    [update],
  );

  const importData = useCallback((raw: unknown): boolean => {
    const validated = validateStoreData(raw);
    if (!validated) return false;
    setData(validated);
    return true;
  }, []);

  const resetData = useCallback(() => {
    setData(seedData());
    // 恢复默认回到星云紫 + 当前偏好：基线同步跟上，否则下一次偏好比对会拿旧外观作基准
    const prefs = getDisplayPrefs();
    lastAppearance = {
      background: { presetId: DEFAULT_BACKGROUND.presetId, oceanColor: prefs.oceanColor },
      theme: prefs.theme,
      groupCardAlpha: prefs.groupCardAlpha,
      widgetAlpha: prefs.widgetAlpha,
      bgBlur: prefs.bgBlur,
    };
  }, []);

  /**
   * 应用预设（第一百零六轮建、第一百零九轮改语义、第一百一十一轮起含外观）：
   * 一键把整套主页构成 + 外观换成目标快照，计划数据（tasks/plans）一概不动。状态机：
   * - 切到内置预设（须传该预设的构成快照）：若当前是自定义态（activePreset='my'），
   *   先把当前构成存进 myPreset（第一百零九轮起 update() 已在每次改动时自动存过，
   *   此处只是兜底、内容一致）；若当前已在某个内置预设上，直接换、不覆盖存档。
   * - 切到「我的」：恢复 myPreset 存档（含外观）；存档为空（null）时无操作。
   * 直写 setData（不经 update）：应用本身不是「改动构成」，不能被状态机误翻为自定义；
   * 显示偏好经独立通道写（抑制订阅桥接，应用不被误判为外观改动），基线同步为快照外观。
   * 本地图片背景不进预设：应用预设一律回到预设背景（图片本体仍在 IndexedDB）。
   */
  const applyPreset = useCallback((presetId: PresetId, snapshot?: CompositionSnapshot) => {
    const prev = dataRef.current;
    let snap: CompositionSnapshot | null = null;
    if (presetId === 'my') {
      if (!prev.myPreset) return;
      snap = structuredClone(prev.myPreset);
    } else {
      if (!snapshot) return;
      snap = structuredClone(snapshot);
    }
    const savedMy =
      presetId !== 'my' && prev.activePreset === 'my' ? structuredClone(compositionOf(prev)) : null;
    setData((prevData) => {
      const next = structuredClone(prevData);
      if (savedMy) next.myPreset = savedMy;
      next.groups = snap.groups;
      next.widgets = snap.widgets;
      next.widgetLayouts = snap.widgetLayouts;
      next.groupLayouts = snap.groupLayouts;
      next.cardOrder = snap.cardOrder;
      next.cardCols = snap.cardCols;
      next.combos = snap.combos;
      next.widgetStacks = snap.widgetStacks;
      next.cardFaceStyles = snap.cardFaceStyles;
      next.widgetTints = snap.widgetTints;
      next.background = { kind: 'preset', presetId: snap.appearance.background.presetId };
      next.activePreset = presetId;
      next.updatedAt = Date.now();
      return next;
    });
    suppressAppearanceFlip = true;
    try {
      setDisplayPrefs({
        theme: snap.appearance.theme,
        groupCardAlpha: snap.appearance.groupCardAlpha,
        widgetAlpha: snap.appearance.widgetAlpha,
        bgBlur: snap.appearance.bgBlur,
        oceanColor: snap.appearance.background.oceanColor,
      });
    } finally {
      suppressAppearanceFlip = false;
    }
    lastAppearance = structuredClone(snap.appearance);
  }, []);

  return {
    data,
    addSite,
    updateSite,
    deleteSite,
    moveSite,
    reorderSites,
    addGroup,
    renameGroup,
    setGroupSubtitle,
    setGroupTabColor,
    setGroupDisplay,
    deleteGroup,
    mergeCombo,
    splitCombo,
    extractComboGroup,
    detachComboMemberAsList,
    setComboActive,
    setComboLayout,
    mergeWidgetEntities,
    splitWidgetStack,
    extractWidgetFromStack,
    setWidgetStackActive,
    setWidgetStackLayout,
    setWidgetVisible,
    setWidgetLayout,
    setGroupLayout,
    setCardOrder,
    setCardPlacement,
    ensureCardCols,
    applyCardMigration,
    ensureWidgetTints,
    setWidgetTint,
    setWidgetTintCustom,
    setBackground,
    addTask,
    addTaskGroup,
    addSubTask,
    toggleSubTask,
    deleteSubTask,
    toggleTask,
    renameTask,
    deleteTask,
    clearCompletedTasks,
    mergeTaskIntoGroup,
    addPlan,
    updatePlan,
    bumpPlanCount,
    setPlanDone,
    deletePlan,
    addSplitResult,
    setCardFaceStyle,
    importData,
    resetData,
    applyPreset,
  };
}

export type LocalStore = ReturnType<typeof useLocalStore>;
