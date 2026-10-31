// V2 编组数据：由 NavPage 现有导航数据（toolsByCategory）迁移而来
// 在原有 name/description/url/logo 基础上扩展：aliases（别名）、pinned（置顶）、frequency（使用频率权重）、dead（失效标记，只标记不删除）
import { localSiteIcons } from './localSiteIcons';

export interface SiteEntry {
  /** 本地存储层分配的稳定 ID（种子/导入时补齐），增删改按 ID 定位 */
  id?: string;
  name: string;
  url: string;
  description: string;
  logo: string;
  needVpn?: boolean;
  /**
   * 站点标签（第二十六轮单标签；第七十六轮改多标签）：行上小徽标的唯一文本来源，
   * 每项仅 1–4 个英文字母、大写（如 VPN、DEV），每站最多 2 个（SITE_TAGS_MAX_COUNT）。
   * 旧数据里 needVpn=true 的站点在归一化时迁移为 tags=['VPN']；为空 = 不显示徽标。
   */
  tags?: string[];
  /** 旧单标签字段（≤第七十五轮）：仅供归一化迁移读取，迁移后删除，新代码不要再写 */
  tag?: string;
  /** 搜索别名：命中别名可直达，如 ChatGPT 的「gpt」（表单已无编辑入口，数据保留继续供搜索） */
  aliases?: string[];
  /** 组内置顶，面板中排在最前 */
  pinned?: boolean;
  /** 使用频率权重（越大越靠前），代表系统按频率自动排序的结果 */
  frequency: number;
  /** 失效标记：AI 扫描发现失效时只打标记，不自动删除 */
  dead?: boolean;
  /**
   * 图标来源（第四十九轮）：缺省/'auto' = 沿用 logo 字段的自动管线（内置图标库 → favicon → 字母兜底）；
   * 'text' = 用 iconText（1–2 字符）生成字母图标；'upload' = 用 iconImage（前端压缩后的 data URL）。
   * 所有渲染站点图标处统一经 siteIconSrc 解析，不要直接读 logo。
   */
  iconMode?: 'auto' | 'text' | 'upload';
  /** iconMode='text' 时的图标文字（1–2 个字符，中英文均可） */
  iconText?: string;
  /**
   * iconMode='text' 时的字母图标底色（扩展添加面板选色用，#rrggbb）：
   * 缺省 = 按图标文字哈希自动取色（与旧行为一致）；网站版表单不写此字段。
   */
  iconColor?: string;
  /** iconMode='upload' 时的图片 data URL（最长边 ≤128px 的方形小图，体积受控才允许随同步走） */
  iconImage?: string;
}

/** 编组卡片形态：list = B 详细列表卡（原地展开）；stack = C 文件夹堆叠卡（点击弹窗） */
export type GroupDisplay = 'list' | 'stack';

/** 站点标签长度上限（第二十六轮） */
export const SITE_TAG_MAX = 4;

/** 编组名长度上限（第三十二轮）：所有组名输入框统一 maxLength + 计数；存量超长组名不强改数据、展示端省略号截断 */
export const GROUP_NAME_MAX = 8;

/** 按字符（码点）计数：中英都算 1 个，emoji 也算 1 个 */
export const textCharCount = (s: string): number => Array.from(s).length;

/** 按字符（码点）截断到上限：新建编组落盘前兜底，输入框 maxLength 之外的程序填充也不会存入超长组名 */
export const clampGroupName = (name: string): string => Array.from(name).slice(0, GROUP_NAME_MAX).join('');

/** 站点标签清洗：只留英文字母、转大写、最多 4 个；空/无合法字符 → ''（表示无标签） */
export function cleanSiteTag(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, SITE_TAG_MAX);
}

/** 每站标签数量上限（第七十六轮） */
export const SITE_TAGS_MAX_COUNT = 2;

/**
 * 多标签清洗（第七十六轮）：入参兼容三种形态——新格式数组、旧格式单字符串、其他一律视为空。
 * 逐项按 cleanSiteTag 清洗、去空、去重（保序），最多取前 SITE_TAGS_MAX_COUNT 个。
 */
export function cleanSiteTags(raw: unknown): string[] {
  const items: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const out: string[] = [];
  for (const item of items) {
    const t = cleanSiteTag(item);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= SITE_TAGS_MAX_COUNT) break;
  }
  return out;
}

/** 读站点的标签列表：新字段 tags 存在（含空数组 = 已明确无标签）就以它为准；
 *  字段缺失时才回落旧单字段 tag（迁移前的存量对象也能正确显示） */
export function siteTags(site: SiteEntry): string[] {
  if (site.tags !== undefined) return cleanSiteTags(site.tags);
  return cleanSiteTags(site.tag);
}

/** 文件夹小角预设色（鲜明但不刺眼）：GroupPanel 里点选，卡面小角按色填充；空字符串 = 默认同色灰 */
export const GROUP_TAB_COLORS: { name: string; value: string }[] = [
  { name: '珊瑚红', value: '#e0655a' },
  { name: '橙', value: '#e8933a' },
  { name: '金黄', value: '#dfb83c' },
  { name: '翠绿', value: '#3fae6a' },
  { name: '青', value: '#2fa8a0' },
  { name: '天蓝', value: '#4a90d9' },
  { name: '紫罗兰', value: '#8b6fd8' },
  { name: '玫粉', value: '#d86a9e' },
];

export interface NavGroup {
  id: string;
  name: string;
  /** 卡片形态：list = B 详细列表卡；stack = C 文件夹堆叠卡 */
  display: GroupDisplay;
  /** 自定义副标题（历史字段：模型保留兼容老数据，第十二轮起无 UI 入口、不再渲染） */
  subtitle?: string;
  /** 文件夹小角（标签凸起）颜色：CSS 颜色值；为空/未设置 = 默认同色灰，用户靠颜色一眼认组 */
  tabColor?: string;
  /** 编组自身的搜索别名 */
  aliases?: string[];
  sites: SiteEntry[];
}

const iconMap: Record<string, string> = {
  'KIMI': '/icon_APP/KIMI.svg',
  'doubao': '/icon_APP/doubao.svg',
  'tongyi': '/icon_APP/tongyi.svg',
  'baidu': '/icon_APP/baidu.svg',
  'baiduchatgpt': '/icon_APP/baiduchatgpt.svg',
  'xunfeichatgpt': '/icon_APP/xunfeichatgpt.svg',
  'chatgpticon': '/icon_APP/chatgpticon.svg',
  'claude': '/icon_APP/claude.svg',
  'gemini': '/icon_APP/gemini.svg',
  'minimax': '/icon_APP/minimax.svg',
  'liblib': '/icon_APP/liblib.svg',
  'a-stablediffusion': '/icon_APP/a-stablediffusion.svg',
  'dalle': '/icon_APP/dalle.svg',
  'firefly': '/icon_APP/firefly.svg',
  'Midjourney': '/icon_APP/Midjourney.svg',
  'keling': '/icon_APP/keling.svg',
  'krea': '/icon_APP/krea.png',
  '海螺': '/icon_APP/hailuo.png',
  'jimengAI-01': '/icon_APP/jimengAI-01.svg',
  'Runwayml': '/icon_APP/Runwayml.svg',
  'Sora': '/icon_APP/Sora.svg',
  'pika': '/icon_APP/pika.svg',
  'jianying': '/icon_APP/jianying.svg',
  'icon-tengxun': '/icon_APP/icon-tengxun.svg',
  'suno': '/icon_APP/suno.svg',
  'udio': '/icon_APP/udio.svg',
  'cursor': '/icon_APP/cursor.svg',
  'windsurf': '/icon_APP/windsurf.svg',
  'github': '/icon_APP/github.svg',
  'vscode': '/icon_APP/vscode.svg',
  'trae1': '/icon_APP/trae1.png',
  '有道龙虾': '/icon_APP/youdao-longxia.svg',
  '元气AI': '/icon_APP/yuanqi-ai.png',
  'copaw': '/icon_APP/copaw.png',
  'openclaw': '/icon_APP/openclaw.svg',
  'deepseek': '/icon_APP/deepseek.svg',
  'nano-banana': '/icon_APP/nano-banana.svg',
  'flowith': '/icon_APP/Flowith.svg',
  '腾讯混元': '/icon_APP/tencent-hunyuan.svg',
  'notion': '/icon_APP/notion.jpg',
  '秘塔写作': '/icon_APP/mita-writing.png',
  '秘塔': '/icon_APP/mita-writing.png',
  // 第一百零五轮：AI 办公组与定版新站图标（均已落 public/icon_APP，来源同 NavPage 图标池；
  // zhipu 取 chatglm.cn 官网 favicon、vidu 取 vidu.com 官网 logo.svg）
  'elevenlabs': '/icon_APP/elevenlabs.svg',
  'feishu': '/icon_APP/feishu.png',
  'wps': '/icon_APP/wps.png',
  'aippt': '/icon_APP/aippt.png',
  'processon': '/icon_APP/processon.png',
  'chatexcel': '/icon_APP/chatexcel.svg',
  'beautiful.ai': '/icon_APP/beautifulai.png',
  'prezi': '/icon_APP/prezi.svg',
  'zhipu': '/icon_APP/zhipu.png',
  'vidu': '/icon_APP/vidu.svg',
  '火山写作': '/icon_APP/huoshan.png',
  'copy ai': '/icon_APP/copyai.png',
};

export const getSiteLogo = (name: string): string => {
  for (const [mapKey, path] of Object.entries(iconMap)) {
    if (name.toLowerCase().includes(mapKey.toLowerCase())) {
      return path;
    }
  }
  return `/icon_APP/${name}.svg`;
};

/** 名称命中内置图标映射时返回本地图标路径，否则 null（用户新增站点用） */
export function findMappedLogo(name: string): string | null {
  for (const [mapKey, path] of Object.entries(iconMap)) {
    if (name.toLowerCase().includes(mapKey.toLowerCase())) {
      return path;
    }
  }
  return null;
}

/**
 * 无真实图标时的统一字标（第八十四轮，用户口径）：站名首字——中文名取第一个汉字、
 * 英文名取首字母（大写），本地生成 SVG data URI。取代旧 DiceBear 随机矢量图：
 * 拿不到真实图标的站点一律出首字字标，不再用随机图/占位图顶替。
 */
export function siteLetterIcon(name: string): string {
  const ch = [...(name ?? '').trim()][0] ?? '?';
  const label = /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
  return letterIconDataUri(label);
}

const logoFallback = (name: string) => siteLetterIcon(name);

export const siteLogoFallback = logoFallback;

/* ---------- 站点图标解析（第四十九轮）：全站唯一的图标来源判定 ---------- */

/** 字母图标底色板：按文字哈希稳定取色（同一文字永远同色） */
const LETTER_ICON_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/** 用 1–2 个字符生成字母图标（本地 SVG data URI，不依赖网络）：圆角底 + 白色粗体居中字；
 *  bg 显式给定时用该色，否则按文字哈希自动取色（旧行为不变） */
export function letterIconDataUri(text: string, bg?: string): string {
  const chars = [...text.trim()].slice(0, 2);
  const label = chars.join('') || '?';
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const bgColor = bg && /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : LETTER_ICON_COLORS[hash % LETTER_ICON_COLORS.length];
  const fontSize = chars.length > 1 ? 34 : 44;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="20" fill="${bgColor}"/>` +
    `<text x="48" y="50" dy="0.36em" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 站点图标最终来源：upload → iconImage；text → 字母图；auto/存量 → logo（自动管线产物） */
export function siteIconSrc(site: SiteEntry): string {
  if (site.iconMode === 'upload' && site.iconImage) return site.iconImage;
  if (site.iconMode === 'text' && site.iconText?.trim()) return letterIconDataUri(site.iconText, site.iconColor);
  return site.logo;
}

/** 内置站点按域名匹配，避免中文站名/改名后错过本地图标；其余直接取站点图标。 */
export function autoSiteLogo(name: string, url: string): string {
  try {
    const host = new URL(url).hostname;
    const known = navGroups.flatMap((group) => group.sites).find((site) =>
      new URL(site.url).hostname === host && site.logo.startsWith('/icon_APP/'));
    if (known) return known.logo;
    const favicon = `${new URL(url).origin}/favicon.ico`;
    return localSiteIcons[favicon] ?? findMappedLogo(name) ?? favicon;
  } catch {
    return findMappedLogo(name) ?? siteLogoFallback(name);
  }
}

export const navGroups: NavGroup[] = [
  {
    id: 'ai-chat',
    name: 'AI 对话',
    display: 'list',
    aliases: ['聊天机器人', '对话', '聊天'],
    sites: [
      { name: 'ChatGPT', logo: getSiteLogo('chatgpticon'), description: 'OpenAI推出的AI对话助手', url: 'https://chat.openai.com', needVpn: true, pinned: true, frequency: 100, aliases: ['gpt', 'openai', '聊天机器人'] },
      { name: 'DeepSeek', logo: getSiteLogo('deepseek'), description: '深度求索AI助手', url: 'https://deepseek.com', needVpn: false, pinned: true, frequency: 96, aliases: ['ds', '深度求索'] },
      { name: '豆包', logo: getSiteLogo('doubao'), description: '字节跳动AI助手', url: 'https://www.doubao.com', needVpn: false, frequency: 92, aliases: ['doubao', '字节跳动'] },
      { name: 'Kimi', logo: getSiteLogo('KIMI'), description: '月之暗面推出的AI助手', url: 'https://kimi.moonshot.cn', needVpn: false, frequency: 88, aliases: ['月之暗面', 'moonshot', '长文本'] },
      { name: 'Claude', logo: getSiteLogo('claude'), description: 'Anthropic推出的智能助手', url: 'https://claude.ai', needVpn: true, frequency: 84, aliases: ['克劳德', 'anthropic'] },
      { name: '通义千问', logo: getSiteLogo('tongyi'), description: '阿里巴巴AI大模型', url: 'https://tongyi.aliyun.com', needVpn: false, frequency: 80, aliases: ['qwen', '千问', '通义', '阿里'] },
      { name: 'Gemini', logo: getSiteLogo('gemini'), description: 'Google多模态AI模型', url: 'https://gemini.google.com', needVpn: true, frequency: 76, aliases: ['google', '谷歌', '双子'] },
      { name: '文心一言', logo: getSiteLogo('baidu'), description: '百度AI对话助手', url: 'https://yiyan.baidu.com', needVpn: false, frequency: 72, aliases: ['ernie', '文心', '百度'] },
      { name: '腾讯混元', logo: getSiteLogo('腾讯混元'), description: '腾讯AI大模型', url: 'https://hunyuan.tencent.com', needVpn: false, frequency: 68, aliases: ['混元', 'hunyuan', '腾讯'] },
      { name: '讯飞星火', logo: getSiteLogo('xunfeichatgpt'), description: '科大讯飞AI大模型', url: 'https://xinghuo.xfyun.cn', needVpn: false, frequency: 64, aliases: ['星火', 'spark', '讯飞'] },
      { name: 'MiniMax', logo: getSiteLogo('minimax'), description: 'MiniMax AI助手，海螺AI出品', url: 'https://www.minimaxi.com', needVpn: false, frequency: 60, aliases: ['minimax'] },
      { name: '智谱清言', logo: getSiteLogo('zhipu'), description: '智谱AI推出的对话助手', url: 'https://chatglm.cn', needVpn: false, frequency: 56, aliases: ['zhipu', 'glm', '清言'] },
      { name: '盒豚查', logo: '/icon_APP/hetun-life.png', description: 'AI查卷工具人', url: 'https://mp.weixin.qq.com/s/Ak0rWbeGi0LtmbyqngAzlQ', needVpn: false, frequency: 40, aliases: ['查卷'] },
    ],
  },
  {
    id: 'image',
    name: '图像生成',
    display: 'stack',
    aliases: ['绘画', '图片', '绘图'],
    sites: [
      { name: 'Midjourney', logo: getSiteLogo('Midjourney'), description: '领先的AI图像生成工具', url: 'https://www.midjourney.com', needVpn: true, pinned: true, frequency: 96, aliases: ['mj'] },
      { name: '即梦', logo: getSiteLogo('jimengAI-01'), description: '字节跳动AI视频工具', url: 'https://jimeng.jike.com', needVpn: false, pinned: true, frequency: 92, aliases: ['jimeng'] },
      { name: 'Liblib', logo: getSiteLogo('liblib'), description: '国产AI图像生成平台', url: 'https://www.liblib.art', needVpn: false, frequency: 88, aliases: ['liblibai', '哩布'] },
      { name: '通义万相', logo: getSiteLogo('tongyi'), description: '阿里AI图像生成', url: 'https://tongyi.aliyun.com/wanxiang', needVpn: false, frequency: 84, aliases: ['万相'] },
      { name: 'Nano Banana', logo: getSiteLogo('nano-banana'), description: 'AI图像生成平台', url: 'https://nanobanana.com', needVpn: false, frequency: 80, aliases: ['香蕉'] },
      { name: 'Krea', logo: getSiteLogo('krea'), description: 'AI图像创作平台', url: 'https://krea.ai', needVpn: true, frequency: 76 },
      { name: 'DALL-E', logo: getSiteLogo('dalle'), description: 'OpenAI图像创作工具', url: 'https://openai.com/dall-e-3', needVpn: true, frequency: 72, aliases: ['dalle'] },
      { name: 'Firefly', logo: getSiteLogo('firefly'), description: 'Adobe创意AI工具', url: 'https://www.adobe.com/firefly', needVpn: true, frequency: 68, aliases: ['adobe'] },
      { name: 'Stable Diffusion', logo: getSiteLogo('a-stablediffusion'), description: '开源图像生成模型', url: 'https://stability.ai', needVpn: true, frequency: 64, aliases: ['sd'] },
    ],
  },
  {
    id: 'video',
    name: '视频生成',
    display: 'stack',
    aliases: ['视频', '影视'],
    sites: [
      { name: '可灵', logo: getSiteLogo('keling'), description: '快手AI视频生成', url: 'https://kling.kuaishou.com', needVpn: false, pinned: true, frequency: 96, aliases: ['kling', '快手'] },
      { name: '即梦', logo: getSiteLogo('jimengAI-01'), description: '字节跳动AI视频工具', url: 'https://jimeng.jike.com', needVpn: false, pinned: true, frequency: 92, aliases: ['jimeng'] },
      { name: '海螺', logo: getSiteLogo('海螺'), description: 'MiniMax视频生成工具', url: 'https://hailuo.ai', needVpn: false, frequency: 88, aliases: ['hailuo'] },
      { name: 'Sora', logo: getSiteLogo('Sora'), description: 'OpenAI视频生成模型', url: 'https://openai.com/sora', needVpn: true, frequency: 84 },
      { name: 'Runway', logo: getSiteLogo('Runwayml'), description: '专业AI视频编辑平台', url: 'https://runwayml.com', needVpn: true, frequency: 80 },
      { name: '剪映', logo: getSiteLogo('jianying'), description: '字节跳动AI视频剪辑', url: 'https://www.capcut.cn', needVpn: false, frequency: 76, aliases: ['capcut', '剪辑'] },
      { name: 'Vidu', logo: getSiteLogo('vidu'), description: '生数科技AI视频生成平台', url: 'https://www.vidu.com', needVpn: false, frequency: 72, aliases: ['vidu'] },
    ],
  },
  {
    id: 'writing',
    name: 'AI写作',
    display: 'stack',
    aliases: ['写作', '文案'],
    sites: [
      { name: 'Notion AI', logo: getSiteLogo('notion'), description: 'AI写作神器！比你想得更多！写得更快', url: 'https://www.notion.so', needVpn: true, pinned: true, frequency: 92, aliases: ['notion'] },
      { name: '秘塔写作猫', logo: getSiteLogo('秘塔写作'), description: '基于GPT的中文写作工具', url: 'https://xiezuocat.com', needVpn: false, pinned: true, frequency: 88, aliases: ['写作猫'] },
      { name: '火山写作', logo: getSiteLogo('火山写作'), description: '字节跳动AI写作工具，高效提升文案创作', url: 'https://writingo.volcengine.com', needVpn: false, frequency: 84 },
      { name: 'Copy AI', logo: getSiteLogo('Copy AI'), description: 'AI社交媒体文案写作助手', url: 'https://www.copy.ai', needVpn: true, frequency: 80, aliases: ['copyai'] },
      { name: '字语未来', logo: logoFallback('字语未来'), description: '用AI创造有价值的文案，让新一代智能办公更简单', url: 'https://www.ziyuweilai.com', needVpn: false, frequency: 76 },
      { name: '毕业宝AI论文降重', logo: logoFallback('毕业宝'), description: '论文降重神器！学生都在用的AI论文降重辅助AI工具', url: 'https://www.biyebao.com', needVpn: false, frequency: 72, aliases: ['论文降重'] },
    ],
  },
  {
    id: 'code',
    name: '编程工具',
    display: 'stack',
    aliases: ['编程', '代码', '开发'],
    sites: [
      { name: 'Cursor', logo: getSiteLogo('cursor'), description: 'AI驱动代码编辑器', url: 'https://cursor.sh', needVpn: true, pinned: true, frequency: 96, aliases: ['ai编辑器'] },
      { name: 'VS Code', logo: getSiteLogo('vscode'), description: '微软代码编辑器', url: 'https://code.visualstudio.com', needVpn: false, pinned: true, frequency: 92, aliases: ['vscode', '编辑器'] },
      { name: 'Trae', logo: getSiteLogo('trae1'), description: 'AI驱动开发环境', url: 'https://trae.ai', needVpn: false, frequency: 88 },
      { name: 'GitHub Copilot', logo: getSiteLogo('github'), description: 'GitHub AI编程助手', url: 'https://github.com/features/copilot', needVpn: true, frequency: 80, aliases: ['copilot'] },
      { name: '通义灵码', logo: getSiteLogo('tongyi'), description: '阿里AI编程助手', url: 'https://tongyi.aliyun.com/lingma', needVpn: false, frequency: 76, aliases: ['lingma'] },
      { name: 'Windsurf', logo: getSiteLogo('windsurf'), description: '现代AI代码编辑器', url: 'https://codeium.com/windsurf', needVpn: true, frequency: 72 },
      { name: '文心快码', logo: getSiteLogo('baidu'), description: '百度AI编程工具', url: 'https://cloud.baidu.com/product/codeassist', needVpn: false, frequency: 64 },
    ],
  },
  {
    id: 'audio',
    name: '音频生成',
    display: 'stack',
    aliases: ['音频', '音乐', '语音'],
    sites: [
      { name: 'Suno', logo: getSiteLogo('suno'), description: 'AI音乐生成热门工具', url: 'https://suno.ai', needVpn: true, pinned: true, frequency: 92, aliases: ['音乐生成'] },
      { name: 'ElevenLabs', logo: getSiteLogo('elevenlabs'), description: '逼真AI语音合成', url: 'https://elevenlabs.io', needVpn: true, pinned: true, frequency: 88, aliases: ['语音合成'] },
      { name: 'Udio', logo: getSiteLogo('udio'), description: '专业AI音乐创作平台', url: 'https://udio.com', needVpn: true, frequency: 84 },
      { name: 'TME Studio', logo: getSiteLogo('icon-tengxun'), description: '腾讯音乐AI工具', url: 'https://y.qq.com/tme_studio', needVpn: false, frequency: 80 },
    ],
  },
  {
    id: 'office',
    name: 'AI 办公',
    display: 'stack',
    aliases: ['办公', '文档', '协作'],
    sites: [
      { name: '飞书', logo: getSiteLogo('feishu'), description: '字节跳动一站式协作办公平台', url: 'https://www.feishu.cn/', needVpn: false, pinned: true, frequency: 96, aliases: ['feishu', 'lark'] },
      { name: 'WPS云文档', logo: getSiteLogo('wps'), description: '金山在线协作文档平台', url: 'https://www.wps.cn', needVpn: false, pinned: true, frequency: 92, aliases: ['wps'] },
      { name: 'AiPPT', logo: getSiteLogo('aippt'), description: '输入主题一键生成 PPT', url: 'https://www.aippt.cn/', needVpn: false, frequency: 88, aliases: ['aippt', 'ppt'] },
      { name: 'ProcessOn', logo: getSiteLogo('processon'), description: '在线流程图与思维导图工具', url: 'https://www.processon.com', needVpn: false, frequency: 84, aliases: ['processon'] },
      { name: 'ChatExcel', logo: getSiteLogo('chatexcel'), description: '对话式操作表格的 AI 工具', url: 'https://chatexcel.com/', needVpn: false, frequency: 80, aliases: ['chatexcel'] },
      { name: 'Beautiful.ai', logo: getSiteLogo('beautiful.ai'), description: 'AI驱动的PPT制作平台', url: 'https://www.beautiful.ai', needVpn: true, frequency: 76 },
      { name: 'Prezi', logo: getSiteLogo('prezi'), description: '非线性动态演示文稿工具', url: 'https://prezi.com', needVpn: true, frequency: 72 },
    ],
  },
];

/**
 * 组内排序（第三十八轮改版）：置顶在前，区内按「存储数组顺序」——手动拖动排序的结果就存数组序。
 * 此前的 frequency（点击量）排序退役：frequency 从未由点击行为更新过（只是种子里的静态值，
 * 且种子数组本身已按 frequency 降序编排），改数组序后存量数据的显示顺序不变；
 * frequency 字段保留在模型里仅作兼容，不再参与排序。
 */
export function sortSites(sites: SiteEntry[]): SiteEntry[] {
  const pinned = sites.filter((s) => s.pinned);
  const normal = sites.filter((s) => !s.pinned);
  return [...pinned, ...normal];
}

/** 编组图标：取组内频率最高站点的 logo */
export function groupIcon(group: NavGroup): string {
  const sorted = sortSites(group.sites);
  return sorted[0] ? siteIconSrc(sorted[0]) : '';
}
