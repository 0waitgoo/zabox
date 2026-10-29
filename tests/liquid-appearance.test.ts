import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultPreset } from '../src/data/presets';
import { validateStoreData } from '../src/store/localStore';
import { loadDisplayPrefs } from '../src/store/displayPrefs';

test('liquid mode survives preferences and preset snapshot normalization', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => JSON.stringify({ theme: 'liquid', groupCardAlpha: 0.4 }),
    } });
    assert.equal(loadDisplayPrefs().theme, 'liquid');
    const snapshot = buildDefaultPreset();
    snapshot.appearance.theme = 'liquid';
    const data = validateStoreData({ ...snapshot, version: 1, background: { kind: 'preset', presetId: 'violet' }, myPreset: snapshot });
    assert.equal(data?.myPreset?.appearance.theme, 'liquid');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('retired glass preference still falls back to dark', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => '{"theme":"glass"}' } });
    assert.equal(loadDisplayPrefs().theme, 'dark');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
