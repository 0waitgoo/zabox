import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopWindowController, edgeAt, type DesktopWindowAdapter } from '../src/components/v2/desktopWindow';

function fixture(scale = 1) {
  let rect = { x: 100, y: 100, width: Math.round(420 * scale), height: Math.round(680 * scale) };
  let minimum = { width: 280, height: 200 };
  let maximized = false;
  let fail = false;
  const operations: string[] = [];
  const win: DesktopWindowAdapter = {
    readRect: async () => ({ ...rect }),
    scaleFactor: async () => scale,
    setMinSize: async (width, height) => { minimum = { width, height }; operations.push(`min:${height}`); },
    setSize: async (width, height) => {
      operations.push(`size:${height}`);
      if (fail) { fail = false; throw new Error('OS rejected resize'); }
      rect = { ...rect, width: Math.max(width, minimum.width * scale), height: Math.max(height, minimum.height * scale) };
    },
    setPosition: async (x, y) => { rect = { ...rect, x, y }; },
    isMaximized: async () => maximized,
    unmaximize: async () => { maximized = false; },
    toggleMaximize: async () => { maximized = !maximized; },
  };
  const controller = new DesktopWindowController(win, () => {});
  return { controller, win, operations, rect: () => ({ ...rect }), minimum: () => minimum,
    maximized: () => maximized, failNextResize: () => { fail = true; } };
}

for (const scale of [1, 1.25, 1.5, 2]) {
  test(`100 collapse/expand cycles preserve client size at ${scale * 100}% DPI`, async () => {
    const f = fixture(scale);
    const original = f.rect();
    for (let i = 0; i < 100; i++) {
      await f.controller.enterHeader();
      assert.equal(f.rect().height, Math.round(48 * scale));
      await f.controller.exitHeader();
      assert.deepEqual(f.rect(), original);
    }
    assert.deepEqual(f.operations.slice(0, 2), ['min:48', `size:${Math.round(48 * scale)}`]);
  });
}

test('rapid transitions do not snapshot a half-finished resize', async () => {
  const f = fixture();
  await Promise.all([f.controller.enterHeader(), f.controller.enterHeader(), f.controller.exitHeader(), f.controller.exitHeader()]);
  assert.equal(f.controller.headerOnly, false);
  assert.equal(f.rect().height, 680);
});

test('maximize from compact restores the normal window and remains maximized', async () => {
  const f = fixture();
  await f.controller.enterHeader();
  await f.controller.maximize();
  assert.equal(f.controller.headerOnly, false);
  assert.equal(f.maximized(), true);
  await f.controller.collapse({ x: 0, y: 0, width: 1920, height: 1040 });
  assert.equal(f.maximized(), true);
  assert.equal(f.controller.edge, null);
});

test('restore follows a moved strip rather than jumping to its original position', async () => {
  const f = fixture();
  await f.controller.enterHeader();
  await f.win.setPosition(400, 200);
  await f.controller.exitHeader();
  assert.deepEqual(f.rect(), { x: 400, y: 200, width: 420, height: 680 });
});

test('a rejected resize keeps the full view and allows a subsequent transition', async () => {
  const f = fixture();
  f.failNextResize();
  await assert.rejects(f.controller.enterHeader());
  assert.equal(f.controller.headerOnly, false);
  assert.deepEqual(f.minimum(), { width: 280, height: 200 });
  await f.controller.enterHeader();
  assert.equal(f.controller.headerOnly, true);
});

test('edge restore changes position only, respects work area and scaled peek width', async () => {
  const f = fixture(1.5);
  const bounds = { x: -1920, y: 0, width: 1920, height: 1040 };
  await f.win.setPosition(-630, 100);
  const original = f.rect();
  await f.controller.collapse(bounds);
  assert.equal(f.controller.edge, 'right');
  assert.equal(f.rect().x, -36);
  await f.controller.restoreEdge();
  assert.deepEqual(f.rect(), original);
  assert.equal(f.operations.length, 0);
});

test('compact strips never enter the edge-hidden state', async () => {
  const f = fixture();
  await f.controller.enterHeader();
  await f.win.setPosition(0, 0);
  await f.controller.collapse({ x: 0, y: 0, width: 1920, height: 1040 });
  assert.equal(f.controller.edge, null);
});

test('work-area edges include taskbars placed at the top or left', () => {
  const bounds = { x: 60, y: 40, width: 1860, height: 1040 };
  assert.equal(edgeAt({ x: 60, y: 200, width: 420, height: 680 }, bounds, 4), 'left');
  assert.equal(edgeAt({ x: 200, y: 40, width: 420, height: 680 }, bounds, 4), 'top');
  assert.equal(edgeAt({ x: 200, y: 200, width: 420, height: 680 }, bounds, 4), null);
});
