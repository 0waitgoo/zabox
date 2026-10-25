import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCloseAction, loadMinimizeOnClose, saveMinimizeOnClose } from '../src/components/v2/desktopClose';

test('close hides to tray by default and a changed preference survives restart', () => {
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

test('close removes the taskbar entry and hides to the tray without closing', async () => {
  const calls: string[] = [];
  await applyCloseAction(true, {
    setSkipTaskbar: async (skip) => { calls.push(`taskbar:${skip}`); },
    hide: async () => { calls.push('hide'); }, close: async () => { calls.push('close'); },
  }, async () => { calls.push('restore'); });
  assert.deepEqual(calls, ['restore', 'taskbar:true', 'hide']);
});

test('turning the switch off performs an actual close without hiding', async () => {
  const calls: string[] = [];
  await applyCloseAction(false, {
    setSkipTaskbar: async () => { calls.push('taskbar'); },
    hide: async () => { calls.push('hide'); }, close: async () => { calls.push('close'); },
  }, async () => { calls.push('restore'); });
  assert.deepEqual(calls, ['close']);
});

test('a failed tray hide restores the taskbar entry and never closes', async () => {
  const calls: string[] = [];
  await assert.rejects(applyCloseAction(true, {
    setSkipTaskbar: async (skip) => { calls.push(`taskbar:${skip}`); },
    hide: async () => { throw new Error('OS refused'); }, close: async () => { calls.push('close'); },
  }, async () => {}), /OS refused/);
  assert.deepEqual(calls, ['taskbar:true', 'taskbar:false']);
});

test('a failed taskbar change leaves the visible window open', async () => {
  const calls: string[] = [];
  await assert.rejects(applyCloseAction(true, {
    setSkipTaskbar: async () => { throw new Error('OS refused'); },
    hide: async () => { calls.push('hide'); }, close: async () => { calls.push('close'); },
  }, async () => {}), /OS refused/);
  assert.deepEqual(calls, []);
});
