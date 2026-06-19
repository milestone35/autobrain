import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDecide } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');
async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-decide-')); }

async function writeDecision(dir, obj) {
  const f = path.join(dir, 'decision.json');
  await writeFile(f, JSON.stringify(obj), 'utf8');
  return f;
}

test('runDecide normalizes a valid above-threshold decision and lists it', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, {
    decision: 'use_existing', capabilities: ['mp::api-sec::skill::api-audit'], installs: [],
    method: 'use api-audit', rationale: 'best fit', confidence: 0.9
  });
  const res = await runDecide({ decisionFile: f, mapFile: FIXT, config: loadConfig({ confidenceThreshold: 0.6 }), now: '2026-06-25T00:00:00Z' });
  assert.equal(res.decision.decision, 'use_existing');
  assert.deepEqual(res.decision.capabilities, ['mp::api-sec::skill::api-audit']);
  assert.match(res.lines.join('\n'), /use_existing/);
  await rm(dir, { recursive: true, force: true });
});

test('runDecide rejects hallucinated ids using the real map knownIds', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, {
    decision: 'use_existing', capabilities: ['mp::ghost::skill::nope'], installs: [],
    method: 'x', rationale: 'r', confidence: 0.9
  });
  const res = await runDecide({ decisionFile: f, mapFile: FIXT, config: loadConfig({}), now: '2026-06-25T00:00:00Z' });
  assert.equal(res.decision.decision, 'no_capability_needed');
  await rm(dir, { recursive: true, force: true });
});

test('runDecide fails soft to no_capability_needed on missing/corrupt file', async () => {
  const res = await runDecide({ decisionFile: '/no/such/decision.json', mapFile: FIXT, config: loadConfig({}), now: '2026-06-25T00:00:00Z' });
  assert.equal(res.decision.decision, 'no_capability_needed');
  assert.match(res.lines.join('\n'), /no_capability_needed/);
});

test('runDecide applies the confidence threshold from config', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, {
    decision: 'use_existing', capabilities: ['mp::api-sec::skill::api-audit'], installs: [],
    method: 'x', rationale: 'r', confidence: 0.5
  });
  const res = await runDecide({ decisionFile: f, mapFile: FIXT, config: loadConfig({ confidenceThreshold: 0.6 }), now: '2026-06-25T00:00:00Z' });
  assert.equal(res.decision.decision, 'no_capability_needed');
  await rm(dir, { recursive: true, force: true });
});
