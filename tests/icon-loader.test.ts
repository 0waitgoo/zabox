import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoSiteLogo, navGroups } from '../src/data/groups';
import { createIconLoader, iconCandidates, loadImage } from '../src/utils/iconLoader';
import { existsSync } from 'node:fs';
import { localSiteIcons } from '../src/data/localSiteIcons';

test('known domains use local icons even with renamed or Chinese site names', () => {
  assert.equal(autoSiteLogo('我的豆包', 'https://www.doubao.com/chat/'), '/icon_APP/doubao.svg');
  assert.equal(autoSiteLogo('新站点', 'https://example.com/tools'), 'https://example.com/favicon.ico');
  for (const group of navGroups) for (const site of group.sites) {
    if (site.logo.startsWith('/icon_APP/')) assert.ok(existsSync(`public${site.logo}`), site.logo);
  }
});

test('old Google sources migrate and fallback sources are unique', () => {
  assert.deepEqual(iconCandidates('https://www.google.com/s2/favicons?domain=www.doubao.com&sz=128', '豆包', 'https://www.doubao.com'),
    ['/icon_APP/doubao.svg', 'https://www.doubao.com/favicon.ico']);
  assert.deepEqual(iconCandidates('https://example.com/favicon.ico', 'Example', 'https://example.com'), ['https://example.com/favicon.ico']);
  assert.deepEqual(iconCandidates('data:image/png;base64,custom', 'Custom', 'https://example.com'), ['data:image/png;base64,custom']);
});

test('bundled entertainment icons bypass external domains, including old stored URLs', () => {
  for (const [remote, local] of Object.entries(localSiteIcons)) {
    assert.ok(existsSync(`public${local}`), local);
    assert.equal(iconCandidates(remote, '站点', new URL(remote).origin)[0], local);
    assert.equal(autoSiteLogo('站点', new URL(remote).origin), local);
  }
});

test('simultaneous card renders share a single image load', async () => {
  let count = 0;
  const loader = createIconLoader(async () => { count++; });
  const values = await Promise.all([loader('/icon.svg', 'Site'), loader('/icon.svg', 'Site')]);
  assert.deepEqual(values, ['/icon.svg', '/icon.svg']);
  assert.equal(count, 1);
});

test('persisted resolution skips a failed primary source after reload', async () => {
  const storage = { value: '', getItem() { return this.value || null; }, setItem(_key: string, value: string) { this.value = value; } };
  const first = createIconLoader(async (src) => { if (src === '/missing.svg') throw new Error(); }, storage);
  await first('/missing.svg', 'Site', 'https://example.com');
  const calls: string[] = [];
  const reloaded = createIconLoader(async (src) => { calls.push(src); }, storage);
  assert.equal(await reloaded('/missing.svg', 'Site', 'https://example.com'), 'https://example.com/favicon.ico');
  assert.deepEqual(calls, ['https://example.com/favicon.ico']);
});

test('failed icons are cached briefly, expire and support explicit retry', async () => {
  let time = 0;
  let calls = 0;
  const loader = createIconLoader(async () => { calls++; throw new Error(); }, undefined, () => time);
  assert.match(await loader('/missing.svg', 'Site'), /^data:image\/svg\+xml/);
  await loader('/missing.svg', 'Site');
  assert.equal(calls, 1);
  time = 61_000;
  await loader('/missing.svg', 'Site');
  assert.equal(calls, 2);
  loader.invalidate('/missing.svg', 'Site');
  await loader('/missing.svg', 'Site');
  assert.equal(calls, 3);
});

test('blocked storage and uploaded images do not prevent rendering', async () => {
  let calls = 0;
  const storage = { getItem(): string { throw new Error(); }, setItem() { throw new Error(); } };
  const loader = createIconLoader(async () => { calls++; }, storage);
  assert.equal(await loader('data:image/png;base64,custom', 'Site'), 'data:image/png;base64,custom');
  assert.equal(calls, 0);
  assert.equal(await loader('/icon.svg', 'Site'), '/icon.svg');
});

test('a stalled image is cancelled at the timeout and its handlers released', async () => {
  const image = { src: '', onload: null, onerror: null, referrerPolicy: '' };
  await assert.rejects(loadImage('https://example.com/slow.ico', 10, () => image as HTMLImageElement));
  assert.equal(image.src, '');
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
});
