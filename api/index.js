// Vercel Serverless Function - 直接抓取RSS新闻
// 不依赖Railway，直接在这里实现RSS抓取

import https from 'https';
import http from 'http';
// 直接导入 ranking-data.js 中的数据
import { softwareRankingData, rankingMeta } from './ranking-data.js';

// RSS源配置
const RSS_URLS = [
  { url: 'https://www.36kr.com/feed', source: '36Kr', category: 'AI新闻' },
  { url: 'https://www.qbitai.com/feed', source: '量子位', category: 'AI报道' },
];

// 备用数据
const fallbackNewsData = [
  { title: 'OpenAI发布GPT-4.5：推理能力大幅提升', description: '最新版本在数学、编程和创意写作方面展现突破性进展，响应速度提升50%', source: '36Kr', category: '语言模型', url: 'https://36kr.com/', publishedAt: new Date().toISOString() },
  { title: 'Claude 4正式推出：专注模式大幅增强', description: 'Anthropic发布新一代Claude模型，长任务处理能力提升3倍', source: '量子位', category: '语言模型', url: 'https://www.qbitai.com/', publishedAt: new Date(Date.now() - 3600000).toISOString() },
  { title: 'Sora新版本发布：视频生成质量超越真实', description: 'OpenAI视频生成工具实现重大突破，生成视频时长可达60秒', source: '机器之心', category: '视频AI', url: 'https://www.jiqizhixin.com/', publishedAt: new Date(Date.now() - 7200000).toISOString() },
];

console.log(`✅ API 加载了 ${softwareRankingData.length} 条软件排行数据`);

// 全局缓存
let cachedNews = [];
let cachedTrends = [];
let trendsUpdatedAt = null;
let trendsStale = false;
let lastUpdate = null;
let isInitialized = false;

/* ---------- 热门话题：真实热榜聚合（第九十五轮） ----------
 * 数据源（均为源站公开接口，heat 为源站真实热度原值，不做任何编造）：
 *   - 百度热搜 https://top.baidu.com/api/board?tab=realtime（hotScore）
 *   - 微博热搜 https://weibo.com/ajax/side/hotSearch（num）
 * 双源各按源内排名交错合并；成功结果缓存 10 分钟；
 * 刷新全失败时返回最近一次成功缓存并标 stale + 原 updatedAt；无缓存时返回失败，
 * 前端显示空态——旧版写死的 #Sora/12.4万 等模拟数据已删除，绝不再上屏。 */

const TRENDS_TTL_MS = 10 * 60 * 1000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function fetchJSON(url, headers = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', ...headers } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout for ${url}`)); });
  });
}

/** 真实热度值 → 展示文本（纯格式化：7713136 → 「771.3万」；650424 → 「65万」） */
function formatHeat(heat) {
  if (typeof heat !== 'number' || !isFinite(heat)) return '';
  if (heat >= 10000) {
    const v = Math.round(heat / 1000) / 10;
    return `${Number.isInteger(v) ? v.toFixed(0) : v}万`;
  }
  return `${heat}`;
}

async function fetchBaiduTrends() {
  const json = await fetchJSON('https://top.baidu.com/api/board?tab=realtime');
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
  const json = await fetchJSON('https://weibo.com/ajax/side/hotSearch', { Referer: 'https://weibo.com/' });
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

/** 双源交错合并（微博1, 百度1, 微博2, 百度2…），保持各源内部排名原序 */
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

// 获取RSS内容
function fetchRSS(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    }, (res) => {
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

// 解析RSS
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

// 判断是否是AI新闻
function isAINews(title) {
  const keywords = ['AI', '人工智能', '大模型', 'GPT', 'Sora', 'Claude', 'Kimi', 'Gemini', 'Midjourney', 'Suno', '视频生成', '图像生成', 'LLM', '模型', 'OpenAI', 'Anthropic', '月之暗面', '通义', '文心', '字节', '腾讯', '华为', '芯片', 'GPU', 'Agent', '算力', '深度学习', '神经网络'];
  const lowerTitle = title.toLowerCase();
  return keywords.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
}

// 同步新闻
async function syncNews() {
  console.log('Syncing news from RSS...');
  const allNews = [];
  
  for (const rssConfig of RSS_URLS) {
    try {
      console.log(`Fetching ${rssConfig.source}...`);
      const xml = await fetchRSS(rssConfig.url, 8000);
      const items = parseRSS(xml);
      
      items.slice(0, 10).forEach((item) => {
        if (isAINews(item.title)) {
          allNews.push({
            title: item.title,
            description: item.description.replace(/<[^>]+>/g, '').substring(0, 200),
            source: rssConfig.source,
            category: rssConfig.category,
            url: item.link.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1'),
            publishedAt: item.pubDate || new Date().toISOString()
          });
        }
      });
    } catch (error) {
      console.log(`${rssConfig.source} failed: ${error.message}`);
    }
  }
  
  if (allNews.length > 0) {
    cachedNews = allNews.map((item, idx) => ({
      ...item,
      id: idx + 1
    }));
    lastUpdate = new Date().toISOString();
    console.log(`Synced ${cachedNews.length} news items`);
  } else {
    console.log('Using fallback data');
    cachedNews = fallbackNewsData.map((item, idx) => ({ ...item, id: idx + 1 }));
    lastUpdate = new Date().toISOString();
  }
  
  isInitialized = true;
  return { newsCount: cachedNews.length, trendsCount: cachedTrends.length };
}

// 打乱数组
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Vercel Handler
export default async function handler(req, res) {
  const { method } = req;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 初始化数据（如果还没初始化）
  if (!isInitialized) {
    await syncNews();
  }

  if (method === 'GET') {
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

    if (type === 'software-ranking') {
      return res.status(200).json({
        success: true,
        data: softwareRankingData,
        meta: rankingMeta,
        lastUpdate,
        dataSource: 'Product Hunt',
        updateCycle: '每周更新'
      });
    }
    
    if (type === 'health') {
      return res.status(200).json({
        status: 'ok',
        newsCount: cachedNews.length,
        trendsCount: cachedTrends.length,
        softwareCount: softwareRankingData.length,
        lastUpdate
      });
    }
    
    if (type === 'sync') {
      const result = await syncNews();
      await refreshTrends();
      return res.status(200).json({
        success: true,
        ...result,
        trendsCount: cachedTrends.length,
        lastUpdate
      });
    }
    
    // 默认返回所有数据
    const trends = await ensureTrends();
    return res.status(200).json({
      success: true,
      news: shuffleArray(cachedNews).slice(0, 10),
      trends,
      softwareRanking: softwareRankingData,
      lastUpdate
    });
  }
  
  if (method === 'POST') {
    const { action } = req.body || {};
    
    if (action === 'refresh') {
      const result = await syncNews();
      return res.status(200).json({
        success: true,
        message: 'News refreshed',
        ...result,
        lastUpdate
      });
    }

    // 主页 AI 整理中转（2026-10-30）：浏览器直连服务商失败（跨域/网络）时的兜底。
    // 仅转发：不存口令、不记请求体；调用方用的是用户自己的服务商与口令。
    if (action === 'ai-chat') {
      const { baseUrl, model, key, messages } = req.body || {};
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
    }

    // 设置里「获取模型」的中转（2026-10-30 补充）：GET {baseUrl}/models，仅转发，不存口令、不记请求体。
    if (action === 'ai-models') {
      const { baseUrl, key } = req.body || {};
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
    }
    
    return res.status(400).json({
      success: false,
      error: 'Unknown action'
    });
  }
  
  res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
}
