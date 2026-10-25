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
  assert.equal(await colorOf('[data-plan-desktop]'), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('[data-plan-logo]').evaluate((element) => getComputedStyle(element).filter), 'brightness(0)');
  assert.equal(await colorOf('[data-task-add]'), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('[data-task-add]').evaluate((element) => getComputedStyle(element, '::placeholder').color), 'rgb(0, 0, 0)');
  await page.locator('[data-task-add]').fill('白天文字检查');
  await page.locator('[data-task-add]').press('Enter');
  await page.locator('[data-task-title]').filter({ hasText: '白天文字检查' }).waitFor();
  assert.equal(await colorOf('[data-task-title]'), 'rgb(0, 0, 0)');
  assert.equal(await page.getByRole('button', { name: '标记完成', exact: true }).first().evaluate((element) => getComputedStyle(element).color), 'rgba(0, 0, 0, 0)');
  assert.equal(await colorOf('[aria-label="取消置顶"]'), 'rgb(0, 0, 0)');

  await page.getByTitle('设置', { exact: true }).click();
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
  assert.deepEqual(errors, []);
  console.log('Desktop browser checks passed: black light-mode text/logo, invisible unchecked glyph, pin control, custom colors, dark-mode restore and persisted background.');
} finally {
  await browser.close();
}
