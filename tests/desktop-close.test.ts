import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCloseAction, loadMinimizeOnClose, saveMinimizeOnClose } from '../src/components/v2/desktopClose';

test('close minimizes by default and a changed preference survives restart', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(loadMinimizeOnClose(storage), true);
  saveMinimizeOnClose(false, storage);
  assert.equal(loadMinimizeOnClose(storage), false);
  saveMinimizeOnClose(true, storage);
  assert.equal(loadMinimizeOnClose(storage), true);
});

test('blocked preference storage keeps the default usable', () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadMinimizeOnClose(storage), true);
  assert.doesNotThrow(() => saveMinimizeOnClose(false, storage));
});

test('close restores an off-screen edge and minimizes without closing the window', async () => {
  const calls: string[] = [];
  await applyCloseAction(true, {
    minimize: async () => { calls.push('minimize'); }, close: async () => { calls.push('close'); },
  }, async () => { calls.push('restore'); });
  assert.deepEqual(calls, ['restore', 'minimize']);
});

test('turning the switch off performs an actual close without minimizing', async () => {
  const calls: string[] = [];
  await applyCloseAction(false, {
    minimize: async () => { calls.push('minimize'); }, close: async () => { calls.push('close'); },
  }, async () => { calls.push('restore'); });
  assert.deepEqual(calls, ['close']);
});

test('a failed minimize never falls back to closing or hiding', async () => {
  let closed = false;
  await assert.rejects(applyCloseAction(true, {
    minimize: async () => { throw new Error('OS refused'); }, close: async () => { closed = true; },
  }, async () => {}), /OS refused/);
  assert.equal(closed, false);
});
