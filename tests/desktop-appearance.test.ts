import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_BACKGROUND_KEY, backgroundColorRgb, loadCustomBackground, normalizeBackgroundColor, themeForBackground } from '../src/components/v2/desktopAppearance';

test('custom colors normalize to picker-compatible hex values', () => {
  assert.equal(normalizeBackgroundColor(' #AbC '), '#aabbcc');
  assert.equal(normalizeBackgroundColor('#123456'), '#123456');
  for (const value of [null, 12, 'red', '#12', '#12345g', 'url(test)']) assert.equal(normalizeBackgroundColor(value), null);
  assert.deepEqual(backgroundColorRgb('#aabbcc'), [170, 187, 204]);
});

test('chosen background survives a restart and bad storage falls back to the theme default', () => {
  assert.equal(loadCustomBackground({ getItem: (key) => key === CUSTOM_BACKGROUND_KEY ? '#cfe3ed' : null }), '#cfe3ed');
  assert.equal(loadCustomBackground({ getItem: () => 'invalid' }), null);
  assert.equal(loadCustomBackground({ getItem: () => { throw new Error('blocked'); } }), null);
});

test('dark backgrounds use light text and pale backgrounds use dark text', () => {
  for (const color of ['#000000', '#17171d', '#102a43']) assert.equal(themeForBackground(color), 'dark');
  for (const color of ['#ffffff', '#cfe3ed', '#d9e8da', '#f0dce4']) assert.equal(themeForBackground(color), 'light');
});
