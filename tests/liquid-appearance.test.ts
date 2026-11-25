import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESET_APPEARANCE,
  DEFAULT_PRESET_CARD_COLS,
  DEFAULT_PRESET_CARD_ORDER,
  DEFAULT_PRESET_COMBOS,
  DEFAULT_PRESET_GROUP_LAYOUTS,
  DEFAULT_PRESET_WIDGET_LAYOUTS,
  DEFAULT_PRESET_WIDGET_STACKS,
  defaultPresetGroups,
  validateStoreData,
  type CompositionSnapshot,
} from '../src/store/localStore';
import { loadDisplayPrefs } from '../src/store/displayPrefs';

/** 造一份与原默认预设同源的快照（2026-11-26 预设大清理后 data/presets.ts 已删，改用 store 自身常量拼） */
function buildSeedSnapshot(): CompositionSnapshot {
  return {
    groups: defaultPresetGroups(),
    widgets: ['task', 'news', 'trending', 'tools', 'time'],
    widgetLayouts: structuredClone(DEFAULT_PRESET_WIDGET_LAYOUTS),
    groupLayouts: structuredClone(DEFAULT_PRESET_GROUP_LAYOUTS),
    cardOrder: [...DEFAULT_PRESET_CARD_ORDER],
    cardCols: { ...DEFAULT_PRESET_CARD_COLS },
    combos: structuredClone(DEFAULT_PRESET_COMBOS),
    widgetStacks: structuredClone(DEFAULT_PRESET_WIDGET_STACKS),
    cardFaceStyles: {},
    widgetTints: {},
    appearance: structuredClone(DEFAULT_PRESET_APPEARANCE),
  };
}

test('liquid mode survives preferences and preset snapshot normalization', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => JSON.stringify({ theme: 'liquid', groupCardAlpha: 0.4 }),
    } });
    assert.equal(loadDisplayPrefs().theme, 'liquid');
    const snapshot = buildSeedSnapshot();
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
