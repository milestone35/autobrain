import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSelect } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.exec.sample.json');
const NOW = '2026-06-25T00:00:00Z';

const SHELL = 'builtin::core::bang::shell';     // builtin, install:null
const GREP = 'builtin::core::builtin-tool::Grep'; // builtin, install:null
const SKILL = 'mp::p::skill::s';                // trusted, has install command

async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-select-')); }
async function seedDecision(dir) {
  // Pre-existing council decision (e.g. no_capability_needed) the user is about to override.
  const f = path.join(dir, 'decision.json');
  await writeFile(f, JSON.stringify({
    decision: 'no_capability_needed', capabilities: [], installs: [],
    method: 'orijinal yöntem', rationale: 'konsey', confidence: 0.83
  }), 'utf8');
  return f;
}
async function readDecision(f) { return JSON.parse(await readFile(f, 'utf8')); }

test('runSelect: only builtin choices -> use_existing, no installs, confidence 1', async () => {
  const dir = await tmp();
  const f = await seedDecision(dir);
  const { decision } = await runSelect({ decisionFile: f, chosenIds: [SHELL, GREP], mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.equal(decision.decision, 'use_existing');
  assert.deepEqual(decision.capabilities.sort(), [GREP, SHELL].sort());
  assert.deepEqual(decision.installs, []);
  assert.equal(decision.confidence, 1);
  // persisted to the same file for Steps 7/8
  assert.equal((await readDecision(f)).decision, 'use_existing');
  await rm(dir, { recursive: true, force: true });
});

test('runSelect: a choice that needs installing -> install_then_use with that id in installs', async () => {
  const dir = await tmp();
  const f = await seedDecision(dir);
  const { decision } = await runSelect({ decisionFile: f, chosenIds: [SKILL], mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.equal(decision.decision, 'install_then_use');
  assert.deepEqual(decision.capabilities, [SKILL]);
  assert.deepEqual(decision.installs, [SKILL]);
  await rm(dir, { recursive: true, force: true });
});

test('runSelect: mixed builtin + installable -> install_then_use, only installable in installs', async () => {
  const dir = await tmp();
  const f = await seedDecision(dir);
  const { decision } = await runSelect({ decisionFile: f, chosenIds: [SHELL, SKILL], mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.equal(decision.decision, 'install_then_use');
  assert.deepEqual(decision.capabilities.sort(), [SHELL, SKILL].sort());
  assert.deepEqual(decision.installs, [SKILL]);   // builtin shell excluded from installs
  await rm(dir, { recursive: true, force: true });
});

test('runSelect: empty selection -> no_capability_needed', async () => {
  const dir = await tmp();
  const f = await seedDecision(dir);
  const { decision } = await runSelect({ decisionFile: f, chosenIds: [], mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.equal(decision.decision, 'no_capability_needed');
  assert.deepEqual(decision.capabilities, []);
  assert.deepEqual(decision.installs, []);
  await rm(dir, { recursive: true, force: true });
});

test('runSelect: unknown ids are dropped (hallucination rejection)', async () => {
  const dir = await tmp();
  const f = await seedDecision(dir);
  const { decision } = await runSelect({ decisionFile: f, chosenIds: [SKILL, 'mp::nope::skill::ghost'], mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.deepEqual(decision.capabilities, [SKILL]);
  await rm(dir, { recursive: true, force: true });
});
