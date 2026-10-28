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
/**
 * 娱乐导航预设（2026-10-29 用户定稿）：直接取用户导出的「我的」预设快照
 * （ainav-data-2.json 的 myPreset），逐项原样落模板——组、站点、顺序、尺寸、
 * 栏位、组合、摞、底色、外观全按导出值；唯一改动是删掉已删娱乐组在 cardCols
 * 里的一条残留栏位（该组已不存在，永不生效）。之后点「娱乐导航」即出这套布局：
 * 视频/游戏/二次元为展开列表卡、阅读与音乐合成一个组合卡（阅读为当前 tab）、
 * TVGarden 已挪进视频组、娱乐组已删、小组件只剩计划。
 */
function entertainmentGroups(): NavGroup[] {
  return [
  {
    id: "ent-video", name: "视频", display: "list",
    subtitle: "", tabColor: "",
    sites: [
      {name: "看看鸭", url: "https://www.kankanya.me/", description: "高清在线追剧的综合视频网站", logo: "https://www.kankanya.me/favicon.ico", needVpn: false, pinned: true, frequency: 100, id: "s-mvsfznsyhw0gn"},
      {name: "注视影视", url: "https://gaze.red/", description: "海外影视剧、国内高口碑影视剧资源为主的在线影视网站", logo: "https://gaze.red/favicon.ico", needVpn: false, pinned: true, frequency: 96, id: "s-mvsfznsykudv5"},
      {name: "No视频", url: "https://www.novipnoad.uk/", description: "主打海外影视剧资源，致力于最轻松的追剧体验", logo: "https://www.novipnoad.uk/favicon.ico", needVpn: false, pinned: false, frequency: 92, id: "s-mvsfznsye53eb"},
      {name: "剧OK", url: "https://juok3.top/", description: "可观看全网影视剧的在线追剧网站", logo: "https://juok3.top/favicon.ico", needVpn: false, pinned: false, frequency: 88, id: "s-mvsfznsygv50c"},
      {name: "真狼影视", url: "https://zlys9.top/", description: "免费的在线追剧网站", logo: "https://zlys9.top/favicon.ico", needVpn: false, pinned: false, frequency: 84, id: "s-mvsfznsy7zra5"},
      {name: "西瓜影院", url: "https://www.xiguadh.com/", description: "可免费在线观看全网高清影视剧的综合型网站", logo: "https://www.xiguadh.com/favicon.ico", needVpn: false, pinned: false, frequency: 80, id: "s-mvsfznsyxxi24"},
      {name: "LIBVIO", url: "https://www.libvio.io/", description: "以海外影视资源为主的老牌网站", logo: "https://www.libvio.io/favicon.ico", needVpn: false, pinned: false, frequency: 76, id: "s-mvsfznsy5q12j"},
      {name: "厂长资源", url: "https://www.cz4k.com/", description: "高清、秒播不卡顿的综合型影视资源网站", logo: "https://www.cz4k.com/favicon.ico", needVpn: false, pinned: false, frequency: 72, id: "s-mvsfznsyucyfd"},
      {name: "爱壹帆", url: "https://iyf.tv/", description: "面向海外华人用户的综合在线影视网站", logo: "https://iyf.tv/favicon.ico", needVpn: false, pinned: false, frequency: 68, id: "s-mvsfznsymbnuq"},
      {name: "TVGarden", url: "https://tv.garden/", description: "全球在线直播电视聚合平台", logo: "https://tv.garden/favicon.ico", needVpn: false, pinned: true, frequency: 100, id: "s-mvsfznsyf35il"},
    ],
  },
  {
    id: "ent-anime", name: "二次元", display: "list",
    subtitle: "", tabColor: "",
    sites: [
      {name: "AniCh动漫弹幕网", url: "https://anich.emmmm.eu.org/", description: "高清片源的追番平台，支持网页、Android、Windows、MacOS、Linux多端", logo: "https://anich.emmmm.eu.org/favicon.ico", needVpn: false, pinned: true, frequency: 100, id: "s-mvsfznsynl9tj"},
      {name: "月之祠动漫", url: "https://www.moonci.com", description: "专注日漫资源的追番网站", logo: "https://www.moonci.com/favicon.ico", needVpn: false, pinned: true, frequency: 96, id: "s-mvsfznsyqpig6"},
      {name: "动漫窝", url: "https://www.dmwo.one/", description: "提供国漫、日漫、美漫的在线追番网站", logo: "https://www.dmwo.one/favicon.ico", needVpn: false, pinned: false, frequency: 92, id: "s-mvsfznsyfesto"},
      {name: "佩可爱动漫", url: "https://ani.pekolove.net/", description: "以日本动漫在线观看为主的高清动漫网站，适合海外用户", logo: "https://ani.pekolove.net/favicon.ico", needVpn: false, pinned: false, frequency: 88, id: "s-mvsfznsy8in4p"},
      {name: "西瓜卡通", url: "https://www.cnxgct.com/", description: "4K超清日番、国番、美番在线观看的动漫网站", logo: "https://www.cnxgct.com/favicon.ico", needVpn: false, pinned: false, frequency: 84, id: "s-mvsfznsyb8vo4"},
      {name: "E站弹幕网", url: "https://www.ezdmw.org/", description: "以在线追番为主的二次元分享社区", logo: "https://www.ezdmw.org/favicon.ico", needVpn: false, pinned: false, frequency: 80, id: "s-mvsfznsygqs0j"},
      {name: "TvTFun", url: "https://www.tvtfun.net/", description: "专注日本番剧的在线追番网站", logo: "https://www.tvtfun.net/favicon.ico", needVpn: false, pinned: false, frequency: 76, id: "s-mvsfznsynffcw"},
      {name: "Anime1.me", url: "https://anime1.me/", description: "日番神器：界面简洁、更新速度快的日本动漫网站", logo: "https://anime1.me/favicon.ico", needVpn: false, pinned: false, frequency: 72, id: "s-mvsfznsy9dp8m"},
      {name: "粤漫之家", url: "https://www.ymvid.com/", description: "专注粤语动画的在线追番网站", logo: "https://www.ymvid.com/favicon.ico", needVpn: false, pinned: false, frequency: 68, id: "s-mvsfznsyvggiv"},
    ],
  },
  {
    id: "ent-music", name: "音乐", display: "stack",
    subtitle: "", tabColor: "",
    sites: [
      {name: "SPlayer", url: "https://splayer.uncley.cc/", description: "网易云音乐第三方播放器，支持网页、Windows、Mac、Linux版本", logo: "https://splayer.uncley.cc/favicon.ico", needVpn: false, pinned: true, frequency: 100, id: "s-mvsfznsylv9dm"},
      {name: "魔力音乐", url: "https://yy.juhuang.xyz/", description: "支持五大平台曲库的在线音乐网站", logo: "https://yy.juhuang.xyz/favicon.ico", needVpn: false, pinned: true, frequency: 96, id: "s-mvsfznsy6yzl2"},
      {name: "GD音乐台", url: "https://music.gdstudio.org", description: "支持国内外多个平台曲库的在线听歌网站", logo: "https://music.gdstudio.org/favicon.ico", needVpn: false, pinned: false, frequency: 92, id: "s-mvsfznsyslall"},
      {name: "飞鸟·轻音", url: "http://music.xn--q35am7h.site/", description: "试听、下载、MV观看的音乐网站", logo: "http://music.xn--q35am7h.site/favicon.ico", needVpn: false, pinned: false, frequency: 88, id: "s-mvsfznsyln3db"},
      {name: "米兔音乐", url: "https://www.qqmp3.vip/", description: "提供歌曲在线试听、免费下载的音乐网站", logo: "https://www.qqmp3.vip/favicon.ico", needVpn: false, pinned: false, frequency: 84, id: "s-mvsfznsy3171j"},
      {name: "布谷音乐", url: "https://www.buguyy.cc", description: "提供MP3、WAV、Flac等格式的歌曲下载网站", logo: "https://www.buguyy.cc/favicon.ico", needVpn: false, pinned: false, frequency: 80, id: "s-mvsfznsyqjwv3"},
      {name: "mmPlayer", url: "https://netease-music.fe-mm.com/#/music/toplist", description: "网易云音乐第三方在线音乐播放器", logo: "https://netease-music.fe-mm.com/favicon.ico", needVpn: false, pinned: false, frequency: 76, id: "s-mvsfznsy0bln3"},
      {name: "音乐库", url: "http://www.yinyueku.cn/", description: "网易云第三方网页版音乐播放器，可支持歌单导入、歌词下载", logo: "http://www.yinyueku.cn/favicon.ico", needVpn: false, pinned: false, frequency: 72, id: "s-mvsfznsycph8u"},
      {name: "昔枫音乐盒", url: "https://mu-jie.cc/musicBox/", description: "以网易云为主的网页版免费在线音乐播放器，支持歌曲免费下载", logo: "https://mu-jie.cc/favicon.ico", needVpn: false, pinned: false, frequency: 68, id: "s-mvsfznsyf6l98"},
    ],
  },
  {
    id: "ent-reading", name: "阅读", display: "stack",
    subtitle: "", tabColor: "",
    sites: [
      {name: "Z-Library", url: "https://zh.z2026.ru/", description: "全球最大的免费在线图书馆，电子书下载必备", logo: "https://zh.z2026.ru/favicon.ico", needVpn: false, pinned: true, frequency: 100, id: "s-mvsfznsy8dxi9"},
      {name: "安娜的档案", url: "https://zh.annas-archive.gd/", description: "世界上最大的开源、开放数据图书馆，提供全球各种电子书、文献等内容供用户下载", logo: "https://zh.annas-archive.gd/favicon.ico", needVpn: false, pinned: true, frequency: 96, id: "s-mvsfznsyxwe82"},
      {name: "识典古籍", url: "https://www.shidianguji.com/", description: "古籍在线阅读的网站", logo: "https://www.shidianguji.com/favicon.ico", needVpn: false, pinned: false, frequency: 92, id: "s-mvsfznsy17bw5"},
      {name: "书格", url: "https://www.shuge.org/", description: "自由开放的古籍数字图书馆", logo: "https://www.shuge.org/favicon.ico", needVpn: false, pinned: false, frequency: 88, id: "s-mvsfznsy1h9f8"},
      {name: "鸠摩搜索", url: "https://www.jiumodiary.com/", description: "电子书、文档搜索引擎", logo: "https://www.jiumodiary.com/favicon.ico", needVpn: false, pinned: false, frequency: 84, id: "s-mvsfznsy22aq3"},
      {name: "读书派", url: "https://www.dushupai.com/", description: "提供EPUB、AZW3、MOBI、PDF等格式的免费电子书下载网站", logo: "https://www.dushupai.com/favicon.ico", needVpn: false, pinned: false, frequency: 80, id: "s-mvsfznsytxcjs"},
      {name: "SoBooks", url: "https://sobooks.cc/", description: "免费电子书（网盘）下载平台", logo: "https://sobooks.cc/favicon.ico", needVpn: false, pinned: false, frequency: 76, id: "s-mvsfznsy947rd"},
      {name: "好读", url: "https://haodoo.org/", description: "繁体版电子书资源网站", logo: "https://haodoo.org/favicon.ico", needVpn: false, pinned: false, frequency: 72, id: "s-mvsfznsyeke15"},
      {name: "鹿鸣川", url: "https://lunarora.com/", description: "高质量的电子书资源网站", logo: "https://lunarora.com/favicon.ico", needVpn: false, pinned: false, frequency: 68, id: "s-mvsfznsy5qmay"},
      {name: "电子书之家", url: "https://honeypdf.com/", description: "提供全网电子书、小说免费下载的电子书网站", logo: "https://honeypdf.com/favicon.ico", needVpn: false, pinned: false, frequency: 64, id: "s-mvsfznsyum1sz"},
    ],
  },
  {
    id: "ent-game", name: "游戏", display: "list",
    subtitle: "", tabColor: "",
    sites: [
      {name: "Switch520", url: "https://www.gamer520.com/", description: "更新频率很高的switch、pc、ps5、ps4、模拟器游戏下载网站", logo: "https://www.gamer520.com/favicon.ico", needVpn: false, pinned: true, frequency: 100, id: "s-mvsfznsycdf7q"},
      {name: "小妖怪分享", url: "https://www.xyg688.com/", description: "主打游戏免费分享的资源网站", logo: "https://www.xyg688.com/favicon.ico", needVpn: false, pinned: true, frequency: 96, id: "s-mvsfznsyx8v3i"},
      {name: "flysheep资源避难所", url: "https://www.flysheep6.com/", description: "分享单机PC、VR、模拟器等等游戏的免费下载网站", logo: "https://www.flysheep6.com/favicon.ico", needVpn: false, pinned: false, frequency: 92, id: "s-mvsfznsyu0vtm"},
      {name: "机地游戏", url: "https://www.jidiyouxi.com/", description: "单机游戏、Switch游戏资源分享网站", logo: "https://www.jidiyouxi.com/favicon.ico", needVpn: false, pinned: false, frequency: 88, id: "s-mvsfznsy9rjau"},
      {name: "蒸汽游戏宝库", url: "https://www.steambk.com/", description: "高质量Steam单机游戏下载站", logo: "https://www.steambk.com/favicon.ico", needVpn: false, pinned: false, frequency: 84, id: "s-mvsfznsy43x1d"},
      {name: "FC图库", url: "https://fcpic.nesbbs.com/game.html", description: "红白机(FC/NES)游戏资源下载的知名老站", logo: "https://fcpic.nesbbs.com/favicon.ico", needVpn: false, pinned: false, frequency: 80, id: "s-mvsfznsyji7tf"},
      {name: "老机库", url: "https://laojiku.com/", description: "提供FC、PS、Wii、PSP等怀旧游戏资源的网站", logo: "https://laojiku.com/favicon.ico", needVpn: false, pinned: false, frequency: 76, id: "s-mvsfznsyklgaf"},
      {name: "游仓酷", url: "https://yxcku.com/", description: "专注单机游戏资源、MOD模组的资源分享网站", logo: "https://yxcku.com/favicon.ico", needVpn: false, pinned: false, frequency: 72, id: "s-mvsfznsy56n76"},
      {name: "NS头号玩家", url: "https://nsthwj.vip/", description: "Switch游戏资源分享平台", logo: "https://nsthwj.vip/favicon.ico", needVpn: false, pinned: false, frequency: 68, id: "s-mvsfznsy9svj8"},
      {name: "芝士游戏", url: "https://www.cheesegame.org/", description: "免费PC单机游戏资源分享网站", logo: "https://www.cheesegame.org/favicon.ico", needVpn: false, pinned: false, frequency: 64, id: "s-mvsfznsyblvva"},
    ],
  },
  ];
}

export function buildEntertainmentPreset(): CompositionSnapshot {
  const groups = prepareGroups(entertainmentGroups());
  return baseSnapshot({
    groups,
    widgets: ["task"],
    widgetLayouts: {
    "task": {"colSpan": 2, "heightUnits": 1},
    "news": {"colSpan": 2, "heightUnits": 2},
    "trending": {"colSpan": 2, "heightUnits": 1},
    "tools": {"colSpan": 2, "heightUnits": 1},
    "colors": {"colSpan": 2, "heightUnits": 1}
  },
    groupLayouts: {
    "ent-video": {"colSpan": 2, "heightUnits": 2},
    "ent-game": {"colSpan": 1, "heightUnits": 2},
    "ent-anime": {"colSpan": 2, "heightUnits": 1},
    "combo:c-mvsg1l211w0hx": {"colSpan": 1, "heightUnits": 2}
  },
    cardOrder: ["group:ent-video", "group:ent-game", "group:ent-anime", "combo:c-mvsg1l211w0hx"],
    cardCols: {
    "group:ent-video": 1,
    "group:ent-anime": 0,
    "group:ent-music": 3,
    "group:ent-reading": 2,
    "group:ent-game": 0,
    "widget:task": 2,
    "widget:news": 3,
    "widget:trending": 0,
    "widget:tools": 2,
    "combo:c-mvsg1l211w0hx": 3
  },
    combos: [{"id": "c-mvsg1l211w0hx", "groupIds": ["ent-reading", "ent-music"], "activeGroupId": "ent-reading"}],
    widgetStacks: [],
    cardFaceStyles: {},
    widgetTints: {
    "widget:task": {"kind": "custom", "from": "#4a53ff", "to": "#67eaf9"},
    "widget:news": 1,
    "widget:trending": 6,
    "widget:tools": 5
  },
    appearance: {
    "background": {"presetId": "violet", "oceanColor": "#0d2140"},
    "theme": "dark",
    "groupCardAlpha": 0.4,
    "widgetAlpha": 0.888888888888889,
    "bgBlur": 0.3
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
