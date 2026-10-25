import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopShortcutController, EXPAND_SHORTCUT_KEY, SHORTCUT_BINDING_KEY, loadExpandShortcut, loadShortcutBinding, captureShortcut, shortcutLabel } from '../src/components/v2/desktopShortcut';

function fixture(saved: string | null = null) {
  const data = new Map<string, string>();
  if (saved !== null) data.set(EXPAND_SHORTCUT_KEY, saved);
  const calls: boolean[] = [];
  let fail = false;
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const controller = new DesktopShortcutController(async (enabled) => { if (fail) { fail = false; throw new Error('occupied'); } calls.push(enabled); }, storage, () => {});
  return { controller, calls, storage, fail: () => { fail = true; } };
}

test('shortcut defaults on, and disabled preference stays disabled after restart', async () => {
  const f = fixture();
  assert.equal(f.controller.enabled, true);
  await f.controller.initialize();
  await f.controller.setEnabled(false);
  assert.deepEqual(f.calls, [true, false]);
  const next = fixture(f.storage.getItem(EXPAND_SHORTCUT_KEY));
  await next.controller.initialize();
  assert.equal(next.controller.enabled, false);
  assert.deepEqual(next.calls, [false]);
});

test('registration failure preserves the previous checkbox and saved preference, and retry works', async () => {
  const f = fixture('false');
  f.fail();
  await assert.rejects(f.controller.setEnabled(true), /occupied/);
  assert.equal(f.controller.enabled, false);
  assert.equal(loadExpandShortcut(f.storage), false);
  await f.controller.setEnabled(true);
  assert.equal(f.controller.enabled, true);
});

test('rapid changes register and unregister in order', async () => {
  const f = fixture();
  await Promise.all([f.controller.initialize(), f.controller.setEnabled(false), f.controller.setEnabled(true)]);
  assert.deepEqual(f.calls, [true, false, true]);
  assert.equal(f.controller.enabled, true);
});

test('recorded keys use physical key codes, ignore modifier-only presses and reject repeats', () => {
  const key = { code: 'Backquote', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, repeat: false };
  assert.equal(captureShortcut(key), 'Control+Backquote');
  assert.equal(captureShortcut({ ...key, code: 'KeyK', altKey: true }), 'Control+Alt+KeyK');
  assert.equal(captureShortcut({ ...key, code: 'ControlLeft' }), null);
  assert.equal(captureShortcut({ ...key, ctrlKey: false }), null);
  assert.equal(captureShortcut({ ...key, repeat: true }), null);
  assert.equal(shortcutLabel('Control+Backquote'), 'Ctrl + `');
});

test('new bindings persist, and registration failure preserves the old binding', async () => {
  const f = fixture();
  await f.controller.setAccelerator('Control+Alt+KeyK');
  assert.equal(loadShortcutBinding(f.storage), 'Control+Alt+KeyK');
  assert.equal(f.storage.getItem(SHORTCUT_BINDING_KEY), 'Control+Alt+KeyK');
  f.fail();
  await assert.rejects(f.controller.setAccelerator('Control+KeyJ'), /occupied/);
  assert.equal(f.controller.accelerator, 'Control+Alt+KeyK');
  assert.equal(loadShortcutBinding(f.storage), 'Control+Alt+KeyK');
  await f.controller.suspend();
  assert.equal(f.controller.enabled, true, 'recording does not disable the saved preference');
});
