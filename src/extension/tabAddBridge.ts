/**
 * 右键菜单「添加到杂盒主页」的页面侧桥接（只在扩展内生效；网站版没有 chrome.runtime，直接 no-op）：
 * - 监听 background worker 投递的 zabox-add-site：写进名叫 tab 的组（没有就新建 list 组），同址去重；
 * - worker 没投递成功时站点存在 chrome.storage.local 待办队列里，页面启动/回到前台时取走落盘；
 * - 落盘走 store.update() 系方法（addGroup/addSite），预设快照与自动同步与手动添加一致。
 */
import type { LocalStore } from '../store/localStore';

const TAB_GROUP_NAME = 'tab';
const PENDING_KEY = 'zabox-pending-adds';

interface PendingSite {
  name: string;
  url: string;
}

interface ChromeApi {
  runtime?: {
    id?: string;
    onMessage: {
      addListener: (fn: (msg: unknown, sender: unknown, sendResponse: (res: unknown) => void) => boolean | void) => void;
      removeListener: (fn: (msg: unknown, sender: unknown, sendResponse: (res: unknown) => void) => boolean | void) => void;
    };
    lastError?: { message?: string };
  };
  storage?: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      remove: (key: string) => Promise<void>;
    };
  };
}

const getChrome = (): ChromeApi | undefined =>
  (globalThis as unknown as { chrome?: ChromeApi }).chrome;

const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, '');
const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url);

/** 写进 tab 组：同址已在组里就跳过；没有 tab 组就新建（update 排队执行，addSite 紧跟其后能看到新组） */
const recentlyAdded = new Map<string, number>();
function addToTabGroup(getStore: () => LocalStore, site: PendingSite): boolean {
  const url = site.url.trim();
  const name = site.name.trim() || url;
  if (!isHttpUrl(url)) return false;
  const key = normalizeUrl(url);
  // 连续两次投递可能在同一次渲染前到达（state 里还看不到上一次写入），用近 10 秒内的写入记忆去重
  const now = Date.now();
  for (const [k, at] of recentlyAdded) if (now - at > 10_000) recentlyAdded.delete(k);
  if (recentlyAdded.has(key)) return false;
  const store = getStore();
  const existing = store.data.groups.find((g) => g.name === TAB_GROUP_NAME);
  if (existing && existing.sites.some((s) => normalizeUrl(s.url) === key)) return false;
  const groupId = existing ? existing.id : store.addGroup(TAB_GROUP_NAME, 'list');
  store.addSite(groupId, {
    name,
    url,
    description: '',
    aliases: [],
    pinned: false,
    tags: [],
    iconMode: 'auto',
    iconText: '',
    iconColor: '',
    iconImage: '',
    autoLogo: '',
  });
  recentlyAdded.set(key, Date.now());
  return true;
}

export function startTabAddBridge(getStore: () => LocalStore): () => void {
  const chrome = getChrome();
  if (!chrome?.runtime?.id || !chrome.storage) return () => {};
  const onMessage = (msg: unknown, _sender: unknown, sendResponse: (res: unknown) => void) => {
    const m = msg as { type?: unknown; site?: unknown } | null;
    if (m && m.type === 'zabox-add-site' && m.site && typeof m.site === 'object') {
      const site = m.site as { name?: unknown; url?: unknown };
      if (typeof site.url === 'string' && typeof site.name === 'string') {
        sendResponse({ added: addToTabGroup(getStore, { name: site.name, url: site.url }) });
      }
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(onMessage);
  const drain = async () => {
    try {
      const data = await chrome.storage!.local.get(PENDING_KEY);
      const list = Array.isArray(data[PENDING_KEY]) ? (data[PENDING_KEY] as unknown[]) : [];
      if (list.length === 0) return;
      await chrome.storage!.local.remove(PENDING_KEY);
      for (const entry of list) {
        if (entry && typeof entry === 'object') {
          const site = entry as { name?: unknown; url?: unknown };
          if (typeof site.url === 'string' && typeof site.name === 'string') {
            addToTabGroup(getStore, { name: site.name, url: site.url });
          }
        }
      }
    } catch {
      /* 队列读失败就下次再取，不阻塞页面 */
    }
  };
  void drain();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void drain();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    chrome.runtime.onMessage.removeListener(onMessage);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
