import { getSiteLogo, navGroups, type NavGroup } from './groups';
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
  { id: 'entertainment', name: '娱乐导航', desc: '视频、动漫、音乐、阅读、游戏与直播' },
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

/**
 * 娱乐导航预设：六个娱乐编组，站点全部取自硬核指南（yinghezhinan.com）
 * 六个分类的详情页外链实测（2026-10-28），只收能直接打开的网站，纯 APP
 * 下载入口的条目不收（预设里放不下下载链接）。组内口径与 poolGroup 一致：
 * 文件夹卡、前两站置顶、频率按顺序递减。
 * 注意：本预设是复用口径的例外——导航页池里没有娱乐分类，站点只能写字面量，
 * URL 均来自源站详情页实测、非编造。
 */
function entertainmentGroups(): NavGroup[] {
  const g = (id: string, name: string, sites: Array<[string, string, string]>): NavGroup => ({
    id,
    name,
    display: 'stack',
    sites: sites.map(([siteName, url, description], i) => ({
      name: siteName,
      url,
      description,
      logo: getSiteLogo(siteName),
      needVpn: false,
      pinned: i < 2,
      frequency: 100 - i * 4,
    })),
  });
  return [
    g('ent-video', '视频', [
      ['看看鸭', 'https://www.kankanya.me/', '高清在线追剧的综合视频网站'],
      ['注视影视', 'https://gaze.red/', '海外影视剧、国内高口碑影视剧资源为主的在线影视网站'],
      ['No视频', 'https://www.novipnoad.uk/', '主打海外影视剧资源，致力于最轻松的追剧体验'],
      ['剧OK', 'https://juok3.top/', '可观看全网影视剧的在线追剧网站'],
      ['真狼影视', 'https://zlys9.top/', '免费的在线追剧网站'],
      ['西瓜影院', 'https://www.xiguadh.com/', '可免费在线观看全网高清影视剧的综合型网站'],
      ['LIBVIO', 'https://www.libvio.io/', '以海外影视资源为主的老牌网站'],
      ['厂长资源', 'https://www.cz4k.com/', '高清、秒播不卡顿的综合型影视资源网站'],
      ['爱壹帆', 'https://iyf.tv/', '面向海外华人用户的综合在线影视网站'],
    ]),
    g('ent-anime', '二次元', [
      ['AniCh动漫弹幕网', 'https://anich.emmmm.eu.org/', '高清片源的追番平台，支持网页、Android、Windows、MacOS、Linux多端'],
      ['月之祠动漫', 'https://www.moonci.com', '专注日漫资源的追番网站'],
      ['动漫窝', 'https://www.dmwo.one/', '提供国漫、日漫、美漫的在线追番网站'],
      ['佩可爱动漫', 'https://ani.pekolove.net/', '以日本动漫在线观看为主的高清动漫网站，适合海外用户'],
      ['西瓜卡通', 'https://www.cnxgct.com/', '4K超清日番、国番、美番在线观看的动漫网站'],
      ['E站弹幕网', 'https://www.ezdmw.org/', '以在线追番为主的二次元分享社区'],
      ['TvTFun', 'https://www.tvtfun.net/', '专注日本番剧的在线追番网站'],
      ['Anime1.me', 'https://anime1.me/', '日番神器：界面简洁、更新速度快的日本动漫网站'],
      ['粤漫之家', 'https://www.ymvid.com/', '专注粤语动画的在线追番网站'],
    ]),
    g('ent-music', '音乐', [
      ['SPlayer', 'https://splayer.uncley.cc/', '网易云音乐第三方播放器，支持网页、Windows、Mac、Linux版本'],
      ['魔力音乐', 'https://yy.juhuang.xyz/', '支持五大平台曲库的在线音乐网站'],
      ['GD音乐台', 'https://music.gdstudio.org', '支持国内外多个平台曲库的在线听歌网站'],
      ['飞鸟·轻音', 'http://music.xn--q35am7h.site/', '试听、下载、MV观看的音乐网站'],
      ['米兔音乐', 'https://www.qqmp3.vip/', '提供歌曲在线试听、免费下载的音乐网站'],
      ['布谷音乐', 'https://www.buguyy.cc', '提供MP3、WAV、Flac等格式的歌曲下载网站'],
      ['mmPlayer', 'https://netease-music.fe-mm.com/#/music/toplist', '网易云音乐第三方在线音乐播放器'],
      ['音乐库', 'http://www.yinyueku.cn/', '网易云第三方网页版音乐播放器，可支持歌单导入、歌词下载'],
      ['昔枫音乐盒', 'https://mu-jie.cc/musicBox/', '以网易云为主的网页版免费在线音乐播放器，支持歌曲免费下载'],
    ]),
    g('ent-reading', '阅读', [
      ['Z-Library', 'https://zh.z2026.ru/', '全球最大的免费在线图书馆，电子书下载必备'],
      ['安娜的档案', 'https://zh.annas-archive.gd/', '世界上最大的开源、开放数据图书馆，提供全球各种电子书、文献等内容供用户下载'],
      ['识典古籍', 'https://www.shidianguji.com/', '古籍在线阅读的网站'],
      ['书格', 'https://www.shuge.org/', '自由开放的古籍数字图书馆'],
      ['鸠摩搜索', 'https://www.jiumodiary.com/', '电子书、文档搜索引擎'],
      ['读书派', 'https://www.dushupai.com/', '提供EPUB、AZW3、MOBI、PDF等格式的免费电子书下载网站'],
      ['SoBooks', 'https://sobooks.cc/', '免费电子书（网盘）下载平台'],
      ['好读', 'https://haodoo.org/', '繁体版电子书资源网站'],
      ['鹿鸣川', 'https://lunarora.com/', '高质量的电子书资源网站'],
      ['电子书之家', 'https://honeypdf.com/', '提供全网电子书、小说免费下载的电子书网站'],
    ]),
    g('ent-game', '游戏', [
      ['Switch520', 'https://www.gamer520.com/', '更新频率很高的switch、pc、ps5、ps4、模拟器游戏下载网站'],
      ['小妖怪分享', 'https://www.xyg688.com/', '主打游戏免费分享的资源网站'],
      ['flysheep资源避难所', 'https://www.flysheep6.com/', '分享单机PC、VR、模拟器等等游戏的免费下载网站'],
      ['机地游戏', 'https://www.jidiyouxi.com/', '单机游戏、Switch游戏资源分享网站'],
      ['蒸汽游戏宝库', 'https://www.steambk.com/', '高质量Steam单机游戏下载站'],
      ['FC图库', 'https://fcpic.nesbbs.com/game.html', '红白机(FC/NES)游戏资源下载的知名老站'],
      ['老机库', 'https://laojiku.com/', '提供FC、PS、Wii、PSP等怀旧游戏资源的网站'],
      ['游仓酷', 'https://yxcku.com/', '专注单机游戏资源、MOD模组的资源分享网站'],
      ['NS头号玩家', 'https://nsthwj.vip/', 'Switch游戏资源分享平台'],
      ['芝士游戏', 'https://www.cheesegame.org/', '免费PC单机游戏资源分享网站'],
    ]),
    g('ent-live', '娱乐', [
      ['TVGarden', 'https://tv.garden/', '全球在线直播电视聚合平台'],
    ]),
  ];
}

export function buildEntertainmentPreset(): CompositionSnapshot {
  const groups = prepareGroups(entertainmentGroups());
  return baseSnapshot({
    groups,
    widgets: ['task', 'news', 'trending', 'tools'],
    cardOrder: [
      groupCardKey('ent-video'),
      groupCardKey('ent-anime'),
      groupCardKey('ent-music'),
      groupCardKey('ent-reading'),
      groupCardKey('ent-game'),
      groupCardKey('ent-live'),
      widgetCardKey('task'),
      widgetCardKey('news'),
      widgetCardKey('trending'),
      widgetCardKey('tools'),
    ],
    cardCols: {
      [groupCardKey('ent-video')]: 0,
      [groupCardKey('ent-anime')]: 1,
      [groupCardKey('ent-music')]: 2,
      [groupCardKey('ent-reading')]: 3,
      [groupCardKey('ent-game')]: 0,
      [groupCardKey('ent-live')]: 1,
      [widgetCardKey('task')]: 2,
      [widgetCardKey('news')]: 3,
      [widgetCardKey('trending')]: 0,
      [widgetCardKey('tools')]: 1,
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
    case 'entertainment':
      return buildEntertainmentPreset();
    default:
      return buildDefaultPreset();
  }
}
