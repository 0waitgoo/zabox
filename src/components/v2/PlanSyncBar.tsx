import React, { useEffect, useRef, useState } from 'react';
import { planWindow } from './planWindow';
import { desktopBrowserLogin } from '../../services/desktopOAuth';
import { ArrowLeft, CircleAlert, Github, Sparkles, X } from 'lucide-react';
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

  const buttonCls = light
    ? 'h-6 rounded-md bg-black/[0.06] hover:bg-black/10 text-zinc-800'
    : 'h-6 rounded-md bg-white/10 hover:bg-white/[0.18] text-white';
  const iconCls = `shrink-0 w-6 flex items-center justify-center ${buttonCls}`;
  const aiLabel = aiView === 'ai' ? '返回计划' : 'AI 整理';
  return (
    <div data-plan-dock-row className="flex items-center gap-1 min-w-0">
      {token ? (
        <button type="button" onClick={relogin} className={iconCls}
          aria-label="重新登录 GitHub" title={status ?? '已连接 GitHub，点击重新登录'}><Github size={14} /></button>
      ) : (
        <button type="button" disabled={loggingIn} onClick={() => void startLogin()}
          title={status ?? 'GitHub 登录'}
          className={`min-w-0 px-2 text-xs font-medium truncate ${buttonCls}`}>
          {loggingIn ? '授权中…' : 'GitHub 登录'}
        </button>
      )}
      {token.trim() && <button type="button" onClick={() => void sync()} disabled={busy}
        title={status ?? '同步'} className="shrink-0 h-6 px-2 rounded-md text-xs font-medium bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white">
        {busy ? '同步中…' : '同步'}
      </button>}
      <button type="button" onClick={onAiToggle} className={iconCls} title={aiLabel} aria-label={aiLabel} aria-pressed={aiView === 'ai'}>
        {aiView === 'ai' ? <ArrowLeft size={14} /> : <Sparkles size={14} />}
      </button>
      {loggingIn && <button type="button" onClick={cancelLogin} className={iconCls} title="取消登录" aria-label="取消登录"><X size={12} /></button>}
      {status && (status.includes('失败')
        ? <span role="status" title={status} aria-label={status} className="shrink-0 text-red-400"><CircleAlert size={14} /></span>
        : <span role="status" className="sr-only">{status}</span>)}
    </div>
  );
}
