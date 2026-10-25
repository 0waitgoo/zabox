import { navGroups, type NavGroup } from './groups';
import { toolsByCategory } from './navPool';
import {
  DEFAULT_PRESET_APPEARANCE,
  DEFAULT_PRESET_CARD_COLS,
  DEFAULT_PRESET_CARD_ORDER,
  DEFAULT_PRESET_COMBOS,
  DEFAULT_PRESET_GROUP_LAYOUTS,
  DEFAULT_PRESET_WIDGET_LAYOUTS,
  DEFAULT_PRESET_WIDGET_STACKS,
  DEFAULT_WIDGET_LAYOUTS,
  defaultPresetGroups,
  groupCardKey,
  prepareGroups,
  widgetCardKey,
  type BuiltinPresetId,
  type CompositionSnapshot,
} from '../store/localStore';

/**
 * 主页预设（第一百零六轮）：四套内置预设的构成数据。
 * 预设 = 一份 CompositionSnapshot（编组+站点、组件构成、布局/顺序/栏位），
 * 应用与「我的」存档的机制在 store/localStore.ts（applyPreset），本模块只出数据。
 * 站点条目一律复用现成数据：种子编组（data/groups）与导航页站点池（data/navPool），
 * 不新编 URL、不另存图标；每次 build 都现制一份新快照（prepareGroups 深克隆+补 id），
 * 调用方拿到后可任意改，不会污染源数据。
 */

export interface PresetMeta {
  id: BuiltinPresetId;
  name: string;
  desc: string;
}

/** 内置预设在面板上的展示顺序与文案（「我的」不在此列，文案随存档状态变化、由面板自理） */
export const BUILTIN_PRESET_META: PresetMeta[] = [
  { id: 'default', name: '默认', desc: '热门站点与常用组件的均衡排版' },
  { id: 'designer', name: '设计师', desc: '图像、视频与设计资源优先' },
  { id: 'developer', name: '程序员', desc: '编程工具与开发资讯优先' },
  { id: 'tools', name: '工具', desc: '整页小组件，没有站点编组' },
];

/** 种子默认主页的组件集（默认预设与种子逐点一致用；与 store 的 DEFAULT_WIDGETS 同序） */
const ALL_WIDGET_IDS: CompositionSnapshot['widgets'] = ['task', 'news', 'trending', 'tools'];

/** 全部 A 型组件（工具预设 = 全组件布局，第一百零七轮起含中式色卡） */
const EVERY_WIDGET_IDS: CompositionSnapshot['widgets'] = [...ALL_WIDGET_IDS, 'colors'];

/** 中式色卡在预设里的专属底色：色板第 3 档「赤霞绯梦」（红系，与胭脂同族，设计稿 4.3 定版口径） */
const COLORS_PRESET_TINT = 3;

const defaultWidgetLayouts = () => structuredClone(DEFAULT_WIDGET_LAYOUTS);

/** 按 id 摘种子编组（原对象不改，prepareGroups 统一克隆） */
function seedGroupsByIds(ids: string[]): NavGroup[] {
  return ids
    .map((id) => navGroups.find((g) => g.id === id))
    .filter((g): g is NavGroup => !!g);
}

/**
 * 把导航页池的一个分类包成主页编组（C 型文件夹卡）：站点/图标/URL 全用池里现成的，
 * 频率按池内顺序递减、前两站置顶（与种子编组的编排口径一致）。
 */
function poolGroup(id: string, category: string): NavGroup {
  const entries = toolsByCategory[category] ?? [];
  return {
    id,
    name: category,
    display: 'stack',
    sites: entries.map((t, i) => ({
      name: t.name,
      url: t.url,
      description: t.description,
      logo: t.logo,
      needVpn: t.needVpn,
      pinned: i < 2,
      frequency: 100 - i * 4,
    })),
  };
}

/** 空构成骨架：各预设只写自己与众不同的部分。
 *  第一百一十一轮：四套内置预设的外观统一为星云紫 + 暗夜 + 默认透明度（可预测、不玩花样） */
function baseSnapshot(partial: Partial<CompositionSnapshot>): CompositionSnapshot {
  return {
    groups: [],
    widgets: [],
    widgetLayouts: defaultWidgetLayouts(),
    groupLayouts: {},
    cardOrder: [],
    cardCols: {},
    combos: [],
    widgetStacks: [],
    cardFaceStyles: {},
    widgetTints: {},
    appearance: structuredClone(DEFAULT_PRESET_APPEARANCE),
    ...partial,
  };
}

/**
 * 默认预设（第一百零九轮）：用户 live 布局——与 seedData（新访客/恢复默认）
 * 同源共用 store 里的 DEFAULT_PRESET_* 常量，逐项一致（组、站点、顺序、尺寸、
 * 栏位、组合、摞）。底色不进预设（widgetTints 留空，应用时按既有口径走）。
 */
export function buildDefaultPreset(): CompositionSnapshot {
  return baseSnapshot({
    groups: defaultPresetGroups(),
    widgets: [...ALL_WIDGET_IDS],
    widgetLayouts: structuredClone(DEFAULT_PRESET_WIDGET_LAYOUTS),
    groupLayouts: structuredClone(DEFAULT_PRESET_GROUP_LAYOUTS),
    cardOrder: [...DEFAULT_PRESET_CARD_ORDER],
    cardCols: { ...DEFAULT_PRESET_CARD_COLS },
    combos: structuredClone(DEFAULT_PRESET_COMBOS),
    widgetStacks: structuredClone(DEFAULT_PRESET_WIDGET_STACKS),
  });
}

/**
 * 设计师预设：图像/视频打头，设计四件（AI图片处理/设计素材/设计灵感/配色字体，
 * 数据取自导航页池）与 AI 对话随后；小组件配计划 + 文件工具 + 中式色卡
 * （第一百零七轮：色卡是设计师预设的差异化组件，摆设计灵感之后收尾）。
 * 排版（4 栏）：[图像][视频][AI对话 2宽] / [图片处理][设计素材][AI对话] /
 * [计划][配色字体][文件工具 2宽] / [设计灵感][中式色卡]
 */
export function buildDesignerPreset(): CompositionSnapshot {
  const groups = prepareGroups([
    ...seedGroupsByIds(['image', 'video']),
    poolGroup('imgproc', 'AI图片处理'),
    poolGroup('design-assets', '设计素材'),
    poolGroup('design-inspire', '设计灵感'),
    poolGroup('color-font', '配色字体'),
    ...seedGroupsByIds(['ai-chat']),
  ]);
  return baseSnapshot({
    groups,
    widgets: ['task', 'tools', 'colors'],
    widgetTints: { [widgetCardKey('colors')]: COLORS_PRESET_TINT },
    cardOrder: [
      groupCardKey('image'),
      groupCardKey('video'),
      groupCardKey('ai-chat'),
      groupCardKey('imgproc'),
      groupCardKey('design-assets'),
      widgetCardKey('task'),
      groupCardKey('color-font'),
      widgetCardKey('tools'),
      groupCardKey('design-inspire'),
      widgetCardKey('colors'),
    ],
    cardCols: {
      [groupCardKey('image')]: 0,
      [groupCardKey('video')]: 1,
      [groupCardKey('ai-chat')]: 2,
      [groupCardKey('imgproc')]: 0,
      [groupCardKey('design-assets')]: 1,
      [widgetCardKey('task')]: 0,
      [groupCardKey('color-font')]: 1,
      [widgetCardKey('tools')]: 2,
      [groupCardKey('design-inspire')]: 0,
      [widgetCardKey('colors')]: 1,
    },
  });
}

/**
 * 程序员预设：编程工具置顶放大（2 宽 × 2 高）与 AI 对话并排，AI 资讯放大紧随、
 * 热门话题同列，资讯类占两张大卡；再配 AI开放平台（池取）、AI 办公、AI 写作与文件工具。
 * 排版（4 栏 × 5 行）：[编程 2×2][对话 2×2] / [编程][对话] / [资讯 2×2][计划][开放平台]
 * / [资讯][热门话题 2宽] / [办公][写作][文件工具 2宽]
 */
export function buildDeveloperPreset(): CompositionSnapshot {
  const groups = prepareGroups([
    ...seedGroupsByIds(['code', 'ai-chat']),
    poolGroup('ai-platform', 'AI开放平台'),
    ...seedGroupsByIds(['office', 'writing']),
  ]);
  return baseSnapshot({
    groups,
    widgets: ['task', 'news', 'trending', 'tools'],
    groupLayouts: {
      code: { colSpan: 2, heightUnits: 2 },
    },
    cardOrder: [
      groupCardKey('code'),
      groupCardKey('ai-chat'),
      widgetCardKey('news'),
      widgetCardKey('task'),
      groupCardKey('ai-platform'),
      widgetCardKey('trending'),
      groupCardKey('office'),
      groupCardKey('writing'),
      widgetCardKey('tools'),
    ],
    cardCols: {
      [groupCardKey('code')]: 0,
      [groupCardKey('ai-chat')]: 2,
      [widgetCardKey('news')]: 0,
      [widgetCardKey('task')]: 2,
      [groupCardKey('ai-platform')]: 3,
      [widgetCardKey('trending')]: 2,
      [groupCardKey('office')]: 0,
      [groupCardKey('writing')]: 1,
      [widgetCardKey('tools')]: 2,
    },
  });
}

/**
 * 工具预设：整页只有小组件、没有任何站点编组（全组件，第一百零七轮起含中式色卡）。
 * 计划给 2 宽 × 2 高的大尺寸，资讯 2×2 大卡，
 * 热门话题与文件工具收尾，中式色卡落左栏末位。
 */
export function buildToolsPreset(): CompositionSnapshot {
  return baseSnapshot({
    groups: [],
    widgets: [...EVERY_WIDGET_IDS],
    widgetTints: { [widgetCardKey('colors')]: COLORS_PRESET_TINT },
    widgetLayouts: {
      ...defaultWidgetLayouts(),
      task: { colSpan: 2, heightUnits: 2 },
    },
    cardOrder: [
      widgetCardKey('task'),
      widgetCardKey('news'),
      widgetCardKey('trending'),
      widgetCardKey('tools'),
      widgetCardKey('colors'),
    ],
    cardCols: {
      [widgetCardKey('task')]: 0,
      [widgetCardKey('news')]: 2,
      [widgetCardKey('trending')]: 2,
      [widgetCardKey('tools')]: 2,
      [widgetCardKey('colors')]: 0,
    },
  });
}

/** 按 id 现制一份内置预设快照（每次调用都是全新对象） */
export function buildBuiltinPreset(id: BuiltinPresetId): CompositionSnapshot {
  switch (id) {
    case 'designer':
      return buildDesignerPreset();
    case 'developer':
      return buildDeveloperPreset();
    case 'tools':
      return buildToolsPreset();
    default:
      return buildDefaultPreset();
  }
}
