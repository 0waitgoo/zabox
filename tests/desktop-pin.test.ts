import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopPinController, PIN_KEY, loadAlwaysOnTop } from '../src/components/v2/desktopPin';

function fixture(initial?: boolean) {
  const saved = new Map<string, string>(initial === undefined ? [] : [[PIN_KEY, String(initial)]]);
  const applied: boolean[] = [];
  const shown: boolean[] = [];
  let fail = false;
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const controller = new DesktopPinController(async (pinned) => {
    if (fail) { fail = false; throw new Error('native failure'); }
    applied.push(pinned);
  }, storage, (pinned) => shown.push(pinned));
  return { controller, saved, applied, shown, storage, failNext: () => { fail = true; } };
}

test('first launch defaults to always on top', async () => {
  const f = fixture();
  assert.equal(f.controller.pinned, true);
  await f.controller.initialize();
  assert.deepEqual(f.applied, [true]);
});

test('unpin is remembered and restored on the next launch', async () => {
  const f = fixture();
  await f.controller.toggle();
  assert.equal(f.saved.get(PIN_KEY), 'false');
  const applied: boolean[] = [];
  const reopened = new DesktopPinController(async (pinned) => { applied.push(pinned); }, f.storage, () => {});
  await reopened.initialize();
  assert.deepEqual(applied, [false]);
});

test('startup and rapid toggles apply in order', async () => {
  const f = fixture(false);
  await Promise.all([f.controller.initialize(), f.controller.toggle(), f.controller.toggle()]);
  assert.deepEqual(f.applied, [false, true, false]);
  assert.equal(f.controller.pinned, false);
  assert.equal(f.saved.get(PIN_KEY), 'false');
});

test('native failure does not change the icon or persisted choice and retry works', async () => {
  const f = fixture(true);
  f.failNext();
  await assert.rejects(f.controller.toggle());
  assert.equal(f.controller.pinned, true);
  assert.equal(f.saved.get(PIN_KEY), 'true');
  assert.deepEqual(f.shown, []);
  await f.controller.toggle();
  assert.deepEqual(f.shown, [false]);
});

test('blocked storage keeps the default usable', () => {
  assert.equal(loadAlwaysOnTop({ getItem: () => { throw new Error('storage blocked'); } }), true);
});
