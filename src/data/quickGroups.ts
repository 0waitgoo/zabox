/**
 * 快速组（2026-11-26 用户令）：主页顶部一排小按钮，点开展开搜集面板——
 * 最近流行什么就推荐什么工具/网页给用户，用户可把站拖进自己的组、或整组添加。
 * 静态定义，随版本更新：不进 store、不参与同步/导出/预设。
 * 图标不新做：面板里用现有 SiteLogo + siteIconSrc（按 name/url 解析品牌图标，
 * 没有的走字母图标兜底）；ad = 该站是广告（购物组里的盒豚生活，名字后标「广告」）。
 */

export interface QuickGroupSite {
  name: string;
  url: string;
  /** 一句中文短描述（≤10 字），瓷砖上展示 */
  desc?: string;
  /** 广告位：只在购物组里盒豚生活这一站为 true */
  ad?: boolean;
}

export interface QuickGroup {
  id: string;
  name: string;
  nameEn: string;
  sites: QuickGroupSite[];
}

export const QUICK_GROUPS: QuickGroup[] = [
  {
    id: 'manju',
    name: '漫剧创作',
    nameEn: 'Short Drama',
    sites: [
      { name: '即梦AI', url: 'https://jimeng.jianying.com', desc: 'AI 视频生成' },
      { name: '可灵AI', url: 'https://klingai.kuaishou.com', desc: 'AI 视频创作' },
      { name: 'Midjourney', url: 'https://www.midjourney.com', desc: 'AI 绘画神器' },
      { name: 'MiniMax 海螺AI', url: 'https://hailuoai.com', desc: 'AI 视频生成' },
      { name: 'Runway', url: 'https://runwayml.com', desc: 'AI 视频编辑' },
      { name: '剪映', url: 'https://www.capcut.cn', desc: '视频剪辑工具' },
      { name: '番茄小说', url: 'https://fanqie.com', desc: '免费小说阅读' },
      { name: 'shortdramas.com', url: 'https://shortdramas.com', desc: '漫剧出海平台' },
      { name: 'LiblibAI', url: 'https://www.liblib.tv', desc: 'AI 绘画平台' },
    ],
  },
  {
    id: 'design',
    name: '设计/编程',
    nameEn: 'Design & Code',
    sites: [
      { name: 'Figma', url: 'https://www.figma.com', desc: 'UI 设计工具' },
      { name: 'GitHub', url: 'https://github.com', desc: '代码托管平台' },
      { name: 'Vercel', url: 'https://vercel.com', desc: '前端部署平台' },
      { name: 'Dribbble', url: 'https://dribbble.com', desc: '设计灵感社区' },
      { name: 'Behance', url: 'https://www.behance.net', desc: '设计作品展示' },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', desc: '程序员问答' },
      { name: 'MDN', url: 'https://developer.mozilla.org', desc: 'Web 开发文档' },
      { name: 'CodePen', url: 'https://codepen.io', desc: '前端代码实验' },
      { name: '掘金', url: 'https://juejin.cn', desc: '开发者社区' },
    ],
  },
  {
    id: 'entertainment',
    name: '影视娱乐',
    nameEn: 'Entertainment',
    sites: [
      { name: 'Bilibili', url: 'https://www.bilibili.com', desc: '视频弹幕网站' },
      { name: 'YouTube', url: 'https://www.youtube.com', desc: '全球视频平台' },
      { name: '抖音', url: 'https://www.douyin.com', desc: '短视频平台' },
      { name: '爱奇艺', url: 'https://www.iqiyi.com', desc: '影视综艺' },
      { name: '腾讯视频', url: 'https://v.qq.com', desc: '影视综艺' },
      { name: 'Netflix', url: 'https://www.netflix.com', desc: '海外流媒体' },
      { name: '优酷', url: 'https://www.youku.com', desc: '视频网站' },
      { name: '芒果TV', url: 'https://www.mgtv.com', desc: '湖南卫视视频' },
    ],
  },
  {
    id: 'shopping',
    name: '购物领券',
    nameEn: 'Shopping & Coupons',
    sites: [
      { name: '盒豚生活', url: 'https://www.hiitun.top/', desc: '领券返利', ad: true },
      { name: '淘宝', url: 'https://www.taobao.com', desc: '综合购物平台' },
      { name: '京东', url: 'https://www.jd.com', desc: '正品自营购物' },
      { name: '拼多多', url: 'https://www.pinduoduo.com', desc: '拼单便宜好货' },
      { name: '天猫', url: 'https://www.tmall.com', desc: '品牌官方旗舰' },
      { name: '唯品会', url: 'https://www.vip.com', desc: '品牌特卖' },
      { name: '什么值得买', url: 'https://www.smzdm.com', desc: '好价爆料社区' },
    ],
  },
];
