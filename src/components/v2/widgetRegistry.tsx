import React from 'react';
import { ListTodo, Newspaper, Palette, Trophy, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import {
  DEFAULT_WIDGET_LAYOUTS,
  type LocalStore,
  type WidgetId,
  type WidgetLayout,
  type WidgetTint,
} from '../../store/localStore';
import TaskCard from './TaskCard';
import NewsCard from './NewsCard';
import RankingCard from './RankingCard';
import FileToolsCard from './FileToolsCard';
import ColorsCard from './ColorsCard';
import TrendingWidget from '../widgets/TrendingWidget';

/**
 * A 型小组件统一注册表（第七十四轮，组件规范 5.2 落地）：
 * 此前新增一个组件要改四处（localStore 的 WidgetId / ALL_WIDGETS / DEFAULT_WIDGET_LAYOUTS
 * + HomePage 的 renderCardItem switch），本轮收敛为「一个实现文件 + 注册表一行」：
 * - 主页渲染（HomePage.renderCardItem）按本表查定义渲染，不再有 switch；
 * - 组件商店页（WidgetStorePage）的分类/搜索/详情/预览/尺寸选择全部读本表；
 * - 右键尺寸菜单按本表 supportedSizes 过滤可选项（规范 2.2 声明机制）。
 * 数据层的 id 顺序与默认尺寸仍以 localStore 的 ALL_WIDGETS / DEFAULT_WIDGET_LAYOUTS 为
 * 单一事实源（归一化/校验在数据层跑，不能反向依赖 UI 层），本表 defaultLayout 直接引用
 * DEFAULT_WIDGET_LAYOUTS 防漂移；name/desc 以本表为准（商店与菜单标题都读这里）。
 * 社区组件按规范 5.2 先放独立 widgets/ 目录隔离，过审后才在本表登记进主目录。
 */

/** 商店分类（规范 5.3 已定：只有「工具」与「外观」两类） */
export type WidgetCategory = 'tools' | 'appearance';

export const WIDGET_CATEGORIES: { id: WidgetCategory; label: string }[] = [
  { id: 'tools', label: '工具' },
  { id: 'appearance', label: '外观' },
];

/** 组件统一渲染 props（规范 5.2 的 WidgetProps 落地形态）：各组件签名不同，
 *  由注册表里的适配组件把这套统一 props 映射到各自的真实 props，组件本体不感知注册表 */
export interface WidgetRenderProps {
  store: LocalStore;
  onNavigate: (page: string) => void;
  /** 专属底色（由主页/商店按 widgetTints 分配；未分配时为 undefined，组件不叠底色层） */
  tint?: WidgetTint;
  /** 生效布局（存储口径）：主页传已存布局、商店预览传所选尺寸 */
  layout: WidgetLayout;
  delay?: number;
  /** 手机单列呈现：宽按 1 栏传给尺寸感知组件（与主页现状口径一致） */
  phone?: boolean;
}

/** 组件注册定义（字段口径 = 组件规范 5.2 v0.2 定稿） */
export interface WidgetDefinition {
  /** 稳定 id：与 localStore 的 WidgetId 对齐，上线后永不改名（数据 key 绑它） */
  id: WidgetId;
  /** 商店与菜单显示名（与卡面标题统一，规范第 7 节收编口径） */
  name: string;
  /** 一句话简介 */
  desc: string;
  /** 分类：只有 tools / appearance 两类（规范 5.3） */
  category: WidgetCategory;
  /** 商店列表与详情用的 lucide 图标（与卡面标题徽保持同一枚） */
  icon: LucideIcon;
  /** 水印 Emoji（与组件本体渲染时传给底色层的字符一致） */
  watermark: string;
  /** 支持的尺寸声明（规范 2.2 硬性要求）：尺寸菜单与商店尺寸选择只列这里的组合 */
  supportedSizes: WidgetLayout[];
  /** 默认尺寸：必须落在 supportedSizes 内；直接引用数据层 DEFAULT_WIDGET_LAYOUTS */
  defaultLayout: WidgetLayout;
  /** 精选标记（规范 5.4）：只由维护者手动设置，组件作者不自填 */
  featured?: boolean;
  /** 联网声明（规范 4.2 声明制）：只读公共数据地址与用途；不联网则省略 */
  network?: { endpoint: string; purpose: string }[];
  /** 数据声明（规范 4.1）：'store' = 进主仓（缺省）| 'device' = 本机偏好 key | 独立 key 附 key 名与理由 */
  storage?: 'store' | 'device' | { own: string; reason: string };
  /** 组件渲染入口（适配组件，见下方） */
  component: React.ComponentType<WidgetRenderProps>;
}

/** 现状 5 个组件均在四种形态下真实渲染（右键菜单一直全开四档），声明即全集；
 * 收窄声明会触发存量布局夹取（规范 2.2）、改变老用户已存版面，故如实登记全集，
 * 小尺寸下的内容截断是规范第 7 节登记在案的「待补」，不在本轮改动范围 */
const ALL_SIZES: WidgetLayout[] = [
  { colSpan: 1, heightUnits: 1 },
  { colSpan: 1, heightUnits: 2 },
  { colSpan: 2, heightUnits: 1 },
  { colSpan: 2, heightUnits: 2 },
];

/* ---------- 适配组件：统一 props → 各组件真实 props（映射与原 HomePage switch 逐字一致） ---------- */

const TaskWidget: React.ComponentType<WidgetRenderProps> = ({ store, onNavigate, tint, layout, delay = 0, phone }) => (
  <TaskCard
    store={store}
    delay={delay}
    colSpan={phone ? 1 : layout.colSpan}
    heightUnits={layout.heightUnits}
    tint={tint}
    onOpenPlanPage={() => onNavigate('plan')}
  />
);

const NewsWidget: React.ComponentType<WidgetRenderProps> = ({ onNavigate, tint, delay = 0 }) => (
  <NewsCard onNavigate={onNavigate} delay={delay} tint={tint} />
);

const RankingWidget: React.ComponentType<WidgetRenderProps> = ({ tint, delay = 0, layout }) => (
  <RankingCard delay={delay} tint={tint} heightUnits={layout.heightUnits} />
);

const TrendingWidgetAdapter: React.ComponentType<WidgetRenderProps> = ({ tint, layout }) => (
  <TrendingWidget tint={tint} heightUnits={layout.heightUnits} />
);

const ToolsWidget: React.ComponentType<WidgetRenderProps> = ({ tint, layout, delay = 0, phone }) => (
  <FileToolsCard
    delay={delay}
    colSpan={phone ? 1 : layout.colSpan}
    heightUnits={layout.heightUnits}
    tint={tint}
  />
);

const ColorsWidget: React.ComponentType<WidgetRenderProps> = ({ tint, layout, delay = 0, phone }) => (
  <ColorsCard
    delay={delay}
    colSpan={phone ? 1 : layout.colSpan}
    heightUnits={layout.heightUnits}
    tint={tint}
  />
);

/* ---------- 注册表本体（顺序与 localStore 的 ALL_WIDGETS 一致） ---------- */

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    id: 'task',
    // 规范第 7 节收编口径：注册名「今日任务」与卡面标题「计划」统一为卡面名「计划」
    name: '计划',
    desc: '待办、日程表与推进表小工具',
    category: 'tools',
    icon: ListTodo,
    watermark: '📋',
    supportedSizes: ALL_SIZES,
    defaultLayout: DEFAULT_WIDGET_LAYOUTS.task,
    featured: true,
    // 零联网、数据进主仓（tasks/plans），storage 缺省即 'store'
    component: TaskWidget,
  },
  {
    id: 'news',
    name: 'AI 资讯',
    desc: '今日最热头条 + 热门榜单',
    category: 'tools',
    icon: Newspaper,
    watermark: '📰',
    supportedSizes: ALL_SIZES,
    defaultLayout: DEFAULT_WIDGET_LAYOUTS.news,
    featured: true,
    network: [{ endpoint: '/api?type=news', purpose: '本站资讯接口：只读拉取对所有人一致的公共资讯（头条与热榜）' }],
    component: NewsWidget,
  },
  {
    id: 'ranking',
    name: 'AI 软件榜',
    desc: 'Product Hunt 本周真实票数榜',
    category: 'tools',
    icon: Trophy,
    watermark: '🏆',
    supportedSizes: ALL_SIZES,
    defaultLayout: DEFAULT_WIDGET_LAYOUTS.ranking,
    // 运行时零联网：数据是构建期静态文件（api/ranking-data.js，GitHub Actions 每周从 Product Hunt 官方 API 生成），故无 network 声明
    component: RankingWidget,
  },
  {
    id: 'trending',
    name: '热门话题',
    desc: '微博 / 百度真实热榜',
    category: 'tools',
    icon: TrendingUp,
    watermark: '🔥',
    supportedSizes: ALL_SIZES,
    defaultLayout: DEFAULT_WIDGET_LAYOUTS.trending,
    network: [{ endpoint: '/api?type=trends', purpose: '本站话题接口：服务端聚合微博热搜与百度热搜的公开热榜，热度为源站真实值' }],
    component: TrendingWidgetAdapter,
  },
  {
    id: 'tools',
    name: '文件工具',
    desc: 'PDF 转图片/长图、图片转 PDF、合并与拆分',
    category: 'tools',
    icon: Wrench,
    watermark: '🧰',
    supportedSizes: ALL_SIZES,
    defaultLayout: DEFAULT_WIDGET_LAYOUTS.tools,
    // 文件只在浏览器内存处理、不落盘不上传，无持久数据、无联网，故无 network / storage 声明
    component: ToolsWidget,
  },
  {
    id: 'colors',
    name: '中式色卡',
    desc: '158 种中国传统色：色墙浏览、传统配色、一键复制色值',
    category: 'tools',
    icon: Palette,
    watermark: '🎨',
    supportedSizes: ALL_SIZES,
    defaultLayout: DEFAULT_WIDGET_LAYOUTS.colors,
    // 数据随包内置（src/data/traditionalColors.ts）、零联网，故无 network 声明；
    // 收藏/自存配色走独立 key（规范 4.1），同步/导出/导入按 store/widgetStorage.ts 的登记一并处理
    storage: { own: 'ainav-widget-colors-data', reason: '收藏与自存配色是组件自有数据，与站点数据无关，独立迭代/整表清理更稳妥' },
    component: ColorsWidget,
  },
];

/** 按 id 查注册定义（id 均为合法 WidgetId，查不到时回落第一条防崩） */
export function widgetDefOf(id: WidgetId): WidgetDefinition {
  return WIDGET_DEFINITIONS.find((d) => d.id === id) ?? WIDGET_DEFINITIONS[0];
}

/** 尺寸标签（如「2 栏 × 2X」）：商店详情/预览标注与尺寸选择共用 */
export function widgetSizeLabel(layout: WidgetLayout): string {
  return `${layout.colSpan} 栏 × ${layout.heightUnits}X`;
}

/** 两个布局是否同一尺寸（尺寸选择/高亮判定共用） */
export function sameWidgetSize(a: WidgetLayout, b: WidgetLayout): boolean {
  return a.colSpan === b.colSpan && a.heightUnits === b.heightUnits;
}
