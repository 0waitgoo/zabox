import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultPreset } from '../src/data/presets';
import { validateStoreData, resolveCardOrder } from '../src/store/localStore';
import { placeInLanes } from '../src/components/v2/laneLayout';

test('default preset places news under office, beside trending and tools', () => {
  const preset = buildDefaultPreset();
  const specs = [
    ['group:ai-chat', 2, 2], ['widget:task', 2, 2],
    ['combo:c-mvm8celnynhjv', 1, 1], ['group:writing', 1, 1],
    ['group:audio', 1, 1], ['group:office', 1, 1], ['widget:news', 1, 2],
    ['widget:trending', 2, 1], ['widget:tools', 2, 1], ['group:code', 1, 2],
    ['group:ent-video', 2, 2], ['group:ent-game', 1, 2],
  ] as const;
  const byKey = new Map<string, { span: 1 | 2; height: number }>(specs.map(([key, span, height]) => [key, { span, height }]));
  const placed = placeInLanes(preset.cardOrder.map(key => ({ key, ...byKey.get(key)!, anchor: preset.cardCols[key] })), 4);
  assert.deepEqual(placed.pos.get('widget:news'), { col: 2, row: 3 });
  assert.deepEqual(placed.pos.get('widget:trending'), { col: 0, row: 3 });
  assert.deepEqual(preset.widgetStacks, []);
});

test('old default data is repaired while custom order stays untouched', () => {
  const preset = buildDefaultPreset();
  const legacy = 'wstack:ws-mvm8czz1m8o8n';
  const oldOrder = preset.cardOrder.filter(key => key !== 'widget:news');
  oldOrder.splice(2, 0, legacy);
  const data = { ...preset, version: 1, background: { kind: 'preset', presetId: 'violet' }, cardOrder: oldOrder, activePreset: 'default' };
  const repaired = validateStoreData(data)!;
  assert.equal(repaired.cardOrder[repaired.cardOrder.indexOf('group:office') + 1], 'widget:news');
  assert.equal(repaired.cardCols['widget:news'], 2);
  assert.equal(resolveCardOrder(repaired.cardOrder, preset.cardOrder).indexOf('widget:news'), repaired.cardOrder.indexOf('widget:news'));
  const custom = validateStoreData({ ...data, activePreset: 'my' })!;
  assert.deepEqual(custom.cardOrder, oldOrder);
});
