import React, { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
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

/**
 * 桌面计划应用的同步条（第 3 轮）：与网站计划组件同源数据（tasks/plans），
 * 通过网站版同一套 GitHub 同步协议（ainav-data 私仓整份 store JSON）与网站互通。
 * GitHub Device Flow 登录：点「GitHub 登录」→ 界面显示 user_code → 点
 * 「去 GitHub 确认」在浏览器里确认一次 → 轮询拿到 token 后存本机。
 * 令牌只存本机独立 key（zabox-plan-sync-token），绝不进同步 JSON。
 * 第 3 轮修登录无反应：设备码与换 token 两次请求改走 @tauri-apps/plugin-http
 * （Rust 侧发请求，不受浏览器 CORS 限制——github.com 的 OAuth 接口不给浏览器
 * 跨域头，网页 fetch 拿不到响应）；状态文案在 420px 窄窗也不再隐藏
 * （之前 hidden sm:block 导致点完什么提示都看不见）。
 * 左侧「同步」二字已删（用户定）；行尾空白带是拖动区（第 3 轮新增）。
 * v1 口径不变：本应用供你自己用，同步仓固定为你自己的 0waitgoo/ainav-data；
 * 公开版需改成每人自己的仓（下一步）。
 */
const TOKEN_KEY = 'zabox-plan-sync-token';
const SHA_KEY = 'zabox-plan-sync-sha';
const CLIENT_ID = 'Ov23liLio2boISfRc36y'; // OAuth App 公开 Client ID，不是密钥
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';

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

type DeviceSession = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSec: number;
};

export default function PlanSyncBar({
  store,
  theme,
  aiView,
  onAiToggle,
}: {
  store: LocalStore;
  theme: PlanTheme;
  aiView: 'main' | 'ai';
  onAiToggle: () => void;
}) {
  const [token, setToken] = useState(loadToken);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceSession | null>(null);
  const [openerFailed, setOpenerFailed] = useState(false);
  const dataRef = useRef(store.data);
  dataRef.current = store.data;
  const shaRef = useRef<string | null>(loadSha());
  const pollTimer = useRef<number | null>(null);
  const deviceRef = useRef<DeviceSession | null>(null);
  deviceRef.current = device;

  const light = theme === 'light';

  const stopPolling = () => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };
  useEffect(() => stopPolling, []);

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
    } finally {
      setBusy(false);
    }
  };

  /** 轮询换 token：authorization_pending 继续等，slow_down 放慢，过期/拒绝即停 */
  const pollForToken = (session: DeviceSession, intervalSec: number) => {
    stopPolling();
    pollTimer.current = window.setTimeout(async () => {
      try {
        const res = await tauriFetch(DEVICE_TOKEN_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=${encodeURIComponent(CLIENT_ID)}&device_code=${encodeURIComponent(session.deviceCode)}&grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')}`,
        });
        const json = (await res.json()) as {
          access_token?: string;
          error?: string;
        };
        if (json.access_token) {
          saveToken(json.access_token);
          setDevice(null);
          setStatus('已连接 GitHub，点同步即互通');
          return;
        }
        if (json.error === 'authorization_pending') {
          pollForToken(session, intervalSec);
          return;
        }
        if (json.error === 'slow_down') {
          pollForToken(session, intervalSec + 5);
          return;
        }
        setDevice(null);
        setStatus(
          json.error === 'expired_token'
            ? '确认码已过期，请重新点 GitHub 登录'
            : 'GitHub 确认未通过，请重新点 GitHub 登录',
        );
      } catch {
        setDevice(null);
        setStatus('网络异常，登录中断，请重新点 GitHub 登录');
      }
    }, intervalSec * 1000);
  };

  const startLogin = async () => {
    stopPolling();
    setOpenerFailed(false);
    setStatus('正在向 GitHub 申请确认码…');
    try {
      const res = await tauriFetch(DEVICE_CODE_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${encodeURIComponent(CLIENT_ID)}&scope=${encodeURIComponent('repo')}`,
      });
      const json = (await res.json()) as {
        device_code?: string;
        user_code?: string;
        verification_uri?: string;
        interval?: number;
      };
      if (!json.device_code || !json.user_code || !json.verification_uri) {
        setStatus('GitHub 未返回确认码，请稍后重试');
        return;
      }
      const session: DeviceSession = {
        deviceCode: json.device_code,
        userCode: json.user_code,
        verificationUri: json.verification_uri,
        intervalSec: json.interval ?? 5,
      };
      setDevice(session);
      setStatus('请在 GitHub 确认一次，确认后自动连上');
      pollForToken(session, session.intervalSec);
    } catch {
      setStatus('网络异常，拿不到确认码，请稍后重试');
    }
  };

  const cancelLogin = () => {
    stopPolling();
    setDevice(null);
    setStatus(null);
  };

  const relogin = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* 忽略 */
    }
    setToken('');
    void startLogin();
  };

  const openVerification = async () => {
    if (!device) return;
    try {
      await openUrl(device.verificationUri);
    } catch {
      // 插件接不上时退化为页面内显示链接 + 码，用户手动打开，仍不出现贴令牌框
      setOpenerFailed(true);
    }
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
    <button type="button" onClick={() => void startLogin()} className={loginBtnCls}>
      GitHub 登录
    </button>
  );

  const devicePanel = device ? (
    <div
      className={`mt-2 rounded-lg border px-3 py-2.5 flex flex-col gap-2 ${
        light ? 'bg-black/[0.04] border-black/10' : 'bg-white/5 border-white/10'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs ${faintCls}`}>确认码</span>
        <span
          className={`text-lg font-bold tracking-[0.2em] select-all ${
            light ? 'text-zinc-900' : 'text-white'
          }`}
        >
          {device.userCode}
        </span>
        <button type="button" onClick={() => void openVerification()} className={loginBtnCls}>
          去 GitHub 确认
        </button>
        <button type="button" onClick={cancelLogin} className={faintLinkCls}>
          取消
        </button>
      </div>
      <p className={`text-[11px] break-all ${faintCls}`}>
        正在等你在 GitHub 确认{openerFailed ? '（未能自动打开浏览器，请手动打开下面链接并输入确认码）' : ''}
        ：{device.verificationUri}
      </p>
    </div>
  ) : null;

  return (
    <div
      className={`sticky top-10 z-40 backdrop-blur border-b px-3 py-2 ${
        light ? 'bg-[#f2f2f5]/95 border-black/10' : 'bg-[#17171d]/95 border-white/10'
      }`}
    >
      <div className="flex items-center gap-2">
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
          <span className={`shrink-0 text-[11px] truncate max-w-[220px] ${faintCls}`}>
            {status}
          </span>
        )}
        {/* 拖动区：行尾空白带（按钮与文案不在拖动区内，点击不受影响） */}
        <div data-tauri-drag-region className="flex-1 min-w-0 self-stretch" />
      </div>
      {devicePanel}
    </div>
  );
}
