import { API_BASE } from './apiBase';

export interface HealthInfo {
  status: string;
  newsCount: number;
  trendsCount: number;
  lastSync: string;
  lastManualSync: string | null;
  nextScheduledSync: string;
  autoUpdateInterval: number;
}

export interface NewsItem {
  id: number;
  title: string;
  description?: string;
  source: string;
  url: string;
  image?: string;
  category: string;
  publishedAt: string;
}

/** 热门话题条目（第九十五轮）：heat 为源站真实热度原值，heatText 为其格式化展示 */
export interface TrendItem {
  id: number;
  topic: string;
  heat: number;
  heatText: string;
  /** 来源：'微博热搜' | '百度热搜' */
  source: string;
  url: string;
}

export interface TrendsResult {
  items: TrendItem[];
  /** 本次数据成功抓取的时间（ISO）；stale 时为缓存里的时间 */
  updatedAt: string | null;
  /** true = 当前展示的是最近一次成功缓存（源站暂时不可达） */
  stale: boolean;
}

/** 软件榜条目（旧接口类型保留兼容；第九十五轮起榜单组件直接读 api/ranking-data.js 的真实数据） */
export interface SoftwareRankingItem {
  id: number;
  name: string;
  rank: number;
  category: string;
  description: string;
  rating?: number;
  ratingScale?: number;
  reviewCount?: string;
  usageMetric?: string;
  usageValue?: string;
  dataPeriod?: string;
  downloads?: string;
  url?: string;
  logo?: string;
  weeklyViews?: string;
}

function isNewsArticle(item: unknown): item is NewsItem {
  if (!item || typeof item !== 'object') return false;
  const article = item as Partial<NewsItem>;
  if (!article.title || typeof article.title !== 'string' || !Number.isFinite(Date.parse(article.publishedAt ?? ''))) return false;
  try {
    const url = new URL(article.url ?? '');
    // 新闻必须可追溯到文章；仅链接媒体首页的演示数据不作为真实资讯展示。
    return ['http:', 'https:'].includes(url.protocol) && (url.pathname !== '/' || !!url.search);
  } catch {
    return false;
  }
}

export async function fetchNews(limit = 20, offset = 0): Promise<NewsItem[]> {
  try {
    const data = await requestJson(`${API_BASE}/api?type=news&limit=${limit}&offset=${offset}`);
    if (data.success && Array.isArray(data.data)) {
      return data.data.filter(isNewsArticle);
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchTrends(): Promise<TrendsResult> {
  try {
    const data = await requestJson(`${API_BASE}/api?type=trends`);
    if (data.success && Array.isArray(data.data)) {
      return { items: data.data, updatedAt: data.updatedAt ?? null, stale: !!data.stale };
    }
    return { items: [], updatedAt: null, stale: false };
  } catch (error) {
    // 第九十五轮：不再用任何写死的话题兜底——拉不到就返回空，前端显示空态
    console.log('Failed to fetch trends', error);
    return { items: [], updatedAt: null, stale: false };
  }
}

export async function fetchSoftwareRanking(): Promise<SoftwareRankingItem[]> {
  try {
    const data = await requestJson(`${API_BASE}/api?type=software-ranking`);
    if (data.success && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.log('Failed to fetch software ranking', error);
    return [];
  }
}

export async function syncNews(): Promise<{ success: boolean; newsCount?: number; trendsCount?: number }> {
  try {
    const data = await requestJson(`${API_BASE}/api?type=sync`);
    return data;
  } catch (error) {
    console.error('Failed to sync news:', error);
    return { success: false };
  }
}

export async function fetchHealth(): Promise<HealthInfo | null> {
  try {
    const data = await requestJson(`${API_BASE}/api?type=health`);
    if (data.status === 'ok') {
      return data;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch health:', error);
    return null;
  }
}

// 共用正在进行的请求，避免 StrictMode 和同屏组件重复取数；完成后即可重试。
const pending = new Map<string, Promise<any>>();

export function requestJson(url: string, timeoutMs = 10_000): Promise<any> {
  const existing = pending.get(url);
  if (existing) return existing;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = (async () => {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  })().finally(() => {
    clearTimeout(timer);
    pending.delete(url);
  });
  pending.set(url, request);
  return request;
}

// 第九十五轮：原 getFallbackTrends / getFallbackSoftwareRanking 两份写死数据
// （#Sora 12.4万、ChatGPT 4.8 分 / 月活 1.8 亿等编造数字）已整段删除。
// 所有榜单/话题数字只许来自源站真实数据，拉不到一律返回空、前端显示空态。
