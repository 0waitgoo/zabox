import { beginOAuthState, buildOAuthAuthorizeUrl, consumeOAuthState, fetchOAuthClientId } from '../store/githubSync';

const KEY = 'zabox-desktop-login-v1';
type Bridge = { port: number; state: string; createdAt: number };

export function validBridge(value: unknown, now = Date.now()): value is Bridge {
  const bridge = value as Partial<Bridge> | null;
  return !!bridge && Number.isInteger(bridge.port) && bridge.port >= 1024 && bridge.port <= 65535
    && typeof bridge.state === 'string' && /^[a-f0-9]{64}$/.test(bridge.state)
    && Number.isFinite(bridge.createdAt) && now >= bridge.createdAt && now - bridge.createdAt < 180000;
}

/** Run before mounting the website store: desktop callbacks must never log the browser in. */
export async function tryDesktopLoginBridge(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  let stored: unknown = null;
  try { stored = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { /* no bridge */ }
  const launch = params.has('desktop_port') || params.has('desktop_state');
  if (!launch && !(stored && (params.has('code') || params.has('error')))) return false;
  const root = document.getElementById('root')!;
  root.textContent = '正在连接 GitHub 授权…';
  root.style.cssText = 'padding:48px;font:16px system-ui;color:#fff';
  history.replaceState({}, '', location.pathname);
  try {
    if (launch) {
      const bridge = { port: Number(params.get('desktop_port')), state: params.get('desktop_state'), createdAt: Date.now() };
      if (!validBridge(bridge)) throw new Error('无效的桌面登录请求，请从杂盒重新登录。');
      sessionStorage.setItem(KEY, JSON.stringify(bridge));
      const clientId = await fetchOAuthClientId();
      if (!clientId) throw new Error('网站尚未配置 GitHub 授权服务。');
      location.replace(buildOAuthAuthorizeUrl(clientId, beginOAuthState()));
    } else {
      sessionStorage.removeItem(KEY);
      const expectedState = consumeOAuthState();
      if (!validBridge(stored) || !expectedState || params.get('state') !== expectedState) {
        throw new Error('登录校验失败或已超时，请回到杂盒重新登录。');
      }
      const callback = new URL(`http://127.0.0.1:${stored.port}/callback`);
      callback.searchParams.set('state', stored.state);
      const code = params.get('code');
      if (code) callback.searchParams.set('code', code);
      else callback.searchParams.set('error', 'access_denied');
      location.replace(callback.href);
    }
  } catch (error) {
    sessionStorage.removeItem(KEY);
    root.textContent = error instanceof Error ? error.message : '登录失败，请回到杂盒重试。';
  }
  return true;
}
