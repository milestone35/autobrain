import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDecision, normalizeDecision } from '../lib/decision.js';

const VALID = {
  decision: 'use_existing', capabilities: ['mp::p::skill::a'], installs: [],
  method: 'use a', rationale: 'fits', confidence: 0.9
};

test('validateDecision returns [] for a valid object', () => {
  assert.deepEqual(validateDecision(VALID), []);
});

test('validateDecision flags bad enum, types, and confidence range', () => {
  const errs = validateDecision({ decision: 'bogus', capabilities: 'x', installs: [1], confidence: 2, rationale: 5 });
  assert.ok(errs.some((e) => e.includes('decision')));
  assert.ok(errs.some((e) => e.includes('capabilities')));
  assert.ok(errs.some((e) => e.includes('installs')));
  assert.ok(errs.some((e) => e.includes('confidence')));
  assert.ok(errs.some((e) => e.includes('rationale')));
});

test('normalizeDecision passes a valid above-threshold decision through', () => {
  const d = normalizeDecision(VALID, { confidenceThreshold: 0.6 });
  assert.equal(d.decision, 'use_existing');
  assert.deepEqual(d.capabilities, ['mp::p::skill::a']);
  assert.equal(d.confidence, 0.9);
});

test('normalizeDecision drops below-threshold confidence to no_capability_needed', () => {
  const d = normalizeDecision({ ...VALID, confidence: 0.4 }, { confidenceThreshold: 0.6 });
  assert.equal(d.decision, 'no_capability_needed');
  assert.deepEqual(d.capabilities, []);
  assert.deepEqual(d.installs, []);
  assert.equal(d.confidence, 0.4);
});

test('normalizeDecision rejects hallucinated ids via knownIds', () => {
  const knownIds = new Set(['mp::p::skill::a']);
  const d = normalizeDecision(
    { decision: 'use_existing', capabilities: ['mp::p::skill::a', 'mp::x::skill::ghost'], installs: [], method: '', rationale: 'r', confidence: 0.9 },
    { confidenceThreshold: 0.6, knownIds }
  );
  assert.deepEqual(d.capabilities, ['mp::p::skill::a']);
});

test('normalizeDecision clears installs for use_existing and no_capability_needed', () => {
  const d = normalizeDecision({ ...VALID, decision: 'use_existing', installs: ['mp::p::skill::a'] }, { confidenceThreshold: 0.6 });
  assert.deepEqual(d.installs, []);
});

test('normalizeDecision downgrades install_then_use with empty installs to no_capability_needed', () => {
  const d = normalizeDecision(
    { decision: 'install_then_use', capabilities: ['mp::p::skill::a'], installs: [], method: '', rationale: 'r', confidence: 0.9 },
    { confidenceThreshold: 0.6 }
  );
  assert.equal(d.decision, 'no_capability_needed');
});

test('normalizeDecision keeps a valid install_then_use', () => {
  const d = normalizeDecision(
    { decision: 'install_then_use', capabilities: ['mp::p::skill::a'], installs: ['mp::p::skill::a'], method: 'install then use', rationale: 'r', confidence: 0.8 },
    { confidenceThreshold: 0.6 }
  );
  assert.equal(d.decision, 'install_then_use');
  assert.deepEqual(d.installs, ['mp::p::skill::a']);
});

test('normalizeDecision downgrades use_existing with no known capabilities', () => {
  const knownIds = new Set(['mp::p::skill::a']);
  const d = normalizeDecision(
    { decision: 'use_existing', capabilities: ['mp::x::skill::ghost'], installs: [], method: '', rationale: 'r', confidence: 0.9 },
    { confidenceThreshold: 0.6, knownIds }
  );
  assert.equal(d.decision, 'no_capability_needed');
});

test('normalizeDecision returns safe fallback for garbage input (no throw)', () => {
  const d = normalizeDecision(null, { confidenceThreshold: 0.6 });
  assert.equal(d.decision, 'no_capability_needed');
  assert.equal(d.confidence, 0);
  assert.deepEqual(d.capabilities, []);
});

test('normalizeDecision downgrades install_then_use whose capabilities all filter out (I1)', () => {
  const knownIds = new Set(['mp::p::skill::a']);
  const d = normalizeDecision(
    { decision: 'install_then_use', capabilities: ['mp::ghost::skill::x'], installs: ['mp::p::skill::a'], method: '', rationale: 'r', confidence: 0.9 },
    { confidenceThreshold: 0.6, knownIds }
  );
  assert.equal(d.decision, 'no_capability_needed');
});

test('normalizeDecision treats confidence exactly at threshold as passing (boundary)', () => {
  const d = normalizeDecision(
    { decision: 'use_existing', capabilities: ['mp::p::skill::a'], installs: [], method: '', rationale: 'r', confidence: 0.6 },
    { confidenceThreshold: 0.6 }
  );
  assert.equal(d.decision, 'use_existing');
});

test('normalizeDecision dedupes repeated ids', () => {
  const d = normalizeDecision(
    { decision: 'use_existing', capabilities: ['mp::p::skill::a', 'mp::p::skill::a'], installs: [], method: '', rationale: 'r', confidence: 0.9 },
    { confidenceThreshold: 0.6 }
  );
  assert.deepEqual(d.capabilities, ['mp::p::skill::a']);
});

test('normalizeDecision passes ids through unchecked when knownIds is null (no map)', () => {
  const d = normalizeDecision(
    { decision: 'use_existing', capabilities: ['mp::anything::skill::x'], installs: [], method: '', rationale: 'r', confidence: 0.9 },
    { confidenceThreshold: 0.6, knownIds: null }
  );
  assert.deepEqual(d.capabilities, ['mp::anything::skill::x']);
});

test('validateDecision flags a non-string method', () => {
  assert.ok(validateDecision({ ...VALID, method: 42 }).some((e) => e.includes('method')));
});
