import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreview } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');

test('runPreview returns ranked candidates with scores (deterministic)', async () => {
  const res = await runPreview({
    prompt: 'audit my api security',
    mapFile: FIXT,
    config: loadConfig({ topN: 5, scoreFloor: 0 }),
    now: '2026-06-25T00:00:00Z'
  });
  assert.deepEqual(res.candidates.map((c) => c.id),
    ['mp::api-sec::skill::api-audit', 'mp::api-sec::skill::api-fuzz']);
  assert.ok(res.lines.join('\n').includes('api-audit'));
  assert.ok(res.lines.join('\n').includes('score'));
});

test('runPreview reports map errors instead of throwing', async () => {
  const res = await runPreview({
    prompt: 'x', mapFile: '/no/such/map.json',
    config: loadConfig({}), now: '2026-06-25T00:00:00Z'
  });
  assert.equal(res.candidates.length, 0);
  assert.match(res.lines.join('\n'), /not found|bulunamad/i);
});
