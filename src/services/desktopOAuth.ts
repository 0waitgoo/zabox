import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

export const DESKTOP_LOGIN_SITE = 'https://zahe.hiitun.top';

export async function desktopBrowserLogin(signal: AbortSignal): Promise<string> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const port = await invoke<number>('start_desktop_login', { state });
  const cancel = () => { void invoke('cancel_desktop_login').catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    await openUrl(`${DESKTOP_LOGIN_SITE}/?desktop_port=${port}&desktop_state=${state}`);
    const code = await invoke<string>('wait_desktop_login');
    signal.throwIfAborted();
    // The existing website server holds the OAuth secret; the desktop never contains it.
    const response = await nativeFetch(`${DESKTOP_LOGIN_SITE}/api/github-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    const body = await response.json();
    if (!response.ok || typeof body?.access_token !== 'string' || !body.access_token) {
      throw new Error(body?.error === 'oauth_not_configured' ? '网站尚未配置 GitHub 授权服务' : '授权已失效，请重新登录');
    }
    signal.throwIfAborted();
    return body.access_token;
  } finally {
    signal.removeEventListener('abort', cancel);
    await invoke('cancel_desktop_login').catch(() => undefined);
  }
}
