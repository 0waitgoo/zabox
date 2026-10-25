import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireDesktopLoginService } from '../src/services/desktopOAuthConfig';
import { tryDesktopLoginBridge, validBridge } from '../src/services/desktopLoginBridge';

test('desktop bridge validates the loopback port, nonce and expiry', () => {
  const bridge = { port: 54321, state: 'a'.repeat(64), createdAt: 1000 };
  assert.equal(validBridge(bridge, 1001), true);
  for (const change of [{ port: 80 }, { port: 65536 }, { port: 1.5 }, { state: 'bad' }, { createdAt: 2000 }, { createdAt: NaN }]) {
    assert.equal(validBridge({ ...bridge, ...change }, 1001), false);
  }
  assert.equal(validBridge(bridge, 181000), false);
});

function environment(search: string, entries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(entries));
  const root = { textContent: '', style: { cssText: '' } };
  let destination = '';
  Object.assign(globalThis, {
    location: { search, pathname: '/', replace: (url: string) => { destination = url; } },
    history: { replaceState: () => {} },
    document: { getElementById: () => root },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  return { root, destination: () => destination, storage };
}

test('ordinary website login is left to the existing app', async () => {
  environment('?code=website-code&state=website-state');
  assert.equal(await tryDesktopLoginBridge(), false);
});

test('desktop launch starts browser OAuth and remembers the local callback', async () => {
  const state = 'd'.repeat(64);
  const env = environment(`?desktop_port=54321&desktop_state=${state}`);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ clientId: 'public-client-id' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    assert.equal(await tryDesktopLoginBridge(), true);
    const destination = new URL(env.destination());
    assert.equal(destination.origin, 'https://github.com');
    assert.equal(destination.pathname, '/login/oauth/authorize');
    assert.equal(destination.searchParams.get('client_id'), 'public-client-id');
    assert.equal(destination.searchParams.get('state'), env.storage.get('ainav-oauth-state'));
    assert.notEqual(destination.searchParams.get('state'), state);
    assert.equal(JSON.parse(env.storage.get('zabox-desktop-login-v1')!).port, 54321);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('invalid launch port never starts GitHub authorization', async () => {
  const env = environment(`?desktop_port=80&desktop_state=${'d'.repeat(64)}`);
  await tryDesktopLoginBridge();
  assert.equal(env.destination(), '');
  assert.match(env.root.textContent, /无效/);
});

test('valid browser callback sends only the code and desktop state to loopback', async () => {
  const bridge = { port: 54321, state: 'b'.repeat(64), createdAt: Date.now() };
  const env = environment('?code=auth-code&state=oauth-state', {
    'zabox-desktop-login-v1': JSON.stringify(bridge), 'ainav-oauth-state': 'oauth-state',
  });
  assert.equal(await tryDesktopLoginBridge(), true);
  const destination = new URL(env.destination());
  assert.equal(destination.origin, 'http://127.0.0.1:54321');
  assert.equal(destination.searchParams.get('code'), 'auth-code');
  assert.equal(destination.searchParams.get('state'), bridge.state);
  assert.equal(env.storage.has('zabox-desktop-login-v1'), false);
});

test('wrong OAuth state is rejected without contacting the local application', async () => {
  const env = environment('?code=code&state=wrong', {
    'zabox-desktop-login-v1': JSON.stringify({ port: 54321, state: 'b'.repeat(64), createdAt: Date.now() }),
    'ainav-oauth-state': 'expected',
  });
  assert.equal(await tryDesktopLoginBridge(), true);
  assert.equal(env.destination(), '');
  assert.match(env.root.textContent, /校验失败/);
});

test('denied authorization returns an error to the app', async () => {
  const env = environment('?error=access_denied&state=expected', {
    'zabox-desktop-login-v1': JSON.stringify({ port: 54321, state: 'c'.repeat(64), createdAt: Date.now() }),
    'ainav-oauth-state': 'expected',
  });
  await tryDesktopLoginBridge();
  assert.equal(new URL(env.destination()).searchParams.get('error'), 'access_denied');
});

test('desktop login rejects the old website before starting an authorization wait', () => {
  assert.throws(() => requireDesktopLoginService({ clientId: 'public-id' }), /尚未更新/);
  assert.throws(() => requireDesktopLoginService({ desktopLoginBridge: 1 }), /尚未配置/);
  assert.doesNotThrow(() => requireDesktopLoginService({ clientId: 'public-id', desktopLoginBridge: 1 }));
});
