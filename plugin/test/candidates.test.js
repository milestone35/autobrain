import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCandidates } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');

test('runCandidates returns structured machine-readable candidates', async () => {
  const res = await runCandidates({
    prompt: 'audit my api security', mapFile: FIXT,
    config: loadConfig({ topN: 5, scoreFloor: 0 }), now: '2026-06-25T00:00:00Z'
  });
  assert.equal(res.error, undefined);
  assert.deepEqual(res.candidates.map((c) => c.id),
    ['mp::api-sec::skill::api-audit', 'mp::api-sec::skill::api-fuzz']);
  const top = res.candidates[0];
  assert.equal(top.kind, 'skill');
  assert.equal(top.name, 'api-audit');
  assert.equal(top.trust, 'trusted');
  assert.equal(top.install, 'claude plugin install api-sec@mp');
  assert.equal(typeof top.score, 'number');
  // mapTotal = tam harita boyutu (aday sayısı DEĞİL): fixture 3 cap, eşleşen 2
  assert.equal(res.mapTotal, 3);
  assert.equal(res.candidates.length, 2);
});

test('runCandidates returns empty + error when map missing (fail-soft)', async () => {
  const res = await runCandidates({
    prompt: 'x', mapFile: '/no/such/map.json',
    config: loadConfig({}), now: '2026-06-25T00:00:00Z'
  });
  assert.deepEqual(res.candidates, []);
  assert.match(res.error, /not found|bulunamad/i);
  assert.equal(res.mapTotal, 0);
});
