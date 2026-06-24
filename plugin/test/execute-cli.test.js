import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runExecute } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.exec.sample.json');
const NOW = '2026-06-25T00:00:00Z';

async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-exec-')); }
async function writeDecision(dir, obj) {
  const f = path.join(dir, 'decision.json');
  await writeFile(f, JSON.stringify(obj), 'utf8');
  return f;
}
const allThree = {
  decision: 'use_existing',
  capabilities: ['builtin::core::bang::shell', 'builtin::core::builtin-tool::Grep', 'mp::p::skill::s'],
  installs: [], method: 'x', rationale: 'r', confidence: 0.9
};

test('runExecute: read-only ready, side-effecting needs-approval (no --approved)', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, allThree);
  const { steps } = await runExecute({ decisionFile: f, mapFile: FIXT, config: loadConfig({}), now: NOW });
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(byId['builtin::core::builtin-tool::Grep'].status, 'ready');        // read-only
  assert.equal(byId['builtin::core::bang::shell'].status, 'needs-approval');      // side-effecting
  assert.equal(byId['mp::p::skill::s'].status, 'needs-approval');                 // side-effecting
  await rm(dir, { recursive: true, force: true });
});

test('runExecute: --approved flips a side-effecting step to ready', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, allThree);
  const approvedIds = new Set(['builtin::core::bang::shell']);
  const { steps } = await runExecute({ decisionFile: f, mapFile: FIXT, config: loadConfig({}), approvedIds, now: NOW });
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(byId['builtin::core::bang::shell'].status, 'ready');               // approved
  assert.equal(byId['mp::p::skill::s'].status, 'needs-approval');                 // not approved
  await rm(dir, { recursive: true, force: true });
});

test('runExecute fails soft on a missing decision file', async () => {
  const { steps, lines } = await runExecute({ decisionFile: '/no/such.json', mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.deepEqual(steps, []);
  assert.match(lines.join('\n'), /okunamad|plan yok/i);
});

test('runExecute returns empty for a below-threshold decision (gate not bypassed)', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, { ...allThree, confidence: 0.3 });
  const { steps } = await runExecute({ decisionFile: f, mapFile: FIXT, config: loadConfig({ confidenceThreshold: 0.6 }), now: NOW });
  assert.deepEqual(steps, []);
  await rm(dir, { recursive: true, force: true });
});
