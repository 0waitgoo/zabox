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
    readOuterRect: async () => ({ ...rect, width: rect.width + 16, height: rect.height + 16 }),
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
      assert.equal(f.rect().width, Math.round(232 * scale));
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

for (const scale of [1, 1.25, 1.5, 2]) {
  test(`only the marked header region docks at ${scale * 100}% DPI`, async () => {
    const f = fixture(scale);
    const bounds = { x: 0, y: 0, width: 1920, height: 2400 };
    const region = { x: 0, y: 0, width: 320, height: 90 };
    // Bottom of the full window touches the screen, but the header does not.
    await f.win.setPosition(400, bounds.height - 680 * scale - 16);
    await f.controller.collapse(bounds, region);
    assert.equal(f.controller.edge, null);
    // Right-side window controls touch first; the marked region is still inside.
    await f.win.setPosition(1920 - 420 * scale - 16, 100);
    await f.controller.collapse(bounds, region);
    assert.equal(f.controller.edge, null);
    // The marked region itself reaches the right edge.
    await f.win.setPosition(1920 - 320 * scale, 100);
    await f.controller.collapse(bounds, region);
    assert.equal(f.controller.edge, 'right');
    await f.controller.restoreEdge();
    await f.win.setPosition(0, 100);
    await f.controller.collapse(bounds, region);
    assert.equal(f.controller.edge, 'left');
    await f.controller.restoreEdge();
    await f.win.setPosition(400, 0);
    await f.controller.collapse(bounds, region);
    assert.equal(f.controller.edge, 'top');
  });
}

for (const scale of [1, 1.25, 1.5, 2]) {
  test(`expand upward at the work-area bottom and keep the toolbar anchored at ${scale * 100}% DPI`, async () => {
    const f = fixture(scale);
    const bounds = { x: -2400, y: 40, width: 2400, height: 2000 };
    f.win.readWorkArea = async () => bounds;
    await f.controller.enterHeader();
    const stripY = bounds.y + bounds.height - 48 * scale - 16;
    await f.win.setPosition(-700, stripY);
    await f.controller.exitHeader();
    assert.equal(f.controller.toolbarBottom, true);
    assert.equal(f.rect().y, bounds.y + bounds.height - 680 * scale - 16);
    assert.equal(f.rect().height, 680 * scale);
    for (let i = 0; i < 10; i++) {
      await f.controller.enterHeader();
      assert.equal(f.rect().y, stripY);
      await f.controller.exitHeader();
      assert.equal(f.rect().height, 680 * scale);
      assert.equal(f.controller.toolbarBottom, true);
    }
    // Move the collapsed toolbar higher: sufficient room restores top-toolbar mode.
    await f.controller.enterHeader();
    await f.win.setPosition(-700, 100);
    await f.controller.exitHeader();
    assert.equal(f.rect().y, 100);
    assert.equal(f.controller.toolbarBottom, false);
  });
}

test('expanding a tall saved window fits the current smaller monitor work area', async () => {
  const f = fixture();
  f.win.readWorkArea = async () => ({ x: 60, y: 40, width: 800, height: 600 });
  await f.controller.enterHeader();
  await f.win.setPosition(800, 550);
  await f.controller.exitHeader();
  const rect = f.rect();
  assert.equal(rect.height, 584);
  assert.ok(rect.x >= 60 && rect.x + rect.width + 16 <= 860);
  assert.ok(rect.y >= 40 && rect.y + rect.height + 16 <= 640);
  assert.equal(f.controller.toolbarBottom, true);
});

for (const scale of [1, 1.5, 2]) {
  test(`manually enlarging a compact strip restores content at ${scale * 100}% DPI`, async () => {
    const f = fixture(scale);
    await Promise.all([f.controller.enterHeader(), f.controller.handleResize()]);
    assert.equal(f.controller.headerOnly, true, 'programmatic strip sizing must stay compact');
    await f.win.setSize(500 * scale, 400 * scale);
    await f.controller.handleResize();
    assert.equal(f.controller.headerOnly, false);
    assert.equal(f.rect().height, 400 * scale);
    assert.equal(f.rect().width, 500 * scale);
    await f.controller.handleResize();
    assert.equal(f.rect().height, 400 * scale);
    await f.controller.enterHeader();
    await f.controller.exitHeader();
    assert.equal(f.rect().height, 400 * scale);
  });
}

test('enlarging only a strip width also exits compact mode with a usable minimum height', async () => {
  const f = fixture();
  await f.controller.enterHeader();
  await f.win.setSize(600, 48);
  await f.controller.handleResize();
  assert.equal(f.controller.headerOnly, false);
  assert.equal(f.rect().width, 600);
  assert.equal(f.rect().height, 200);
});

test('hover preview restores full content temporarily then returns to the same short strip', async () => {
  const f = fixture();
  await f.controller.enterHeader();
  const strip = f.rect();
  await f.controller.previewHeader();
  assert.equal(f.controller.previewing, true);
  assert.equal(f.controller.headerOnly, false);
  assert.equal(f.rect().height, 680);
  await f.controller.handleResize();
  assert.equal(f.controller.previewing, true, 'native preview resize must not pin it open');
  await f.controller.closePreview();
  assert.equal(f.controller.previewing, false);
  assert.equal(f.controller.headerOnly, true);
  assert.deepEqual(f.rect(), strip);
  await f.controller.exitHeader();
  assert.equal(f.rect().width, 420);
  assert.equal(f.rect().height, 680);
});

test('leaving during a queued preview and resizing a preview keep transitions consistent', async () => {
  const f = fixture();
  await f.controller.enterHeader();
  await Promise.all([f.controller.previewHeader(), f.controller.closePreview()]);
  assert.equal(f.controller.headerOnly, true);
  await f.controller.previewHeader();
  await f.win.setSize(500, 500);
  await f.controller.handleResize();
  assert.equal(f.controller.previewing, false);
  await f.controller.closePreview();
  assert.equal(f.controller.headerOnly, false);
  assert.equal(f.rect().height, 500);
});
