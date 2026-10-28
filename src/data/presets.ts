import { type NavGroup } from './groups';
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
/**
 * 设计师预设（2026-10-29 用户定稿）：直接取用户导出的「我的」预设快照
 * （ainav-data-.json 的 myPreset），逐项原样落模板——组、站点、顺序、尺寸、
 * 栏位、组合、摞、底色、外观全按导出值。图像+视频组合卡（当前图像），AI图片处理/设计素材/设计灵感为展开列表卡。
 */
/**
 * 设计师预设（2026-10-29 用户定稿）：直接取用户导出的「我的」预设快照
 * （ainav-data-.json 的 myPreset），逐项原样落模板——组、站点、顺序、尺寸、
 * 栏位、组合、摞、底色、外观全按导出值。图像+视频组合卡（当前图像），AI图片处理/设计素材/设计灵感为展开列表卡。
 */
/**
 * 设计师预设（2026-10-29 用户定稿）：直接取用户导出的「我的」预设快照
 * （ainav-data-.json 的 myPreset），逐项原样落模板——组、站点、顺序、尺寸、
 * 栏位、组合、摞、底色、外观全按导出值。图像+视频组合卡（当前图像），AI图片处理/设计素材/设计灵感为展开列表卡。
 */
export function buildDesignerPreset(): CompositionSnapshot {
  const groups = prepareGroups([
  {
    id: "image", name: "图像生成", display: "stack", aliases: ["绘画", "图片", "绘图"],
    sites: [
      {name: "Midjourney", url: "https://www.midjourney.com", description: "领先的AI图像生成工具", logo: "/icon_APP/Midjourney.svg", needVpn: true, pinned: true, frequency: 96, aliases: ["mj"], tags: ["VPN"], id: "s-mvso3yt2bbvmy"},
      {name: "即梦", url: "https://jimeng.jike.com", description: "字节跳动AI视频工具", logo: "/icon_APP/jimengAI-01.svg", needVpn: false, pinned: true, frequency: 92, aliases: ["jimeng"], id: "s-mvso3yt2ez863"},
      {name: "Liblib", url: "https://www.liblib.art", description: "国产AI图像生成平台", logo: "/icon_APP/liblib.svg", needVpn: false, frequency: 88, aliases: ["liblibai", "哩布"], id: "s-mvso3yt2cv1h0"},
      {name: "通义万相", url: "https://tongyi.aliyun.com/wanxiang", description: "阿里AI图像生成", logo: "/icon_APP/tongyi.svg", needVpn: false, frequency: 84, aliases: ["万相"], id: "s-mvso3yt2f1abt"},
      {name: "Nano Banana", url: "https://nanobanana.com", description: "AI图像生成平台", logo: "/icon_APP/nano-banana.svg", needVpn: false, frequency: 80, aliases: ["香蕉"], id: "s-mvso3yt2vjx7v"},
      {name: "Krea", url: "https://krea.ai", description: "AI图像创作平台", logo: "/icon_APP/krea.png", needVpn: true, frequency: 76, tags: ["VPN"], id: "s-mvso3yt2mp8x6"},
      {name: "DALL-E", url: "https://openai.com/dall-e-3", description: "OpenAI图像创作工具", logo: "/icon_APP/dalle.svg", needVpn: true, frequency: 72, aliases: ["dalle"], tags: ["VPN"], id: "s-mvso3yt2nmono"},
      {name: "Firefly", url: "https://www.adobe.com/firefly", description: "Adobe创意AI工具", logo: "/icon_APP/firefly.svg", needVpn: true, frequency: 68, aliases: ["adobe"], tags: ["VPN"], id: "s-mvso3yt2fvlom"},
      {name: "Stable Diffusion", url: "https://stability.ai", description: "开源图像生成模型", logo: "/icon_APP/a-stablediffusion.svg", needVpn: true, frequency: 64, aliases: ["sd"], tags: ["VPN"], id: "s-mvso3yt2qfx28"},
    ],
  },
  {
    id: "video", name: "视频生成", display: "stack", aliases: ["视频", "影视"],
    sites: [
      {name: "可灵", url: "https://kling.kuaishou.com", description: "快手AI视频生成", logo: "/icon_APP/keling.svg", needVpn: false, pinned: true, frequency: 96, aliases: ["kling", "快手"], id: "s-mvso3yt2sl1bc"},
      {name: "即梦", url: "https://jimeng.jike.com", description: "字节跳动AI视频工具", logo: "/icon_APP/jimengAI-01.svg", needVpn: false, pinned: true, frequency: 92, aliases: ["jimeng"], id: "s-mvso3yt2ik12m"},
      {name: "海螺", url: "https://hailuo.ai", description: "MiniMax视频生成工具", logo: "/icon_APP/hailuo.png", needVpn: false, frequency: 88, aliases: ["hailuo"], id: "s-mvso3yt2u6c0v"},
      {name: "Sora", url: "https://openai.com/sora", description: "OpenAI视频生成模型", logo: "/icon_APP/Sora.svg", needVpn: true, frequency: 84, tags: ["VPN"], id: "s-mvso3yt20ba2b"},
      {name: "Runway", url: "https://runwayml.com", description: "专业AI视频编辑平台", logo: "/icon_APP/Runwayml.svg", needVpn: true, frequency: 80, tags: ["VPN"], id: "s-mvso3yt2d9s2c"},
      {name: "剪映", url: "https://www.capcut.cn", description: "字节跳动AI视频剪辑", logo: "/icon_APP/jianying.svg", needVpn: false, frequency: 76, aliases: ["capcut", "剪辑"], id: "s-mvso3yt2p767y"},
      {name: "Vidu", url: "https://www.vidu.com", description: "生数科技AI视频生成平台", logo: "/icon_APP/vidu.svg", needVpn: false, frequency: 72, aliases: ["vidu"], id: "s-mvso3yt2ohjzj"},
    ],
  },
  {
    id: "imgproc", name: "AI图片处理", display: "list",
    sites: [
      {name: "Clipdrop", url: "https://clipdrop.co/", description: "Stability AI 全能图像处理工具箱", logo: "/icon_APP/clipdrop.png", needVpn: true, pinned: true, frequency: 100, tags: ["VPN"], id: "s-mvso3yt2jmzb9"},
      {name: "PicWish", url: "https://picwish.com/", description: "国产 AI 抠图修图工具", logo: "/icon_APP/picwish.png", needVpn: false, pinned: true, frequency: 96, id: "s-mvso3yt24x3sf"},
      {name: "Vectorizer.ai", url: "https://vectorizer.ai/", description: "位图一键转矢量图工具", logo: "/icon_APP/vectorizer.png", needVpn: true, pinned: false, frequency: 92, tags: ["VPN"], id: "s-mvso3yt2whqyp"},
      {name: "Palette.fm", url: "https://palette.fm/", description: "AI 黑白照片上色工具", logo: "/icon_APP/palettefm.png", needVpn: true, pinned: false, frequency: 88, tags: ["VPN"], id: "s-mvso3yt2zbm7r"},
      {name: "Upscayl", url: "https://www.upscayl.org/", description: "开源免费 AI 图片放大工具", logo: "/icon_APP/upscayl.png", needVpn: true, pinned: false, frequency: 84, tags: ["VPN"], id: "s-mvso3yt2r9cc5"},
      {name: "Img.Upscaler", url: "https://imgupscaler.com/", description: "在线 AI 图片无损放大工具", logo: "/icon_APP/imgupscaler.png", needVpn: true, pinned: false, frequency: 80, tags: ["VPN"], id: "s-mvso3yt2qtj07"},
    ],
  },
  {
    id: "design-assets", name: "设计素材", display: "list",
    sites: [
      {name: "Unsplash", url: "https://unsplash.com/", description: "全球知名免费高清图库", logo: "/icon_APP/unsplash.png", needVpn: true, pinned: true, frequency: 100, tags: ["VPN"], id: "s-mvso3yt2k8y78"},
      {name: "Pexels", url: "https://www.pexels.com/", description: "免费高清图片视频素材库", logo: "/icon_APP/pexels.png", needVpn: true, pinned: true, frequency: 96, tags: ["VPN"], id: "s-mvso3yt2j0t6j"},
      {name: "Pixabay", url: "https://pixabay.com/", description: "百万级免费图片插画素材库", logo: "/icon_APP/pixabay.png", needVpn: true, pinned: false, frequency: 92, tags: ["VPN"], id: "s-mvso3yt2gwzqy"},
      {name: "Freepik", url: "https://www.freepik.com/", description: "全球最大的设计素材库之一", logo: "/icon_APP/freepik.png", needVpn: true, pinned: false, frequency: 88, tags: ["VPN"], id: "s-mvso3yt2b5eid"},
      {name: "摄图网", url: "https://699pic.com/", description: "国内大型正版图片素材库", logo: "/icon_APP/shetu699.png", needVpn: false, pinned: false, frequency: 84, id: "s-mvso3yt2qc1ej"},
      {name: "包图网", url: "https://ibaotu.com/", description: "国内海量设计素材下载站", logo: "/icon_APP/ibaotu.png", needVpn: false, pinned: false, frequency: 80, id: "s-mvso3yt2rg7rs"},
      {name: "IconFont", url: "https://www.iconfont.cn/", description: "阿里巴巴图标搜索管理平台", logo: "/icon_APP/iconfont.png", needVpn: false, pinned: false, frequency: 76, id: "s-mvso3yt264ree"},
      {name: "Flaticon", url: "https://www.flaticon.com/", description: "全球最大的扁平图标库", logo: "/icon_APP/flaticon.png", needVpn: true, pinned: false, frequency: 72, tags: ["VPN"], id: "s-mvso3yt2vbbts"},
      {name: "Icons8", url: "https://icons8.com/", description: "图标与设计素材综合平台", logo: "/icon_APP/icons8.png", needVpn: true, pinned: false, frequency: 68, tags: ["VPN"], id: "s-mvso3yt2dvg2p"},
      {name: "IconPark", url: "https://iconpark.oceanengine.com/", description: "字节跳动开源图标库", logo: "/icon_APP/iconpark.png", needVpn: false, pinned: false, frequency: 64, id: "s-mvso3yt28rama"},
      {name: "500px", url: "https://500px.com.cn/", description: "专业摄影作品分享平台", logo: "/icon_APP/px500.png", needVpn: false, pinned: false, frequency: 60, id: "s-mvso3yt22sn4g"},
    ],
  },
  {
    id: "design-inspire", name: "设计灵感", display: "list",
    sites: [
      {name: "Dribbble", url: "https://dribbble.com/", description: "全球设计师作品展示社区", logo: "/icon_APP/dribbble.png", needVpn: true, pinned: true, frequency: 100, tags: ["VPN"], id: "s-mvso3yt2y9xag"},
      {name: "Behance", url: "https://www.behance.net/", description: "Adobe 旗下创意作品平台", logo: "/icon_APP/behance.png", needVpn: true, pinned: true, frequency: 96, tags: ["VPN"], id: "s-mvso3yt22khe4"},
      {name: "Pinterest", url: "https://www.pinterest.com/", description: "全球图片灵感采集平台", logo: "/icon_APP/pinterest.png", needVpn: true, pinned: false, frequency: 92, tags: ["VPN"], id: "s-mvso3yt22p6pd"},
      {name: "花瓣网", url: "https://huaban.com/", description: "国内设计灵感采集平台", logo: "/icon_APP/huaban.png", needVpn: false, pinned: false, frequency: 88, id: "s-mvso3yt2iwcy0"},
      {name: "站酷", url: "https://www.zcool.com.cn/", description: "国内最大的设计师交流平台", logo: "/icon_APP/zcool.png", needVpn: false, pinned: false, frequency: 84, id: "s-mvso3yt213g90"},
      {name: "Mobbin", url: "https://mobbin.com/", description: "App 界面设计灵感库", logo: "/icon_APP/mobbin.png", needVpn: true, pinned: false, frequency: 80, tags: ["VPN"], id: "s-mvso3yt22elk9"},
    ],
  },
  {
    id: "color-font", name: "配色字体", display: "stack",
    sites: [
      {name: "Coolors", url: "https://coolors.co/", description: "超人气的在线配色方案生成器", logo: "/icon_APP/coolors.png", needVpn: true, pinned: true, frequency: 100, tags: ["VPN"], id: "s-mvso3yt280o6x"},
      {name: "Color Hunt", url: "https://colorhunt.co/", description: "每日更新的手选配色方案", logo: "/icon_APP/colorhunt.png", needVpn: true, pinned: true, frequency: 96, tags: ["VPN"], id: "s-mvso3yt2s8xht"},
      {name: "Adobe Color", url: "https://color.adobe.com/", description: "Adobe 官方在线配色工具", logo: "/icon_APP/adobecolor.png", needVpn: true, pinned: false, frequency: 92, tags: ["VPN"], id: "s-mvso3yt29ednw"},
      {name: "UI Gradients", url: "https://uigradients.com/", description: "精美渐变配色灵感库", logo: "/icon_APP/uigradients.png", needVpn: true, pinned: false, frequency: 88, tags: ["VPN"], id: "s-mvso3yt2sbqh1"},
      {name: "猫啃网", url: "https://www.maoken.com/", description: "免费商用中文字体下载站", logo: "/icon_APP/maoken.png", needVpn: false, pinned: false, frequency: 84, id: "s-mvso3yt2ggrqc"},
      {name: "DaFont", url: "https://www.dafont.com/", description: "国际知名的免费字体下载站", logo: "/icon_APP/dafont.png", needVpn: true, pinned: false, frequency: 80, tags: ["VPN"], id: "s-mvso3yt2cwnu8"},
      {name: "求字体", url: "https://www.qiuziti.com/", description: "在线字体识别与下载工具", logo: "/icon_APP/qiuziti.png", needVpn: false, pinned: false, frequency: 76, id: "s-mvso3yt298s9s"},
    ],
  },
  {
    id: "ai-chat", name: "AI 对话", display: "list", aliases: ["聊天机器人", "对话", "聊天"],
    sites: [
      {name: "ChatGPT", url: "https://chat.openai.com", description: "OpenAI推出的AI对话助手", logo: "/icon_APP/chatgpticon.svg", needVpn: true, pinned: true, frequency: 100, aliases: ["gpt", "openai", "聊天机器人"], tags: ["VPN"], id: "s-mvso3yt2b3ys6"},
      {name: "DeepSeek", url: "https://deepseek.com", description: "深度求索AI助手", logo: "/icon_APP/deepseek.svg", needVpn: false, pinned: true, frequency: 96, aliases: ["ds", "深度求索"], id: "s-mvso3yt2sg3yn"},
      {name: "豆包", url: "https://www.doubao.com", description: "字节跳动AI助手", logo: "/icon_APP/doubao.svg", needVpn: false, frequency: 92, aliases: ["doubao", "字节跳动"], id: "s-mvso3yt2wmxvx"},
      {name: "Kimi", url: "https://kimi.moonshot.cn", description: "月之暗面推出的AI助手", logo: "/icon_APP/KIMI.svg", needVpn: false, frequency: 88, aliases: ["月之暗面", "moonshot", "长文本"], id: "s-mvso3yt216p7a"},
      {name: "Claude", url: "https://claude.ai", description: "Anthropic推出的智能助手", logo: "/icon_APP/claude.svg", needVpn: true, frequency: 84, aliases: ["克劳德", "anthropic"], tags: ["VPN"], id: "s-mvso3yt2sftq2"},
      {name: "通义千问", url: "https://tongyi.aliyun.com", description: "阿里巴巴AI大模型", logo: "/icon_APP/tongyi.svg", needVpn: false, frequency: 80, aliases: ["qwen", "千问", "通义", "阿里"], id: "s-mvso3yt2w0luq"},
      {name: "Gemini", url: "https://gemini.google.com", description: "Google多模态AI模型", logo: "/icon_APP/gemini.svg", needVpn: true, frequency: 76, aliases: ["google", "谷歌", "双子"], tags: ["VPN"], id: "s-mvso3yt2qemmo"},
      {name: "文心一言", url: "https://yiyan.baidu.com", description: "百度AI对话助手", logo: "/icon_APP/baidu.svg", needVpn: false, frequency: 72, aliases: ["ernie", "文心", "百度"], id: "s-mvso3yt2aise9"},
      {name: "腾讯混元", url: "https://hunyuan.tencent.com", description: "腾讯AI大模型", logo: "/icon_APP/tencent-hunyuan.svg", needVpn: false, frequency: 68, aliases: ["混元", "hunyuan", "腾讯"], id: "s-mvso3yt2yka4c"},
      {name: "讯飞星火", url: "https://xinghuo.xfyun.cn", description: "科大讯飞AI大模型", logo: "/icon_APP/xunfeichatgpt.svg", needVpn: false, frequency: 64, aliases: ["星火", "spark", "讯飞"], id: "s-mvso3yt20grxo"},
      {name: "MiniMax", url: "https://www.minimaxi.com", description: "MiniMax AI助手，海螺AI出品", logo: "/icon_APP/minimax.svg", needVpn: false, frequency: 60, aliases: ["minimax"], id: "s-mvso3yt2emnab"},
      {name: "智谱清言", url: "https://chatglm.cn", description: "智谱AI推出的对话助手", logo: "/icon_APP/zhipu.png", needVpn: false, frequency: 56, aliases: ["zhipu", "glm", "清言"], id: "s-mvso3yt28b4u5"},
      {name: "盒豚查", url: "https://mp.weixin.qq.com/s/Ak0rWbeGi0LtmbyqngAzlQ", description: "AI查卷工具人", logo: "/icon_APP/hetun-life.png", needVpn: false, frequency: 40, aliases: ["查卷"], id: "s-mvso3yt2cky3i"},
    ],
  },
  ]);
  return baseSnapshot({
    groups,
    widgets: ["task", "tools", "colors"],
    widgetLayouts: {
    "task": {"colSpan": 1, "heightUnits": 2},
    "news": {"colSpan": 2, "heightUnits": 2},
    "trending": {"colSpan": 2, "heightUnits": 1},
    "tools": {"colSpan": 2, "heightUnits": 1},
    "colors": {"colSpan": 1, "heightUnits": 1}
  },
    groupLayouts: {
    "design-assets": {"colSpan": 2, "heightUnits": 2},
    "imgproc": {"colSpan": 1, "heightUnits": 2},
    "combo:c-mvso4k801yn55": {"colSpan": 1, "heightUnits": 2},
    "design-inspire": {"colSpan": 1, "heightUnits": 2}
  },
    cardOrder: ["combo:c-mvso4k801yn55", "group:ai-chat", "group:design-assets", "widget:colors", "group:imgproc", "widget:task", "group:color-font", "group:design-inspire", "widget:tools"],
    cardCols: {
    "group:image": 0,
    "group:video": 1,
    "group:ai-chat": 2,
    "group:imgproc": 0,
    "group:design-assets": 1,
    "widget:task": 0,
    "group:color-font": 0,
    "widget:tools": 2,
    "group:design-inspire": 3,
    "widget:colors": 1,
    "combo:c-mvso4k801yn55": 1
  },
    combos: [{"id": "c-mvso4k801yn55", "groupIds": ["image", "video"], "activeGroupId": "image"}],
    widgetStacks: [],
    cardFaceStyles: {},
    widgetTints: {
    "widget:colors": 3,
    "widget:task": 0,
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

/**
 * 程序员预设（2026-10-29 用户定稿）：直接取用户导出的「我的」预设快照
 * （ainav-data--2.json 的 myPreset），逐项原样落模板——组、站点、顺序、尺寸、
 * 栏位、组合、摞、底色、外观全按导出值。AI写作+AI办公组合卡（当前AI写作），编程工具为展开列表卡。
 */
export function buildDeveloperPreset(): CompositionSnapshot {
  const groups = prepareGroups([
  {
    id: "code", name: "编程工具", display: "list", aliases: ["编程", "代码", "开发"],
    sites: [
      {name: "Cursor", url: "https://cursor.sh", description: "AI驱动代码编辑器", logo: "/icon_APP/cursor.svg", needVpn: true, pinned: true, frequency: 96, aliases: ["ai编辑器"], tags: ["VPN"], id: "s-mvso1u5rxslpi"},
      {name: "VS Code", url: "https://code.visualstudio.com", description: "微软代码编辑器", logo: "/icon_APP/vscode.svg", needVpn: false, pinned: true, frequency: 92, aliases: ["vscode", "编辑器"], id: "s-mvso1u5rgtmit"},
      {name: "Trae", url: "https://trae.ai", description: "AI驱动开发环境", logo: "/icon_APP/trae1.png", needVpn: false, frequency: 88, id: "s-mvso1u5rnkdoe"},
      {name: "GitHub Copilot", url: "https://github.com/features/copilot", description: "GitHub AI编程助手", logo: "/icon_APP/github.svg", needVpn: true, frequency: 80, aliases: ["copilot"], tags: ["VPN"], id: "s-mvso1u5rx50rg"},
      {name: "通义灵码", url: "https://tongyi.aliyun.com/lingma", description: "阿里AI编程助手", logo: "/icon_APP/tongyi.svg", needVpn: false, frequency: 76, aliases: ["lingma"], id: "s-mvso1u5rsg2y7"},
      {name: "Windsurf", url: "https://codeium.com/windsurf", description: "现代AI代码编辑器", logo: "/icon_APP/windsurf.svg", needVpn: true, frequency: 72, tags: ["VPN"], id: "s-mvso1u5rvgn4e"},
      {name: "文心快码", url: "https://cloud.baidu.com/product/codeassist", description: "百度AI编程工具", logo: "/icon_APP/baidu.svg", needVpn: false, frequency: 64, id: "s-mvso1u5rf0ie0"},
    ],
  },
  {
    id: "ai-chat", name: "AI 对话", display: "list", aliases: ["聊天机器人", "对话", "聊天"],
    sites: [
      {name: "ChatGPT", url: "https://chat.openai.com", description: "OpenAI推出的AI对话助手", logo: "/icon_APP/chatgpticon.svg", needVpn: true, pinned: true, frequency: 100, aliases: ["gpt", "openai", "聊天机器人"], tags: ["VPN"], id: "s-mvso1u5rjjfc4"},
      {name: "DeepSeek", url: "https://deepseek.com", description: "深度求索AI助手", logo: "/icon_APP/deepseek.svg", needVpn: false, pinned: true, frequency: 96, aliases: ["ds", "深度求索"], id: "s-mvso1u5rpawjt"},
      {name: "豆包", url: "https://www.doubao.com", description: "字节跳动AI助手", logo: "/icon_APP/doubao.svg", needVpn: false, frequency: 92, aliases: ["doubao", "字节跳动"], id: "s-mvso1u5rouc77"},
      {name: "Kimi", url: "https://kimi.moonshot.cn", description: "月之暗面推出的AI助手", logo: "/icon_APP/KIMI.svg", needVpn: false, frequency: 88, aliases: ["月之暗面", "moonshot", "长文本"], id: "s-mvso1u5rfmy4f"},
      {name: "Claude", url: "https://claude.ai", description: "Anthropic推出的智能助手", logo: "/icon_APP/claude.svg", needVpn: true, frequency: 84, aliases: ["克劳德", "anthropic"], tags: ["VPN"], id: "s-mvso1u5r9rlzx"},
      {name: "通义千问", url: "https://tongyi.aliyun.com", description: "阿里巴巴AI大模型", logo: "/icon_APP/tongyi.svg", needVpn: false, frequency: 80, aliases: ["qwen", "千问", "通义", "阿里"], id: "s-mvso1u5rnfi14"},
      {name: "Gemini", url: "https://gemini.google.com", description: "Google多模态AI模型", logo: "/icon_APP/gemini.svg", needVpn: true, frequency: 76, aliases: ["google", "谷歌", "双子"], tags: ["VPN"], id: "s-mvso1u5r8tslz"},
      {name: "文心一言", url: "https://yiyan.baidu.com", description: "百度AI对话助手", logo: "/icon_APP/baidu.svg", needVpn: false, frequency: 72, aliases: ["ernie", "文心", "百度"], id: "s-mvso1u5r99shd"},
      {name: "腾讯混元", url: "https://hunyuan.tencent.com", description: "腾讯AI大模型", logo: "/icon_APP/tencent-hunyuan.svg", needVpn: false, frequency: 68, aliases: ["混元", "hunyuan", "腾讯"], id: "s-mvso1u5r6gkq5"},
      {name: "讯飞星火", url: "https://xinghuo.xfyun.cn", description: "科大讯飞AI大模型", logo: "/icon_APP/xunfeichatgpt.svg", needVpn: false, frequency: 64, aliases: ["星火", "spark", "讯飞"], id: "s-mvso1u5raafo1"},
      {name: "MiniMax", url: "https://www.minimaxi.com", description: "MiniMax AI助手，海螺AI出品", logo: "/icon_APP/minimax.svg", needVpn: false, frequency: 60, aliases: ["minimax"], id: "s-mvso1u5r4esh8"},
      {name: "智谱清言", url: "https://chatglm.cn", description: "智谱AI推出的对话助手", logo: "/icon_APP/zhipu.png", needVpn: false, frequency: 56, aliases: ["zhipu", "glm", "清言"], id: "s-mvso1u5r211jl"},
      {name: "盒豚查", url: "https://mp.weixin.qq.com/s/Ak0rWbeGi0LtmbyqngAzlQ", description: "AI查卷工具人", logo: "/icon_APP/hetun-life.png", needVpn: false, frequency: 40, aliases: ["查卷"], id: "s-mvso1u5rjp372"},
    ],
  },
  {
    id: "ai-platform", name: "AI开放平台", display: "stack",
    sites: [
      {name: "百度AI", url: "https://ai.baidu.com", description: "百度AI开放平台", logo: "/icon_APP/baiduai.png", needVpn: false, pinned: true, frequency: 100, id: "s-mvso1u5rm6zh6"},
      {name: "腾讯AI", url: "https://ai.qq.com", description: "腾讯AI开放平台", logo: "/icon_APP/tencentai.png", needVpn: false, pinned: true, frequency: 96, id: "s-mvso1u5rehlpe"},
      {name: "讯飞开放平台", url: "https://www.xfyun.cn", description: "科大讯飞AI技术开放平台", logo: "/icon_APP/xfyun.png", needVpn: false, pinned: false, frequency: 92, id: "s-mvso1u5r5urlz"},
      {name: "HuggingFace", url: "https://huggingface.co/", description: "全球 AI 模型与数据集社区", logo: "/icon_APP/huggingface.png", needVpn: true, pinned: false, frequency: 88, tags: ["VPN"], id: "s-mvso1u5r3300i"},
    ],
  },
  {
    id: "office", name: "AI 办公", display: "stack", aliases: ["办公", "文档", "协作"],
    sites: [
      {name: "飞书", url: "https://www.feishu.cn/", description: "字节跳动一站式协作办公平台", logo: "/icon_APP/feishu.png", needVpn: false, pinned: true, frequency: 96, aliases: ["feishu", "lark"], id: "s-mvso1u5rfo5a5"},
      {name: "WPS云文档", url: "https://www.wps.cn", description: "金山在线协作文档平台", logo: "/icon_APP/wps.png", needVpn: false, pinned: true, frequency: 92, aliases: ["wps"], id: "s-mvso1u5r5jc9h"},
      {name: "AiPPT", url: "https://www.aippt.cn/", description: "输入主题一键生成 PPT", logo: "/icon_APP/aippt.png", needVpn: false, frequency: 88, aliases: ["aippt", "ppt"], id: "s-mvso1u5r5sc25"},
      {name: "ProcessOn", url: "https://www.processon.com", description: "在线流程图与思维导图工具", logo: "/icon_APP/processon.png", needVpn: false, frequency: 84, aliases: ["processon"], id: "s-mvso1u5rcn9k6"},
      {name: "ChatExcel", url: "https://chatexcel.com/", description: "对话式操作表格的 AI 工具", logo: "/icon_APP/chatexcel.svg", needVpn: false, frequency: 80, aliases: ["chatexcel"], id: "s-mvso1u5rv9h03"},
      {name: "Beautiful.ai", url: "https://www.beautiful.ai", description: "AI驱动的PPT制作平台", logo: "/icon_APP/beautifulai.png", needVpn: true, frequency: 76, tags: ["VPN"], id: "s-mvso1u5roi4ai"},
      {name: "Prezi", url: "https://prezi.com", description: "非线性动态演示文稿工具", logo: "/icon_APP/prezi.svg", needVpn: true, frequency: 72, tags: ["VPN"], id: "s-mvso1u5rm7q8g"},
    ],
  },
  {
    id: "writing", name: "AI写作", display: "stack", aliases: ["写作", "文案"],
    sites: [
      {name: "Notion AI", url: "https://www.notion.so", description: "AI写作神器！比你想得更多！写得更快", logo: "/icon_APP/notion.jpg", needVpn: true, pinned: true, frequency: 92, aliases: ["notion"], tags: ["VPN"], id: "s-mvso1u5ri0tjf"},
      {name: "秘塔写作猫", url: "https://xiezuocat.com", description: "基于GPT的中文写作工具", logo: "/icon_APP/mita-writing.png", needVpn: false, pinned: true, frequency: 88, aliases: ["写作猫"], id: "s-mvso1u5ricqdk"},
      {name: "火山写作", url: "https://writingo.volcengine.com", description: "字节跳动AI写作工具，高效提升文案创作", logo: "/icon_APP/huoshan.png", needVpn: false, frequency: 84, id: "s-mvso1u5rujnpi"},
      {name: "Copy AI", url: "https://www.copy.ai", description: "AI社交媒体文案写作助手", logo: "/icon_APP/copyai.png", needVpn: true, frequency: 80, aliases: ["copyai"], tags: ["VPN"], id: "s-mvso1u5rtdxss"},
      {name: "字语未来", url: "https://www.ziyuweilai.com", description: "用AI创造有价值的文案，让新一代智能办公更简单", logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2220%22%20fill%3D%22%2314b8a6%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2250%22%20dy%3D%220.36em%22%20text-anchor%3D%22middle%22%20font-family%3D%22system-ui%2C%20-apple-system%2C%20'Segoe%20UI'%2C%20sans-serif%22%20font-size%3D%2244%22%20font-weight%3D%22700%22%20fill%3D%22%23ffffff%22%3E%E5%AD%97%3C%2Ftext%3E%3C%2Fsvg%3E", needVpn: false, frequency: 76, id: "s-mvso1u5rgqnj0"},
      {name: "毕业宝AI论文降重", url: "https://www.biyebao.com", description: "论文降重神器！学生都在用的AI论文降重辅助AI工具", logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2220%22%20fill%3D%22%238b5cf6%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2250%22%20dy%3D%220.36em%22%20text-anchor%3D%22middle%22%20font-family%3D%22system-ui%2C%20-apple-system%2C%20'Segoe%20UI'%2C%20sans-serif%22%20font-size%3D%2244%22%20font-weight%3D%22700%22%20fill%3D%22%23ffffff%22%3E%E6%AF%95%3C%2Ftext%3E%3C%2Fsvg%3E", needVpn: false, frequency: 72, aliases: ["论文降重"], id: "s-mvso1u5rjw99y"},
    ],
  },
  ]);
  return baseSnapshot({
    groups,
    widgets: ["task", "news", "tools"],
    widgetLayouts: {
    "task": {"colSpan": 1, "heightUnits": 1},
    "news": {"colSpan": 1, "heightUnits": 1},
    "trending": {"colSpan": 2, "heightUnits": 1},
    "tools": {"colSpan": 1, "heightUnits": 1},
    "colors": {"colSpan": 2, "heightUnits": 1}
  },
    groupLayouts: {
    "code": {"colSpan": 2, "heightUnits": 2},
    "combo:c-mvso28jacsbu5": {"colSpan": 1, "heightUnits": 1}
  },
    cardOrder: ["group:code", "group:ai-platform", "group:ai-chat", "widget:tools", "widget:news", "widget:task", "combo:c-mvso28jacsbu5"],
    cardCols: {
    "group:code": 0,
    "group:ai-chat": 2,
    "widget:news": 0,
    "widget:task": 2,
    "group:ai-platform": 1,
    "widget:trending": 2,
    "group:office": 0,
    "group:writing": 1,
    "widget:tools": 3,
    "combo:c-mvso28jacsbu5": 0
  },
    combos: [{"id": "c-mvso28jacsbu5", "groupIds": ["writing", "office"], "activeGroupId": "writing"}],
    widgetStacks: [],
    cardFaceStyles: {},
    widgetTints: {
    "widget:task": 4,
    "widget:news": 7,
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
