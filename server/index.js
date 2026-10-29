import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let cachedNews = [];
let cachedTrends = [];
let lastUpdate = null;

const aiNewsData = [
  { title: 'OpenAI发布GPT-4.5：推理能力大幅提升', description: '最新版本在数学、编程和创意写作方面展现突破性进展，响应速度提升50%', source: '36Kr', category: '语言模型', url: 'https://36kr.com/' },
  { title: 'Claude 4正式推出：专注模式大幅增强', description: 'Anthropic发布新一代Claude模型，长任务处理能力提升3倍', source: '量子位', category: '语言模型', url: 'https://www.qbitai.com/' },
  { title: 'Sora新版本发布：视频生成质量超越真实', description: 'OpenAI视频生成工具实现重大突破，生成视频时长可达60秒', source: '机器之心', category: '视频AI', url: 'https://www.jiqizhixin.com/' },
  { title: 'Midjourney v7发布：图像细节再创新高', description: '新一代图像生成模型在写实和艺术风格上都有显著提升', source: '爱范儿', category: '图像AI', url: 'https://www.ifanr.com/' },
  { title: 'Kimi智能助手用户突破5000万', description: '月之暗面AI产品增速创国产AI应用纪录，月活用户数持续攀升', source: '36Kr', category: '行业动态', url: 'https://36kr.com/' },
  { title: '可灵AI视频生成全面开放API', description: '快手可灵AI开放企业级API接口，支持批量视频创作', source: '极客公园', category: '视频AI', url: 'https://www.geekpark.net/' },
  { title: 'Google发布Gemini 2.5 Pro：多模态能力领先', description: 'Google最新多模态模型在各项基准测试中刷新纪录', source: '品玩', category: '多模态', url: 'https://www.pingwest.com/' },
  { title: 'Suno v4发布：专业音乐制作能力增强', description: 'AI音乐生成工具新增专业混音功能，音乐人创作更便捷', source: '爱范儿', category: '音频AI', url: 'https://www.ifanr.com/' },
  { title: '百度文心一言4.0企业版正式发布', description: '百度发布新一代企业级AI服务，支持私有化部署', source: '36Kr', category: '语言模型', url: 'https://36kr.com/' },
  { title: 'Meta开源LLaMA 4：性能超越闭源模型', description: 'Meta新一代开源大模型参数规模达千亿级别', source: '虎嗅', category: '语言模型', url: 'https://www.huxiu.com/' },
];

function initializeData() {
  cachedNews = aiNewsData.map((item, idx) => ({
    ...item,
    id: idx + 1,
    publishedAt: new Date(Date.now() - idx * 3600000).toISOString()
  }));
  lastUpdate = new Date().toISOString();
}

initializeData();

/* ---------- 热门话题：真实热榜聚合（第九十五轮，与 api/index.js 等价实现） ----------
 * 数据源：百度热搜（hotScore）+ 微博热搜（num），heat 均为源站真实热度原值。
 * 双源交错合并、缓存 10 分钟、失败用最近成功缓存并标 stale；旧版写死的
 * #Sora/12.4万 等模拟数据已删除，拉不到就返回空，绝不编造。 */
let trendsUpdatedAt = null;
let trendsStale = false;
const TRENDS_TTL_MS = 10 * 60 * 1000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function formatHeat(heat) {
  if (typeof heat !== 'number' || !isFinite(heat)) return '';
  if (heat >= 10000) {
    const v = Math.round(heat / 1000) / 10;
    return `${Number.isInteger(v) ? v.toFixed(0) : v}万`;
  }
  return `${heat}`;
}

async function fetchJSONVia(url, headers = {}) {
  const text = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', ...headers } }, 8000);
  return JSON.parse(text);
}

async function fetchBaiduTrends() {
  const json = await fetchJSONVia('https://top.baidu.com/api/board?tab=realtime');
  const content = json?.data?.cards?.[0]?.content || [];
  return content
    .filter((it) => it && it.word && it.hotScore != null && !it.isTop)
    .slice(0, 15)
    .map((it) => ({
      topic: it.word,
      heat: Number(it.hotScore),
      source: '百度热搜',
      url: it.url || it.appUrl || 'https://top.baidu.com/board?tab=realtime',
    }));
}

async function fetchWeiboTrends() {
  const json = await fetchJSONVia('https://weibo.com/ajax/side/hotSearch', { Referer: 'https://weibo.com/' });
  const realtime = json?.data?.realtime || [];
  return realtime
    .filter((it) => it && (it.note || it.word) && typeof it.num === 'number')
    .slice(0, 15)
    .map((it) => ({
      topic: it.note || it.word,
      heat: it.num,
      source: '微博热搜',
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(it.word_scheme || `#${it.word}#`)}`,
    }));
}

function interleaveTrends(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

let trendsRefreshing = null;
async function refreshTrends() {
  if (trendsRefreshing) return trendsRefreshing;
  trendsRefreshing = (async () => {
    const [weibo, baidu] = await Promise.allSettled([fetchWeiboTrends(), fetchBaiduTrends()]);
    const weiboItems = weibo.status === 'fulfilled' ? weibo.value : [];
    const baiduItems = baidu.status === 'fulfilled' ? baidu.value : [];
    if (weibo.status === 'rejected') console.log('微博热搜抓取失败:', weibo.reason?.message);
    if (baidu.status === 'rejected') console.log('百度热搜抓取失败:', baidu.reason?.message);
    const merged = interleaveTrends(weiboItems, baiduItems);
    if (merged.length > 0) {
      cachedTrends = merged.map((it, idx) => ({ ...it, id: idx + 1, heatText: formatHeat(it.heat) }));
      trendsUpdatedAt = new Date().toISOString();
      trendsStale = false;
      console.log(`Trends synced: 微博 ${weiboItems.length} + 百度 ${baiduItems.length}`);
    } else if (cachedTrends.length > 0) {
      trendsStale = true;
      console.log('Trends refresh failed, serving stale cache');
    }
    return cachedTrends;
  })();
  try { await trendsRefreshing; } finally { trendsRefreshing = null; }
  return cachedTrends;
}

async function ensureTrends() {
  const fresh = trendsUpdatedAt && Date.now() - new Date(trendsUpdatedAt).getTime() < TRENDS_TTL_MS;
  if (!fresh) await refreshTrends();
  return cachedTrends;
}

function fetchWithTimeout(url, options = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      ...options.headers
    };
    
    const req = protocol.get(url, { timeout, headers, ...options }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/i);
    const linkMatch = itemContent.match(/<link[^>]*>(.*?)<\/link>/i);
    const descMatch = itemContent.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/i);
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i);
    
    items.push({
      title: titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '',
      link: linkMatch ? linkMatch[1].trim() : '',
      description: descMatch ? (descMatch[1] || descMatch[2] || '').trim() : '',
      pubDate: pubDateMatch ? pubDateMatch[1].trim() : ''
    });
  }
  
  return items;
}

function isAINews(title) {
  const keywords = ['AI', '人工智能', '大模型', 'GPT', 'Sora', 'Claude', 'Kimi', 'Gemini', 'Midjourney', 'Suno', '视频生成', '图像生成', 'LLM', '模型', 'OpenAI', 'Anthropic', '月之暗面', '通义', '文心', '字节', '腾讯', '华为', '芯片', 'GPU', 'Agent'];
  const lowerTitle = title.toLowerCase();
  return keywords.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
}

async function syncNews() {
  console.log('Starting news sync...');
  const allNews = [];
  const RSS_URLS = [
    { url: 'https://www.36kr.com/feed', source: '36Kr', category: 'AI新闻' },
    { url: 'https://www.qbitai.com/feed', source: '量子位', category: 'AI报道' },
  ];
  
  for (const rssConfig of RSS_URLS) {
    try {
      console.log(`Fetching ${rssConfig.url}...`);
      const xml = await fetchWithTimeout(rssConfig.url, {}, 15000);
      const items = parseRSS(xml);
      
      items.slice(0, 15).forEach((item) => {
        if (isAINews(item.title)) {
          allNews.push({
            title: item.title,
            description: item.description.replace(/<[^>]+>/g, '').substring(0, 200),
            source: rssConfig.source,
            category: rssConfig.category,
            url: item.link,
            publishedAt: item.pubDate || new Date().toISOString()
          });
        }
      });
    } catch (error) {
      console.log(`${rssConfig.source} RSS fetch failed: ${error.message}`);
    }
  }
  
  if (allNews.length < 5) {
    console.log('Using fallback AI news data');
    cachedNews = aiNewsData.map((item, idx) => ({
      ...item,
      id: idx + 1,
      publishedAt: new Date(Date.now() - idx * 3600000 * Math.random() * 24).toISOString()
    }));
  } else {
    cachedNews = allNews.map((item, idx) => ({
      ...item,
      id: idx + 1,
      publishedAt: item.publishedAt || new Date(Date.now() - idx * 3600000).toISOString()
    }));
  }
  
  lastUpdate = new Date().toISOString();
  console.log(`Synced ${cachedNews.length} news items`);
  return { newsCount: cachedNews.length, trendsCount: cachedTrends.length };
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

app.get('/api', async (req, res) => {
  const { type, limit = 20, offset = 0 } = req.query;

  if (type === 'news') {
    const shuffled = shuffleArray(cachedNews);
    return res.status(200).json({
      success: true,
      data: shuffled.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
      lastUpdate
    });
  }

  if (type === 'trends') {
    const data = await ensureTrends();
    if (data.length === 0) {
      return res.status(200).json({
        success: false,
        data: [],
        updatedAt: trendsUpdatedAt,
        stale: false,
        error: '热榜源暂时不可达'
      });
    }
    return res.status(200).json({
      success: true,
      data,
      updatedAt: trendsUpdatedAt,
      stale: trendsStale
    });
  }
  
  if (type === 'health') {
    return res.status(200).json({
      status: 'ok',
      newsCount: cachedNews.length,
      trendsCount: cachedTrends.length,
      lastUpdate
    });
  }
  
  if (type === 'sync') {
    syncNews().then(async (result) => {
      await refreshTrends();
      return res.status(200).json({
        success: true,
        ...result,
        trendsCount: cachedTrends.length,
        lastUpdate
      });
    }).catch(error => {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    });
    return;
  }
  
  const trends = await ensureTrends();
  return res.status(200).json({
    success: true,
    news: shuffleArray(cachedNews).slice(0, 10),
    trends,
    lastUpdate
  });
});

// 主页 AI 整理中转（2026-10-30，与 api/index.js 的 ai-chat 动作等价）：仅转发，不存口令、不记请求体。
app.post('/api', async (req, res, next) => {
  const { action, baseUrl, model, key, messages } = req.body || {};
  if (action !== 'ai-chat') {
    return next();
  }
  if (
    typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl) ||
    typeof model !== 'string' || !model.trim() ||
    typeof key !== 'string' || !key.trim() ||
    !Array.isArray(messages) || messages.length === 0
  ) {
    return res.status(400).json({ success: false, error: '参数不完整' });
  }
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.trim(), temperature: 0.2, max_tokens: 3000, messages }),
    });
    const text = await r.text();
    if (!r.ok) {
      return res.status(200).json({
        success: false,
        error: `服务商返回 ${r.status}${text ? `：${text.slice(0, 120)}` : ''}`,
      });
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(200).json({ success: false, error: '服务商返回的不是合法 JSON' });
    }
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(200).json({ success: false, error: '服务商没有返回可用内容' });
    }
    return res.status(200).json({ success: true, content });
  } catch {
    return res.status(200).json({ success: false, error: '中转请求失败，请检查地址与网络' });
  }
});

// 设置里「获取模型」的中转（2026-10-30 补充，与 api/index.js 的 ai-models 动作等价）：仅转发，不存口令、不记请求体。
app.post('/api', async (req, res) => {
  const { action, baseUrl, key } = req.body || {};
  if (action !== 'ai-models') {
    return res.status(400).json({ success: false, error: 'Unknown action' });
  }
  if (
    typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl) ||
    typeof key !== 'string' || !key.trim()
  ) {
    return res.status(400).json({ success: false, error: '参数不完整' });
  }
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await r.text();
    if (!r.ok) {
      const reason =
        r.status === 401
          ? '口令不对（服务商返回 401），请检查口令'
          : r.status === 404
            ? '该地址没有 /models 接口（可能不是 OpenAI 兼容接口），请手动填模型名'
            : `服务商返回 ${r.status}${text ? `：${text.slice(0, 120)}` : ''}`;
      return res.status(200).json({ success: false, error: reason });
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(200).json({ success: false, error: '服务商返回的不是合法 JSON' });
    }
    const models = Array.isArray(json?.data)
      ? [...new Set(json.data.map((d) => d?.id).filter((id) => typeof id === 'string' && id))]
      : [];
    if (models.length === 0) {
      return res.status(200).json({ success: false, error: '服务商返回了空模型列表' });
    }
    return res.status(200).json({ success: true, models });
  } catch {
    return res.status(200).json({ success: false, error: '中转请求失败，请检查地址与网络' });
  }
});

const INTERVAL = 6 * 60 * 60 * 1000;

syncNews().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API endpoints:`);
    console.log(`  - GET  /api?type=news   - Get news list`);
    console.log(`  - GET  /api?type=trends  - Get trends`);
    console.log(`  - GET  /api?type=health  - Health check`);
    console.log(`  - GET  /api?type=sync    - Force sync news`);
    console.log(`  - POST /api (action=ai-chat) - AI 整理中转`);
    console.log(`  - POST /api (action=ai-models) - 获取模型列表中转`);
    console.log(`Auto-update: Every ${INTERVAL / 1000 / 60} minutes`);
  });
  
  setInterval(() => {
    syncNews().catch(error => {
      console.error('Auto sync failed:', error);
    });
  }, INTERVAL);
});
