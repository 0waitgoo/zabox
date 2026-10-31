import type { Lang } from './strings';

/**
 * 内置编组名翻译（2026-10-31）：种子/预设模板自带的编组名是网站原生文字，
 * EN 模式下显示英文；仅当 id 与中文名都与模板一致时翻译——用户改过名的编组
 * 一律保留用户自己的文字（那是用户数据，不翻译）。
 */
const BUILTIN_GROUP_NAMES: Record<string, { zh: string; en: string }> = {
  'ai-chat': { zh: 'AI 对话', en: 'AI Chat' },
  image: { zh: '图像生成', en: 'Image Generation' },
  video: { zh: '视频生成', en: 'Video Generation' },
  writing: { zh: 'AI写作', en: 'AI Writing' },
  code: { zh: '编程工具', en: 'Coding Tools' },
  audio: { zh: '音频生成', en: 'Audio Generation' },
  office: { zh: 'AI 办公', en: 'AI Office' },
  imgproc: { zh: 'AI图片处理', en: 'AI Image Processing' },
  'design-assets': { zh: '设计素材', en: 'Design Assets' },
  'design-inspire': { zh: '设计灵感', en: 'Design Inspiration' },
  'color-font': { zh: '配色字体', en: 'Colors & Fonts' },
  'ai-platform': { zh: 'AI开放平台', en: 'AI Platforms' },
  'ent-video': { zh: '视频', en: 'Videos' },
  'ent-anime': { zh: '二次元', en: 'Anime & Comics' },
  'ent-music': { zh: '音乐', en: 'Music' },
  'ent-reading': { zh: '阅读', en: 'Reading' },
  'ent-game': { zh: '游戏', en: 'Games' },
};

export function displayGroupName(group: { id: string; name: string }, lang: Lang): string {
  const mapped = BUILTIN_GROUP_NAMES[group.id];
  if (mapped && group.name === mapped.zh) return lang === 'en' ? mapped.en : group.name;
  return group.name;
}

/** 导航池分类名翻译（同口径：仅翻译种子池自带的分类名，未知分类原样显示） */
const POOL_CATEGORY_NAMES: Record<string, string> = {
  聊天机器人: 'Chatbots',
  图像生成: 'Image Generation',
  AI图片处理: 'AI Image Processing',
  视频生成: 'Video Generation',
  音频生成: 'Audio Generation',
  编程工具: 'Coding Tools',
  Agent工具: 'Agent Tools',
  AI写作: 'AI Writing',
  AI翻译: 'AI Translation',
  AI设计: 'AI Design',
  设计素材: 'Design Assets',
  设计灵感: 'Design Inspiration',
  配色字体: 'Colors & Fonts',
  AI办公: 'AI Office',
  AI开放平台: 'AI Platforms',
  视频: 'Videos',
  二次元: 'Anime & Comics',
  音乐: 'Music',
  阅读: 'Reading',
  游戏: 'Games',
  娱乐: 'Entertainment',
};

export function displayPoolCategory(category: string, lang: Lang): string {
  if (lang === 'en') return POOL_CATEGORY_NAMES[category] ?? category;
  return category;
}
