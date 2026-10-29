import { autoSiteLogo, siteLogoFallback } from '../data/groups';
import { localSiteIcons } from '../data/localSiteIcons';

type CachedIcon = { src: string; expires: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const CACHE_KEY = 'zabox-icon-cache-v1';
const SUCCESS_TTL = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL = 60 * 1000;

export function iconCandidates(initial: string, name: string, url?: string): string[] {
  // 老存档的 Google 图标地址在渲染时迁移，无需改写用户数据。
  let primary = initial;
  try {
    const parsed = new URL(initial);
    if (parsed.hostname === 'www.google.com' && parsed.pathname === '/s2/favicons' && url) {
      primary = autoSiteLogo(name, url);
    }
  } catch { /* 本地图标和 data URL 保留原样 */ }
  if (primary.startsWith('data:') || primary.startsWith('blob:')) return [primary];
  const sources = [localSiteIcons[primary], primary];
  if (url) {
    try { sources.push(`${new URL(url).origin}/favicon.ico`); } catch { /* 无有效站点地址 */ }
  }
  return [...new Set(sources.filter(Boolean))];
}

/** 共享请求与有期限的解析缓存；仅存图标地址，不存上传图片或网页内容。 */
export function createIconLoader(load: (src: string) => Promise<void>, storage?: StorageLike, now = Date.now) {
  const cache = new Map<string, CachedIcon>();
  const pending = new Map<string, Promise<string>>();
  try {
    const entries: [string, CachedIcon][] = JSON.parse(storage?.getItem(CACHE_KEY) ?? '[]');
    for (const [key, value] of entries.slice(-200)) {
      if (typeof value?.src === 'string' && value.expires > now()) cache.set(key, value);
    }
  } catch { /* 存储不可用或损坏时仍可加载 */ }

  const resolve = (initial: string, name: string, url?: string): Promise<string> => {
    if (initial.startsWith('data:') || initial.startsWith('blob:')) return Promise.resolve(initial);
    const key = JSON.stringify([initial, name, url]);
    const cached = cache.get(key);
    const hit = cached && cached.expires > now() && !localSiteIcons[initial] ? cached : undefined;
    if (hit?.src.startsWith('data:')) return Promise.resolve(hit.src);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const request = (async () => {
      let src = siteLogoFallback(name);
      let success = false;
      const candidates = [...new Set([...(hit ? [hit.src] : []), ...iconCandidates(initial, name, url)])];
      for (const candidate of candidates) {
        try { await load(candidate); src = candidate; success = true; break; } catch { /* 尝试下一来源 */ }
      }
      cache.delete(key);
      cache.set(key, { src, expires: now() + (success ? SUCCESS_TTL : FAILURE_TTL) });
      while (cache.size > 200) cache.delete(cache.keys().next().value!);
      try { storage?.setItem(CACHE_KEY, JSON.stringify([...cache])); } catch { /* 配额/隐私模式 */ }
      return src;
    })().finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
  return Object.assign(resolve, {
    invalidate(initial: string, name: string, url?: string) {
      cache.delete(JSON.stringify([initial, name, url]));
      try { storage?.setItem(CACHE_KEY, JSON.stringify([...cache])); } catch { /* 存储受限 */ }
    },
  });
}

export function loadImage(src: string, timeoutMs = 2500, imageFactory = () => new Image()): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (!ok) image.src = '';
      ok ? resolve() : reject(new Error('Icon unavailable'));
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.referrerPolicy = 'no-referrer';
    image.src = src;
  });
}

let loader: ReturnType<typeof createIconLoader> | undefined;
export function loadIcon(initial: string, name: string, url?: string): Promise<string> {
  if (!loader) {
    let storage: StorageLike | undefined;
    try { storage = window.localStorage; } catch { /* 存储受限 */ }
    loader = createIconLoader(loadImage, storage);
  }
  return loader(initial, name, url);
}

export function invalidateIcon(initial: string, name: string, url?: string): void {
  loader?.invalidate(initial, name, url);
}
