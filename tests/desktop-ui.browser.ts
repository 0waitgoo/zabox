import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = 'https://zabox-desktop.test';
  const output = path.resolve('dist-plan');
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(output, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(output + path.sep)) return route.fulfill({ status: 404 });
    try {
      const contentType = file.endsWith('.js') ? 'application/javascript'
        : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml'
          : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      await route.fulfill({ status: 200, contentType, body: await readFile(file) });
    } catch { await route.fulfill({ status: 404 }); }
  });
  await page.addInitScript(() => {
    if (localStorage.getItem('zabox-plan-theme') === null) localStorage.setItem('zabox-plan-theme', 'light');
  });
  await page.goto(origin + '/plan.html');
  const root = page.locator('[data-plan-desktop]');
  await root.waitFor();
  const colorOf = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).color);
  assert.equal(await page.getByRole('button', { name: '同步', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'AI 整理', exact: true }).textContent(), '');
  const loginBox = await page.getByRole('button', { name: 'GitHub 登录', exact: true }).boundingBox();
  const pinBox = await page.getByRole('button', { name: '取消置顶', exact: true }).boundingBox();
  assert.ok(loginBox && pinBox && Math.abs(loginBox.y - pinBox.y) < 2);
  await page.setViewportSize({ width: 280, height: 800 });
  const narrowLogin = await page.getByRole('button', { name: 'GitHub 登录', exact: true }).boundingBox();
  const narrowClose = await page.getByRole('button', { name: '收进托盘', exact: true }).boundingBox();
  assert.ok(narrowLogin && narrowClose && Math.abs(narrowLogin.y - narrowClose.y) < 2 && narrowClose.x + narrowClose.width <= 280);
  await page.setViewportSize({ width: 420, height: 800 });
  assert.equal(await colorOf('[data-plan-desktop]'), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('[data-plan-logo]').count(), 0);
  assert.equal(await colorOf('[data-task-add]'), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('[data-task-add]').evaluate((element) => getComputedStyle(element, '::placeholder').color), 'rgb(0, 0, 0)');
  await page.locator('[data-task-add]').fill('白天文字检查');
  await page.locator('[data-task-add]').press('Enter');
  await page.locator('[data-task-title]').filter({ hasText: '白天文字检查' }).waitFor();
  assert.equal(await colorOf('[data-task-title]'), 'rgb(0, 0, 0)');
  assert.equal(await page.getByRole('button', { name: '标记完成', exact: true }).first().evaluate((element) => getComputedStyle(element).color), 'rgba(0, 0, 0, 0)');
  assert.equal(await colorOf('[aria-label="取消置顶"]'), 'rgb(0, 0, 0)');

  await page.getByTitle('设置', { exact: true }).click();
  assert.equal(await page.locator('[data-plan-logo]').evaluate((element) => getComputedStyle(element).filter), 'brightness(0)');
  assert.equal(await page.getByText('杂盒计划', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: 'https://zahe.hiitun.top/', exact: true }).getAttribute('href'), 'https://zahe.hiitun.top/');
  assert.equal(await page.getByText('窗口行为', { exact: true }).count(), 0);
  assert.equal(await page.getByText('开启后，点右上角', { exact: false }).count(), 0);
  const shortcutCheckbox = page.getByRole('checkbox', { name: '启用展开收起快捷键', exact: true });
  assert.equal(await shortcutCheckbox.isChecked(), true);
  const shortcutRecorder = page.getByRole('button', { name: '设置展开收起快捷键', exact: true });
  await shortcutRecorder.click();
  await shortcutRecorder.press('Control+Alt+k');
  await page.waitForFunction(() => document.querySelector('[aria-label="设置展开收起快捷键"]')?.textContent?.includes('Ctrl + Alt + K'));
  await shortcutCheckbox.uncheck();
  assert.equal(await shortcutCheckbox.isChecked(), false);
  const closeSwitch = page.getByRole('switch', { name: '点击关闭时收进托盘' });
  assert.equal(await closeSwitch.isChecked(), true);
  await closeSwitch.locator('..').click();
  assert.equal(await closeSwitch.isChecked(), false);
  await page.getByTitle('关闭窗口', { exact: true }).waitFor();
  const picker = page.getByLabel('自定义窗口底色', { exact: true });
  const chooseColor = async (color: string, theme: string) => {
    await picker.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, color);
    await page.waitForFunction((expected) => document.querySelector('[data-plan-desktop]')?.getAttribute('data-plan-theme') === expected, theme);
  };
  await chooseColor('#102a43', 'dark');
  assert.equal(await colorOf('[data-plan-desktop]'), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('[data-plan-logo]').evaluate((element) => getComputedStyle(element).filter), 'none');
  await chooseColor('#d9e8da', 'light');
  assert.equal(await colorOf('[data-plan-desktop]'), 'rgb(0, 0, 0)');
  assert.equal(await picker.inputValue(), '#d9e8da');
  await page.reload();
  await root.waitFor();
  assert.equal(await root.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(217, 232, 218)');
  assert.equal(await colorOf('[data-plan-desktop]'), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('[data-plan-logo]').count(), 0);
  await page.getByTitle('关闭窗口', { exact: true }).waitFor();
  await page.getByTitle('设置', { exact: true }).click();
  assert.equal(await closeSwitch.isChecked(), false);
  assert.equal(await shortcutCheckbox.isChecked(), false);
  assert.match(await shortcutRecorder.textContent() ?? '', /Ctrl \+ Alt \+ K/);
  await closeSwitch.locator('..').click();
  await page.getByTitle('收进托盘', { exact: true }).waitFor();
  // Create from the settings background, switch back to the main page and focus.
  await page.getByRole('heading', { name: '外观', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '新建待办', exact: true }).click();
  await page.locator('[data-task-add]').fill('右键新建待办');
  await page.locator('[data-task-add]').press('Enter');
  await page.locator('[data-task-title]').filter({ hasText: '右键新建待办' }).waitFor();
  // Existing row context menus retain edit/delete and do not show the create menu.
  await page.locator('[data-task-title]').filter({ hasText: '右键新建待办' }).click({ button: 'right' });
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(await page.getByRole('menu', { name: '新建', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await root.click({ button: 'right', position: { x: 150, y: 20 } });
  await page.getByRole('menuitem', { name: '新建长期计划', exact: true }).click();
  const planTitle = page.locator('[data-plan-form] input').first();
  await planTitle.fill('右键长期计划');
  await page.getByRole('button', { name: '添加计划', exact: true }).click();
  await page.locator('[data-plan-item]').filter({ hasText: '右键长期计划' }).waitFor();
  await root.click({ button: 'right', position: { x: 150, y: 20 } });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu', { name: '新建', exact: true }).count(), 0);
  await root.click({ button: 'right', position: { x: 415, y: 795 } });
  const menuBox = await page.getByRole('menu', { name: '新建', exact: true }).boundingBox();
  assert.ok(menuBox && menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= 420 && menuBox.y + menuBox.height <= 800);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '待办', exact: true }).click();
  await page.locator('[data-task-add]').click({ button: 'right' });
  assert.equal(await page.getByRole('menu', { name: '新建', exact: true }).count(), 0);
  await page.getByRole('tab', { name: '待办', exact: true }).click();
  assert.equal(await page.locator('[data-desktop-workspace]').getAttribute('data-layout'), 'tabs');
  assert.equal(await page.locator('[data-desktop-panel="task"]').isVisible(), true);
  assert.equal(await page.locator('[data-desktop-panel="plan"]').isVisible(), false);
  await page.getByRole('tab', { name: '长期计划', exact: true }).click();
  assert.equal(await page.locator('[data-desktop-panel="task"]').isVisible(), false);
  assert.equal(await page.locator('[data-desktop-panel="plan"]').isVisible(), true);
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.waitForFunction(() => document.querySelector('[data-desktop-workspace]')?.getAttribute('data-layout') === 'columns');
  assert.equal(await page.locator('[data-desktop-panel="task"]').isVisible(), true);
  assert.equal(await page.locator('[data-desktop-panel="plan"]').isVisible(), true);
  const taskBox = await page.locator('[data-desktop-panel="task"]').boundingBox();
  const planBox = await page.locator('[data-desktop-panel="plan"]').boundingBox();
  assert.ok(taskBox && planBox && taskBox.x + taskBox.width <= planBox.x);
  const taskInputBox = await page.locator('[data-task-add]').boundingBox();
  const planButtonBox = await page.locator('[data-plan-new]').boundingBox();
  assert.ok(taskInputBox && planButtonBox && Math.abs(taskInputBox.y - planButtonBox.y) < 5);
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForFunction(() => document.querySelector('[data-desktop-workspace]')?.getAttribute('data-layout') === 'tabs');
  assert.equal(await page.getByRole('tab', { name: '长期计划', exact: true }).getAttribute('aria-selected'), 'true');
  assert.deepEqual(errors, []);
  console.log('Desktop browser checks passed: black light-mode text/logo, invisible unchecked glyph, pin control, custom colors, dark-mode restore and persisted background.');
} finally {
  await browser.close();
}
