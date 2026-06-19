import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, DEFAULTS } from '../lib/config.js';

test('loadConfig returns defaults for empty/undefined input', () => {
  assert.deepEqual(loadConfig(), DEFAULTS);
  assert.deepEqual(loadConfig({}), DEFAULTS);
});

test('loadConfig merges valid overrides', () => {
  const c = loadConfig({ topN: 3, enabled: false });
  assert.equal(c.topN, 3);
  assert.equal(c.enabled, false);
  assert.equal(c.mapSource, DEFAULTS.mapSource);
});

test('loadConfig ignores wrong-typed fields (falls back per-field)', () => {
  const c = loadConfig({ topN: 'lots', enabled: 'yes', staleDays: -4, mapSource: 123 });
  assert.equal(c.topN, DEFAULTS.topN);        // non-int -> default
  assert.equal(c.enabled, DEFAULTS.enabled);  // non-bool -> default
  assert.equal(c.staleDays, DEFAULTS.staleDays); // negative -> default
  assert.equal(c.mapSource, DEFAULTS.mapSource); // non-string -> default
});

test('loadConfig accepts scoreFloor 0 and positive topN', () => {
  const c = loadConfig({ scoreFloor: 0, topN: 1 });
  assert.equal(c.scoreFloor, 0);
  assert.equal(c.topN, 1);
});
