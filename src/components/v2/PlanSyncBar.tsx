import React, { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { LocalStore } from '../../store/localStore';
import {
  ghGetFile,
  ghPutFile,
  type GithubSyncConfig,
} from '../../store/githubSync';
import { packDataEnvelope, restoreWidgetStorage } from '../../store/widgetStorage';
import { reloadColorsData } from '../../store/colorsData';

/**
 * 桌面计划应用的同步条（v2）：与网站计划组件同源数据（tasks/plans），
 * 通过网站版同一套 GitHub 同步协议（ainav-data 私仓整份 store JSON）与网站互通。
 * v1 的粘贴令牌框已删，改 GitHub Device Flow 登录：点「GitHub 登录」→ 界面显示
 * user_code → 点「去 GitHub 确认」在浏览器里确认一次 → 轮询拿到 token 后存本机。
 * 令牌只存本机独立 key（zabox-plan-sync-token），绝不进同步 JSON。
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
  variant = 'bar',
}: {
  store: LocalStore;
  variant?: 'bar' | 'mini';
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
        const res = await fetch(DEVICE_TOKEN_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: session.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
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
      const res = await fetch(DEVICE_CODE_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, scope: 'repo' }),
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
  const loginBtnCls =
    'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/[0.18] text-white transition-colors';

  const loginControl = token ? (
    <span className="shrink-0 flex items-center gap-2">
      <span className="text-xs text-emerald-300/90">已连接 GitHub</span>
      <button type="button" onClick={relogin} className="text-[11px] text-white/40 hover:text-white/80">
        重新登录
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => void startLogin()} className={loginBtnCls}>
      GitHub 登录
    </button>
  );

  const devicePanel = device ? (
    <div className="mt-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-white/60">确认码</span>
        <span className="text-lg font-bold tracking-[0.2em] text-white select-all">
          {device.userCode}
        </span>
        <button type="button" onClick={() => void openVerification()} className={loginBtnCls}>
          去 GitHub 确认
        </button>
        <button
          type="button"
          onClick={cancelLogin}
          className="text-[11px] text-white/40 hover:text-white/80"
        >
          取消
        </button>
      </div>
      <p className="text-[11px] text-white/40 break-all">
        正在等你在 GitHub 确认{openerFailed ? '（未能自动打开浏览器，请手动打开下面链接并输入确认码）' : ''}
        ：{device.verificationUri}
      </p>
    </div>
  ) : null;

  if (variant === 'mini') {
    return (
      <div className="flex flex-col gap-2">
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
          {status && <span className="text-[11px] text-white/45 truncate">{status}</span>}
        </div>
        {devicePanel}
      </div>
    );
  }

  return (
    <div className="sticky top-10 z-40 bg-[#17171d]/95 backdrop-blur border-b border-white/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-white/80">同步</span>
        {loginControl}
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy || !token.trim()}
          className={syncBtnCls}
        >
          {busy ? '同步中…' : '同步'}
        </button>
        {status && (
          <span className="hidden sm:block shrink-0 text-[11px] text-white/45 truncate max-w-[220px]">
            {status}
          </span>
        )}
      </div>
      {devicePanel}
    </div>
  );
}
