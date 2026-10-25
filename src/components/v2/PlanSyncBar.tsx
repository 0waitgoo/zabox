import React, { useEffect, useRef, useState } from 'react';
import { planWindow } from './planWindow';
import { desktopBrowserLogin } from '../../services/desktopOAuth';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { LocalStore } from '../../store/localStore';
import {
  ghGetFile,
  ghPutFile,
  type GithubSyncConfig,
} from '../../store/githubSync';
import { packDataEnvelope, restoreWidgetStorage } from '../../store/widgetStorage';
import { reloadColorsData } from '../../store/colorsData';
import type { PlanTheme } from '../../plan-app';

/** Browser OAuth uses the website's existing callback and a state-checked loopback listener.
 * This component stays mounted when the window is compact/hidden so login is not interrupted.
 * Tokens remain in the existing local-only key and never enter exported store data.
 */
const TOKEN_KEY = 'zabox-plan-sync-token';
const SHA_KEY = 'zabox-plan-sync-sha';
function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function loadSha(): string | null {
  try {
    return localStorage.getItem(SHA_KEY);
  } catch {
    return null;
  }
}

/** 把请求失败的原因缩成一句可读文案（scope 拒绝时 Tauri 会直接报原因，之前被 catch 吞了） */
function errDetail(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, ' ').slice(0, 60) || '未知错误';
}

export default function PlanSyncBar({
  store,
  theme,
  aiView,
  onAiToggle,
  autoLogin = false,
  onAutoLoginConsumed,
}: {
  store: LocalStore;
  theme: PlanTheme;
  aiView: 'main' | 'ai';
  onAiToggle: () => void;
  /** 顶栏收起条点「GitHub 登录」时用：展开回完整版后自动开始一次登录，免得再点一次 */
  autoLogin?: boolean;
  onAutoLoginConsumed?: () => void;
}) {
  const [token, setToken] = useState(loadToken);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const loginRef = useRef<AbortController | null>(null);
  const dataRef = useRef(store.data);
  dataRef.current = store.data;
  const shaRef = useRef<string | null>(loadSha());
  const light = theme === 'light';
  useEffect(() => () => {
    loginRef.current?.abort();
  }, []);

  const cfg = (t: string): GithubSyncConfig => ({
    owner: '0waitgoo',
    repo: 'ainav-data',
    branch: 'main',
    path: 'ainav-data.json',
    token: t,
  });

  const saveSha = (sha: string | null) => {
    shaRef.current = sha;
    try {
      if (sha) localStorage.setItem(SHA_KEY, sha);
      else localStorage.removeItem(SHA_KEY);
    } catch {
      /* 忽略 */
    }
  };

  const saveToken = (t: string) => {
    setToken(t);
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* 忽略 */
    }
  };

  const push = async (c: GithubSyncConfig, sha: string | null): Promise<boolean> => {
    const text = JSON.stringify(packDataEnvelope(dataRef.current), null, 2);
    const res = await ghPutFile(c, text, sha);
    if (res.kind === 'ok') {
      saveSha(res.sha);
      setStatus('已推送，网站那边同步一次即互通');
      return true;
    }
    setStatus(res.kind === 'error' ? res.message : '推送冲突：两边都有变化，先在网站上同步一次');
    return false;
  };

  const sync = async () => {
    const t = token.trim();
    if (!t || busy) return;
    setBusy(true);
    setStatus('正在同步…');
    try {
      const c = cfg(t);
      const remote = await ghGetFile(c);
      if (remote.kind === 'error') {
        setStatus(remote.message);
        return;
      }
      if (remote.kind === 'missing') {
        await push(c, null);
        return;
      }
      const localUpdatedAt = dataRef.current.updatedAt;
      if (remote.updatedAt > localUpdatedAt) {
        if (!store.importData(remote.data)) {
          setStatus('云端数据结构不对，无法导入');
          return;
        }
        if (remote.widgetStorage) {
          restoreWidgetStorage(remote.widgetStorage);
          reloadColorsData();
        }
        saveSha(remote.sha);
        setStatus('云端较新，已拉取');
        return;
      }
      if (remote.updatedAt < localUpdatedAt) {
        await push(c, remote.sha);
        return;
      }
      saveSha(remote.sha);
      setStatus('已是最新');
    } catch (error) {
      setStatus(`同步失败：${errDetail(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const startLogin = async () => {
    if (loginRef.current) return;
    const controller = new AbortController();
    loginRef.current = controller;
    setLoggingIn(true);
    setStatus('正在打开浏览器，请在 GitHub 授权后返回…');
    try {
      const token = await desktopBrowserLogin(controller.signal);
      if (controller.signal.aborted) return;
      saveToken(token);
      saveSha(null);
      setStatus('已连接 GitHub，点同步即互通');
      const win = planWindow();
      if (win) {
        await win.unminimize();
        await win.show();
        await win.setFocus();
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(`登录失败：${errDetail(error)}`);
    } finally {
      if (loginRef.current === controller) {
        loginRef.current = null;
        setLoggingIn(false);
      }
    }
  };

  useEffect(() => {
    if (!autoLogin) return;
    onAutoLoginConsumed?.();
    if (!loadToken()) void startLogin();
  }, [autoLogin]);

  const cancelLogin = () => {
    loginRef.current?.abort();
    setStatus('登录已取消');
  };
  const relogin = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* local storage unavailable */ }
    setToken('');
    saveSha(null);
    void startLogin();
  };

  const syncBtnCls =
    'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-default text-white transition-colors';
  const loginBtnCls = light
    ? 'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/[0.06] hover:bg-black/10 text-zinc-800 transition-colors'
    : 'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/[0.18] text-white transition-colors';
  const faintCls = light ? 'text-zinc-500' : 'text-white/45';
  const faintLinkCls = light
    ? 'text-[11px] text-zinc-500 hover:text-zinc-800'
    : 'text-[11px] text-white/40 hover:text-white/80';

  const loginControl = token ? (
    <span className="shrink-0 flex items-center gap-2">
      <span className={`text-xs ${light ? 'text-emerald-700' : 'text-emerald-300/90'}`}>
        已连接 GitHub
      </span>
      <button type="button" onClick={relogin} className={faintLinkCls}>
        重新登录
      </button>
    </span>
  ) : (
    <button type="button" disabled={loggingIn} onClick={() => void startLogin()} className={loginBtnCls}>
      {loggingIn ? '等待浏览器授权…' : 'GitHub 登录'}
    </button>
  );

  return (
    <div
      className={`sticky top-0 z-40 backdrop-blur border-b px-3 py-2 ${
        light ? 'border-black/10' : 'border-white/10'
      }`}
    >
      <div data-plan-dock-row className="flex items-center gap-2 flex-wrap">
        {loginControl}
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy || !token.trim()}
          className={syncBtnCls}
        >
          {busy ? '同步中…' : '同步'}
        </button>
        {/* AI 整理从计划页头移到本行（用户定：今日进度删、AI 整理放上面更简约） */}
        <button type="button" onClick={onAiToggle} className={loginBtnCls}>
          <span className="flex items-center gap-1">
            {aiView === 'ai' ? <ArrowLeft size={12} /> : <Sparkles size={12} />}
            {aiView === 'ai' ? '返回' : 'AI 整理'}
          </span>
        </button>
        {status && (
          <span role="status" className={`text-[11px] break-words ${faintCls}`}>
            {status}
          </span>
        )}
        {/* 拖动区：行尾空白带（按钮与文案不在拖动区内，点击不受影响） */}
        <div data-plan-drag-region className="flex-1 min-w-0 self-stretch" />
      </div>
      {loggingIn && <button type="button" onClick={cancelLogin} className={faintLinkCls}>取消登录</button>}
    </div>
  );
}
