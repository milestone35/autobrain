import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleHook } from '../lib/hook.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');
const cfg = (over) => loadConfig({ topN: 5, scoreFloor: 0, staleDays: 14, ...over });

test('handleHook injects additionalContext for a matching prompt', async () => {
  const out = await handleHook({
    stdinText: JSON.stringify({ prompt: 'audit my api security' }),
    config: cfg(), mapFile: FIXT, now: '2026-06-25T00:00:00Z'
  });
  assert.ok(out && typeof out.additionalContext === 'string');
  assert.match(out.additionalContext, /autobrain/);
  assert.match(out.additionalContext, /api-audit/);
  assert.match(out.additionalContext, /claude plugin install api-sec@mp/);
});

test('handleHook returns null when no candidates match', async () => {
  const out = await handleHook({
    stdinText: JSON.stringify({ prompt: 'xyzzy nothing here' }),
    config: cfg(), mapFile: FIXT, now: '2026-06-25T00:00:00Z'
  });
  assert.equal(out, null);
});

test('handleHook returns null when disabled', async () => {
  const out = await handleHook({
    stdinText: JSON.stringify({ prompt: 'audit my api security' }),
    config: cfg({ enabled: false }), mapFile: FIXT, now: '2026-06-25T00:00:00Z'
  });
  assert.equal(out, null);
});

test('handleHook is fail-open on bad stdin (returns null, no throw)', async () => {
  const out = await handleHook({ stdinText: '{ not json', config: cfg(), mapFile: FIXT, now: 'x' });
  assert.equal(out, null);
});

test('handleHook is fail-open when map is missing (returns null)', async () => {
  const out = await handleHook({
    stdinText: JSON.stringify({ prompt: 'audit my api security' }),
    config: cfg(), mapFile: '/no/such/map.json', now: 'x'
  });
  assert.equal(out, null);
});

test('handleHook appends a stale note when the map is old', async () => {
  const out = await handleHook({
    stdinText: JSON.stringify({ prompt: 'audit my api security' }),
    config: cfg(), mapFile: FIXT, now: '2026-08-01T00:00:00Z'
  });
  assert.match(out.additionalContext, /eski|stale|scan/i);
});
