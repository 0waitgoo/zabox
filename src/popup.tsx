/**
 * 扩展添加面板（popup）：在任意网站点扩展图标，把当前网站加进「我的」预设的某个组。
 * 与新标签页同 origin（chrome-extension://），直接读写同一份 localStorage 数据；
 * 写完立即按现有 GitHub 同步协议推一次（见 src/popup/addSite.ts）。
 * 参考面板字段：名称（默认当前页标题，可改）、组名下拉、颜色、图标文字、确定；
 * 顶部保留「打开主页」「打开侧边栏」两个入口。
 */
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, Globe, Home, LayoutGrid, Link2, PanelRightOpen, Type } from 'lucide-react';
import './index.css';
import { letterIconDataUri } from './data/groups';
import {
  buildAddedStore,
  isSiteInGroup,
  normalizeSiteUrl,
  pushAddedStore,
  readPopupStore,
  savePopupStore,
  type ReadStoreResult,
} from './popup/addSite';
import type { NavGroup } from './data/groups';

const HOME_URL = 'https://zahe.hiitun.top/';
const LAST_GROUP_KEY = 'zabox-popup-last-group';

/** 色板（贴近参考面板两排配色；最后一格彩虹 = 自动配色） */
const PALETTE: string[] = [
  '#f5a623', '#22c55e', '#14b8a6', '#3b82f6', '#2563eb',
  '#8b5cf6', '#ec4899', '#ef4444', '#f43f5e', '#c9a98a',
  '#b08968', '#a68a64', '#6b7c5e', '#7da08a', '#8fa3b8',
  '#7c8aa5', '#9ca3af', '#1f2937', '#111827',
];

interface ExtTab {
  url?: string;
  title?: string;
  lastAccessed?: number;
  active?: boolean;
}

interface ChromeApi {
  tabs?: {
    query: (queryInfo: Record<string, unknown>) => Promise<ExtTab[]>;
    create: (props: { url: string }) => Promise<unknown>;
  };
  windows?: { getCurrent: () => Promise<{ id?: number }> };
  sidePanel?: { open: (options: { windowId?: number }) => Promise<void> };
  runtime?: { getURL: (path: string) => string };
}

const getChrome = (): ChromeApi | undefined =>
  (globalThis as unknown as { chrome?: ChromeApi }).chrome;

/** 取当前浏览的网页：全部标签里按最近访问取第一个 http(s) 页（排除扩展/浏览器内页） */
async function getCurrentPage(): Promise<{ url: string; title: string } | null> {
  const c = getChrome();
  if (!c?.tabs?.query) return null;
  try {
    const tabs = await c.tabs.query({});
    const pages = tabs.filter(
      (t) => t.url && /^https?:\/\//.test(t.url) && !t.url.startsWith('chrome-extension://'),
    );
    if (!pages.length) return null;
    pages.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0) || Number(b.active ?? false) - Number(a.active ?? false));
    const top = pages[0];
    return { url: top.url as string, title: top.title ?? '' };
  } catch {
    return null;
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const clampIconText = (v: string): string => [...v].slice(0, 2).join('');

function PopupApp() {
  const [store, setStore] = useState<ReadStoreResult | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [manualUrl, setManualUrl] = useState(false);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [color, setColor] = useState('');
  const [iconText, setIconText] = useState('');
  const [status, setStatus] = useState('');
  const [added, setAdded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loaded = readPopupStore();
    setStore(loaded);
    if (loaded.status === 'ok') {
      const last = localStorage.getItem(LAST_GROUP_KEY);
      const first = loaded.myGroups[0];
      setGroupId(loaded.myGroups.some((g) => g.id === last) ? (last as string) : (first?.id ?? ''));
    }
    void getCurrentPage().then((page) => {
      if (page) {
        setPageUrl(page.url);
        setName(page.title.trim() || hostOf(page.url));
      } else {
        setManualUrl(true);
      }
    });
  }, []);

  const groups: NavGroup[] = store?.status === 'ok' ? store.myGroups : [];
  const selectedGroup = groups.find((g) => g.id === groupId);
  const url = pageUrl;
  const urlValid = useMemo(() => {
    try {
      const u = new URL(normalizeSiteUrl(url) || url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, [url]);
  const duplicate = Boolean(selectedGroup && urlValid && isSiteInGroup(selectedGroup, url));
  const previewText = iconText.trim() || [...name.trim()][0] || '?';
  const previewSrc = letterIconDataUri(previewText, color || undefined);

  const resetAdded = () => {
    setAdded(false);
    setStatus('');
  };

  const openHome = () => {
    const c = getChrome();
    if (c?.tabs?.create) void c.tabs.create({ url: HOME_URL });
    else window.open(HOME_URL, '_blank');
  };

  const openSidePanel = async () => {
    const c = getChrome();
    try {
      if (c?.sidePanel?.open && c?.windows?.getCurrent) {
        const w = await c.windows.getCurrent();
        await c.sidePanel.open({ windowId: w.id });
        return;
      }
      throw new Error('sidePanel unavailable');
    } catch {
      const extUrl = c?.runtime?.getURL('index.html');
      if (c?.tabs?.create && extUrl) void c.tabs.create({ url: extUrl });
      else window.open(extUrl ?? HOME_URL, '_blank');
    }
  };

  const onConfirm = async () => {
    if (store?.status !== 'ok' || !selectedGroup || !name.trim() || !urlValid || duplicate || saving) return;
    setSaving(true);
    setStatus('正在保存…');
    try {
      const finalUrl = normalizeSiteUrl(url);
      const built = buildAddedStore(store.data, {
        groupId: selectedGroup.id,
        name: name.trim(),
        url: finalUrl,
        iconText: iconText.trim(),
        iconColor: color,
      });
      if (built.status !== 'added') {
        setStatus('这个网站已在该组里了');
        setSaving(false);
        return;
      }
      savePopupStore(built.data);
      localStorage.setItem(LAST_GROUP_KEY, selectedGroup.id);
      setStore(readPopupStore());
      setAdded(true);
      setSaving(false);
      const push = await pushAddedStore(built.data);
      if (push.pushed) setStatus('已添加 · 已同步到 GitHub，网站版刷新后可见');
      else if (push.reason === 'not-configured') setStatus('已添加 · 已存到扩展本机数据（未开 GitHub 同步，网站版暂看不到）');
      else if (push.reason === 'remote-newer') setStatus('已添加 · 已存本机，云端有更新：打开新标签页同步一次即可');
      else setStatus(`已添加 · 已存本机，推送失败${push.message ? `：${push.message}` : ''}，打开新标签页可重试同步`);
    } catch {
      setSaving(false);
      setStatus('保存失败，请重试');
    }
  };

  const fieldCls =
    'w-full flex items-center gap-2 rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-violet-400/60';

  return (
    <div className="w-[360px] min-h-[520px] bg-[#17171d] text-white p-4 flex flex-col gap-3 font-sans">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="popup-open-home"
          onClick={openHome}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] border border-white/10 px-2 py-2.5 text-sm hover:bg-white/10"
        >
          <Home size={16} /> 打开主页
        </button>
        <button
          type="button"
          data-testid="popup-open-sidepanel"
          onClick={() => void openSidePanel()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] border border-white/10 px-2 py-2.5 text-sm hover:bg-white/10"
        >
          <PanelRightOpen size={16} /> 打开侧边栏
        </button>
      </div>

      {store?.status === 'uninitialized' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-white/80">还没读到杂盒数据</p>
          <p className="text-xs text-white/50 leading-relaxed">先打开一次杂盒主页完成初始化，<br />再点扩展图标添加网站。</p>
          <button
            type="button"
            onClick={openHome}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm hover:bg-blue-400"
          >
            打开主页
          </button>
        </div>
      ) : (
        <>
          <label className={fieldCls}>
            <Link2 size={16} className="shrink-0 text-white/50" />
            <input
              data-testid="popup-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
                resetAdded();
              }}
              placeholder="名称"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          {manualUrl ? (
            <label className={fieldCls}>
              <Globe size={16} className="shrink-0 text-white/50" />
              <input
                data-testid="popup-url"
                value={pageUrl}
                onChange={(e) => {
                  setPageUrl(e.target.value);
                  resetAdded();
                }}
                placeholder="网址，如 https://example.com"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
          ) : (
            <p data-testid="popup-url" title={pageUrl} className="truncate px-1 text-xs text-white/45">
              {pageUrl || '正在读取当前网页…'}
            </p>
          )}

          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
              <LayoutGrid size={16} />
            </div>
            <select
              data-testid="popup-group"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                resetAdded();
              }}
              className="w-full appearance-none rounded-xl bg-white/[0.07] border border-white/10 pl-9 pr-8 py-2.5 text-sm outline-none focus:border-violet-400/60 [&>option]:text-black"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}（{g.sites.length} 个站点）
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50">
              <ChevronDown size={16} />
            </div>
          </div>
          {store?.status === 'ok' && !store.hasMyPreset && (
            <p className="px-1 text-xs text-white/45">当前显示主页编组，加进去后自动存为「我的」。</p>
          )}

          <div className="flex justify-center py-1">
            <img src={previewSrc} alt="图标预览" className="h-[76px] w-[76px] rounded-[20px] shadow-lg shadow-black/40" />
          </div>

          <div className="grid grid-cols-10 gap-2 px-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`popup-color-${c}`}
                aria-label={`颜色 ${c}`}
                onClick={() => {
                  setColor(c);
                  resetAdded();
                }}
                className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#17171d]' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              type="button"
              data-testid="popup-color-auto"
              aria-label="自动配色"
              onClick={() => {
                setColor('');
                resetAdded();
              }}
              title="自动配色"
              className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === '' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#17171d]' : ''}`}
              style={{ background: 'conic-gradient(#f43f5e, #f59e0b, #22c55e, #3b82f6, #8b5cf6, #f43f5e)' }}
            />
          </div>

          <label className={fieldCls}>
            <Type size={16} className="shrink-0 text-white/50" />
            <input
              data-testid="popup-icon-text"
              value={iconText}
              onChange={(e) => {
                setIconText(clampIconText(e.target.value));
                resetAdded();
              }}
              placeholder="图标文字，建议1–2个字符"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>

          <button
            type="button"
            data-testid="popup-confirm"
            onClick={() => void onConfirm()}
            disabled={saving || !name.trim() || !urlValid || !groupId || duplicate || added}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-500 py-3 text-[15px] font-medium hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {added && <Check size={17} />}
            {added ? '已添加' : duplicate ? '已在该组里' : saving ? '保存中…' : '确定'}
          </button>

          <p data-testid="popup-status" className="min-h-[18px] px-1 text-center text-xs text-white/60">
            {duplicate && !added ? '这个网站已在该组里了，换个组试试。' : status}
          </p>
          {!nameTouched && pageUrl && (
            <p className="px-1 text-center text-[11px] text-white/35">名称默认取当前网页标题，可以改。</p>
          )}
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById('popup-root')!).render(<PopupApp />);
