/**
 * 快速组（2026-11-26 用户令）：主页顶部一排小按钮，点开展开搜集面板——
 * 最近流行什么就推荐什么工具/网页给用户，用户可把站拖进自己的组、或整组添加。
 * 静态定义，随版本更新：不进 store、不参与同步/导出/预设。
 * 图标不新做：面板里用现有 SiteLogo + siteIconSrc（按 name/url 解析品牌图标，
 * 没有的走字母图标兜底）。
 * 2026-11-26 预设大清理：主页预设只剩「我的」，被删的默认/设计师/程序员/
 * 娱乐导航 4 套预设里的站按主题收进这里（设计→设计/编程、开发→设计/编程、
 * 影视娱乐→影视娱乐、AI 创作→漫剧创作）；盒豚查按用户令（2026-10-24 停推）不收录；
 * 同服务不同域名（即梦/可灵/海螺/Liblib）只留快速组原有的一条，不重复。
 * 工具组不在此列：2026-11-26 用户令，工具按钮直接跳组件商店页（官方小工具），
 * 不展开搜集面板，故这里只有 4 组；工具按钮在 HomePage.tsx 里单独挂。
 * 2026-11-26 漫剧创作组按用户令重整：无限画布（LibTV、Toonflow）＋大模型
 * （即梦/可灵/海螺/Sora/Runway/Vidu/Pika/Luma/Pixverse/清影/混元视频/Flow）
 * ＋配音（ElevenLabs/魔音工坊/讯飞配音/Suno/Udio）＋剪辑（剪映/喵影/Kapwing/
 * 必剪）＋漫剧平台/剧本；纯图片生成（Midjourney/DALL-E 等）与数字人站已删；
 * LiblibAI 条目实为 LibTV（liblib.tv），已正名为 LibTV。
 */

export interface QuickGroupSite {
  name: string;
  url: string;
  /** 一句中文短描述（≤10 字），瓷砖上展示 */
  desc?: string;
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
      { name: 'LibTV', url: 'https://www.liblib.tv', desc: '无限画布漫剧创作' },
      { name: 'Toonflow', url: 'https://toonflow.net', desc: '开源无限画布漫剧' },
      { name: '即梦AI', url: 'https://jimeng.jianying.com', desc: 'AI 视频生成' },
      { name: '可灵AI', url: 'https://klingai.kuaishou.com', desc: 'AI 视频创作' },
      { name: 'MiniMax 海螺AI', url: 'https://hailuoai.com', desc: 'AI 视频生成' },
      { name: 'Sora', url: 'https://openai.com/sora', desc: 'OpenAI视频生成' },
      { name: 'Runway', url: 'https://runwayml.com', desc: 'AI 视频编辑' },
      { name: 'Vidu', url: 'https://www.vidu.com', desc: 'AI视频生成平台' },
      { name: 'Pika', url: 'https://pika.art', desc: '快速AI视频创作' },
      { name: 'Luma', url: 'https://lumalabs.ai/dream-machine', desc: 'AI电影级视频' },
      { name: 'Pixverse', url: 'https://pixverse.ai', desc: 'AI视频生成' },
      { name: '智谱清影', url: 'https://chatglm.cn/video', desc: '国产AI视频生成' },
      { name: '腾讯混元视频', url: 'https://aivideo.hunyuan.tencent.com', desc: '腾讯AI视频生成' },
      { name: 'Google Flow', url: 'https://labs.google/fx/tools/flow', desc: '谷歌AI电影制作' },
      { name: 'ElevenLabs', url: 'https://elevenlabs.io', desc: 'AI语音合成' },
      { name: '魔音工坊', url: 'https://www.moyin.com', desc: '中文AI配音' },
      { name: '讯飞配音', url: 'https://peiyin.xunfei.cn', desc: '讯飞AI配音' },
      { name: 'Suno', url: 'https://suno.ai', desc: 'AI音乐生成工具' },
      { name: 'Udio', url: 'https://udio.com', desc: 'AI音乐创作平台' },
      { name: '剪映', url: 'https://www.capcut.cn', desc: '视频剪辑工具' },
      { name: '万兴喵影', url: 'https://miao.wondershare.cn/', desc: '国产视频剪辑软件' },
      { name: 'Kapwing', url: 'https://www.kapwing.com', desc: '在线AI视频编辑平台' },
      { name: '必剪', url: 'https://bcut.bilibili.cn', desc: 'B站视频剪辑' },
      { name: 'shortdramas.com', url: 'https://shortdramas.com', desc: '漫剧出海平台' },
      { name: '番茄小说', url: 'https://fanqie.com', desc: '免费小说阅读' },
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
      { name: 'Unsplash', url: 'https://unsplash.com/', desc: '免费高清图库' },
      { name: 'Pexels', url: 'https://www.pexels.com/', desc: '免费高清图片素材' },
      { name: 'Pixabay', url: 'https://pixabay.com/', desc: '免费图片插画素材' },
      { name: 'Freepik', url: 'https://www.freepik.com/', desc: '设计素材库' },
      { name: '摄图网', url: 'https://699pic.com/', desc: '正版图片素材库' },
      { name: '包图网', url: 'https://ibaotu.com/', desc: '设计素材下载站' },
      { name: 'IconFont', url: 'https://www.iconfont.cn/', desc: '阿里图标搜索平台' },
      { name: 'Flaticon', url: 'https://www.flaticon.com/', desc: '扁平图标库' },
      { name: 'Icons8', url: 'https://icons8.com/', desc: '图标与设计素材' },
      { name: 'IconPark', url: 'https://iconpark.oceanengine.com/', desc: '字节开源图标库' },
      { name: '500px', url: 'https://500px.com.cn/', desc: '专业摄影分享平台' },
      { name: 'Pinterest', url: 'https://www.pinterest.com/', desc: '图片灵感采集平台' },
      { name: '花瓣网', url: 'https://huaban.com/', desc: '设计灵感采集平台' },
      { name: '站酷', url: 'https://www.zcool.com.cn/', desc: '设计师交流平台' },
      { name: 'Mobbin', url: 'https://mobbin.com/', desc: 'App界面设计灵感' },
      { name: 'Coolors', url: 'https://coolors.co/', desc: '在线配色方案生成' },
      { name: 'Color Hunt', url: 'https://colorhunt.co/', desc: '手选配色方案' },
      { name: 'Adobe Color', url: 'https://color.adobe.com/', desc: 'Adobe官方配色' },
      { name: 'UI Gradients', url: 'https://uigradients.com/', desc: '渐变配色灵感库' },
      { name: '猫啃网', url: 'https://www.maoken.com/', desc: '免费商用中文字体' },
      { name: 'DaFont', url: 'https://www.dafont.com/', desc: '免费字体下载站' },
      { name: '求字体', url: 'https://www.qiuziti.com/', desc: '字体识别与下载' },
      { name: 'Cursor', url: 'https://cursor.sh', desc: 'AI驱动代码编辑器' },
      { name: 'VS Code', url: 'https://code.visualstudio.com', desc: '微软代码编辑器' },
      { name: 'Trae', url: 'https://trae.ai', desc: 'AI驱动开发环境' },
      { name: 'GitHub Copilot', url: 'https://github.com/features/copilot', desc: 'GitHub编程助手' },
      { name: '通义灵码', url: 'https://tongyi.aliyun.com/lingma', desc: '阿里AI编程助手' },
      { name: 'Windsurf', url: 'https://codeium.com/windsurf', desc: 'AI代码编辑器' },
      { name: '文心快码', url: 'https://cloud.baidu.com/product/codeassist', desc: '百度AI编程工具' },
      { name: '百度AI', url: 'https://ai.baidu.com', desc: '百度AI开放平台' },
      { name: '腾讯AI', url: 'https://ai.qq.com', desc: '腾讯AI开放平台' },
      { name: '讯飞开放平台', url: 'https://www.xfyun.cn', desc: '科大讯飞AI开放平台' },
      { name: 'HuggingFace', url: 'https://huggingface.co/', desc: 'AI模型与数据集社区' },
      { name: 'Replit', url: 'https://replit.com', desc: '在线AI编程平台' },
      { name: 'StackBlitz', url: 'https://stackblitz.com', desc: '浏览器在线开发环境' },
      { name: 'Warp', url: 'https://www.warp.dev/', desc: '内置AI的新一代终端' },
      { name: 'Canva可画', url: 'https://www.canva.cn', desc: '在线设计平台' },
      { name: '稿定设计', url: 'https://www.gaoding.com', desc: '在线平面设计平台' },
      { name: '即时设计', url: 'https://js.design', desc: '国产在线协作设计' },
      { name: '创客贴', url: 'https://www.chuangkit.com', desc: '在线平面设计工具' },
      { name: 'MasterGo', url: 'https://mastergo.com/', desc: '国产云端协作设计' },
      { name: 'Photopea', url: 'https://www.photopea.com/', desc: '免费在线版PS' },
      { name: 'Recraft', url: 'https://www.recraft.ai/', desc: 'AI矢量图设计生成' },
      { name: '标小智', url: 'https://www.logosc.cn/', desc: 'AI智能Logo设计' },
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
      { name: '看看鸭', url: 'https://www.kankanya.me/', desc: '高清在线追剧' },
      { name: '注视影视', url: 'https://gaze.red/', desc: '海外影视剧资源' },
      { name: 'No视频', url: 'https://www.novipnoad.uk/', desc: '海外影视追剧' },
      { name: '剧OK', url: 'https://juok3.top/', desc: '全网影视在线追剧' },
      { name: '真狼影视', url: 'https://zlys9.top/', desc: '免费在线追剧' },
      { name: '西瓜影院', url: 'https://www.xiguadh.com/', desc: '高清影视在线观看' },
      { name: 'LIBVIO', url: 'https://www.libvio.io/', desc: '海外影视资源站' },
      { name: '厂长资源', url: 'https://www.cz4k.com/', desc: '高清秒播影视站' },
      { name: '爱壹帆', url: 'https://iyf.tv/', desc: '海外华人影视站' },
      { name: 'TVGarden', url: 'https://tv.garden/', desc: '全球直播电视聚合' },
      { name: 'AniCh动漫弹幕网', url: 'https://anich.emmmm.eu.org/', desc: '高清追番平台' },
      { name: '月之祠动漫', url: 'https://www.moonci.com', desc: '日漫追番网站' },
      { name: '动漫窝', url: 'https://www.dmwo.one/', desc: '国漫日漫美漫追番' },
      { name: '佩可爱动漫', url: 'https://ani.pekolove.net/', desc: '日本动漫在线观看' },
      { name: '西瓜卡通', url: 'https://www.cnxgct.com/', desc: '4K超清动漫观看' },
      { name: 'E站弹幕网', url: 'https://www.ezdmw.org/', desc: '二次元追番社区' },
      { name: 'TvTFun', url: 'https://www.tvtfun.net/', desc: '日本番剧追番站' },
      { name: 'Anime1.me', url: 'https://anime1.me/', desc: '日番追番神器' },
      { name: '粤漫之家', url: 'https://www.ymvid.com/', desc: '粤语动画追番站' },
      { name: 'SPlayer', url: 'https://splayer.uncley.cc/', desc: '网易云第三方播放器' },
      { name: '魔力音乐', url: 'https://yy.juhuang.xyz/', desc: '五大平台曲库音乐' },
      { name: 'GD音乐台', url: 'https://music.gdstudio.org', desc: '多平台曲库听歌' },
      { name: '飞鸟·轻音', url: 'http://music.xn--q35am7h.site/', desc: '试听下载MV音乐' },
      { name: '米兔音乐', url: 'https://www.qqmp3.vip/', desc: '歌曲试听免费下载' },
      { name: '布谷音乐', url: 'https://www.buguyy.cc', desc: 'MP3歌曲下载站' },
      { name: 'mmPlayer', url: 'https://netease-music.fe-mm.com/#/music/toplist', desc: '网易云在线播放器' },
      { name: '音乐库', url: 'http://www.yinyueku.cn/', desc: '网易云网页播放器' },
      { name: '昔枫音乐盒', url: 'https://mu-jie.cc/musicBox/', desc: '网易云免费音乐播放' },
      { name: 'Z-Library', url: 'https://zh.z2026.ru/', desc: '全球最大免费图书馆' },
      { name: '安娜的档案', url: 'https://zh.annas-archive.gd/', desc: '开源开放电子书图书馆' },
      { name: '识典古籍', url: 'https://www.shidianguji.com/', desc: '古籍在线阅读' },
      { name: '书格', url: 'https://www.shuge.org/', desc: '开放古籍数字图书馆' },
      { name: '鸠摩搜索', url: 'https://www.jiumodiary.com/', desc: '电子书文档搜索' },
      { name: '读书派', url: 'https://www.dushupai.com/', desc: '免费电子书下载' },
      { name: 'SoBooks', url: 'https://sobooks.cc/', desc: '免费电子书下载' },
      { name: '好读', url: 'https://haodoo.org/', desc: '繁体电子书资源' },
      { name: '鹿鸣川', url: 'https://lunarora.com/', desc: '高质量电子书资源' },
      { name: '电子书之家', url: 'https://honeypdf.com/', desc: '全网电子书免费下载' },
      { name: 'Switch520', url: 'https://www.gamer520.com/', desc: 'Switch游戏下载' },
      { name: '小妖怪分享', url: 'https://www.xyg688.com/', desc: '游戏免费分享' },
      { name: 'flysheep资源避难所', url: 'https://www.flysheep6.com/', desc: '单机游戏免费下载' },
      { name: '机地游戏', url: 'https://www.jidiyouxi.com/', desc: '单机Switch游戏' },
      { name: '蒸汽游戏宝库', url: 'https://www.steambk.com/', desc: 'Steam单机游戏' },
      { name: 'FC图库', url: 'https://fcpic.nesbbs.com/game.html', desc: '红白机游戏下载' },
      { name: '老机库', url: 'https://laojiku.com/', desc: '怀旧游戏资源' },
      { name: '游仓酷', url: 'https://yxcku.com/', desc: '单机游戏MOD资源' },
      { name: 'NS头号玩家', url: 'https://nsthwj.vip/', desc: 'Switch游戏资源' },
      { name: '芝士游戏', url: 'https://www.cheesegame.org/', desc: '免费PC单机游戏' },
    ],
  },
  {
    id: 'shopping',
    name: '购物领券',
    nameEn: 'Shopping & Coupons',
    sites: [
      { name: '盒豚生活', url: 'https://www.hiitun.top/', desc: '领券返利' },
      { name: '淘宝', url: 'https://www.taobao.com', desc: '综合购物平台' },
      { name: '京东', url: 'https://www.jd.com', desc: '正品自营购物' },
      { name: '拼多多', url: 'https://www.pinduoduo.com', desc: '拼单便宜好货' },
      { name: '天猫', url: 'https://www.tmall.com', desc: '品牌官方旗舰' },
      { name: '唯品会', url: 'https://www.vip.com', desc: '品牌特卖' },
    ],
  },
];
