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

test('loadConfig defaults confidenceThreshold to 0.6', () => {
  assert.equal(loadConfig().confidenceThreshold, 0.6);
  assert.equal(DEFAULTS.confidenceThreshold, 0.6);
});

test('loadConfig accepts valid confidenceThreshold and rejects out-of-range/non-number', () => {
  assert.equal(loadConfig({ confidenceThreshold: 0.8 }).confidenceThreshold, 0.8);
  assert.equal(loadConfig({ confidenceThreshold: 0 }).confidenceThreshold, 0);
  assert.equal(loadConfig({ confidenceThreshold: 1 }).confidenceThreshold, 1);
  assert.equal(loadConfig({ confidenceThreshold: 1.5 }).confidenceThreshold, DEFAULTS.confidenceThreshold);
  assert.equal(loadConfig({ confidenceThreshold: -0.1 }).confidenceThreshold, DEFAULTS.confidenceThreshold);
  assert.equal(loadConfig({ confidenceThreshold: 'high' }).confidenceThreshold, DEFAULTS.confidenceThreshold);
});
