# Multi-Agent Council + `/route` Upgrade (Sub-project 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/route`-triggered autonomous capability council to the `plugin/`: a `capability-router` skill orchestrates Planner + Critic subagents (≤2 rounds) to produce a single validated decision object, backed by deterministic `lib/decision.js` and `cli.js candidates`/`decide` subcommands. The council decides but does not install (SP4).

**Architecture:** Deterministic edges live in tested code: `lib/decision.js` (validate/normalize the decision object, confidence-threshold fallback, hallucinated-id rejection) and two `cli.js` subcommands — `candidates` (machine-readable matcher output, the council's input) and `decide <file>` (validates/normalizes a decision JSON the council wrote). The LLM council is `skills/capability-router/SKILL.md`, verified via documented transcript smoke scenarios (not automated). `/route` triggers the skill. The plugin still knows the indexer only via `capability-map.json`.

**Tech Stack:** Node.js ≥18 (ESM), zero runtime dependencies, `node --test` + `node:assert/strict`. Builds directly on the SP2 plugin (`lib/{config,matcher,map-loader,hook,cli}.js`).

**Scope (this plan):** `confidenceThreshold` config, `lib/decision.js`, `cli.js candidates`/`decide`, `capability-router` SKILL.md, `/route` upgrade, deterministic tests, transcript smoke scenarios.
**Out of scope:** auto-installer + approval flow (SP4 — this slice only *displays* install commands); hook→council auto-trigger (hook stays the SP2 passive hint); publish/web-discovery.

**Key shapes** (every task uses exactly these names):
```js
// lib/decision.js
validateDecision(obj) -> string[]                                  // [] = valid
normalizeDecision(obj, { confidenceThreshold, knownIds }) -> decision
// decision shape: { decision, capabilities:[], installs:[], method, rationale, confidence }
// decision enum: 'use_existing' | 'install_then_use' | 'no_capability_needed'

// lib/cli.js (new)
runCandidates({ prompt, mapFile, config, now }) -> { candidates:[{id,kind,name,trust,install,score}], error? }
runDecide({ decisionFile, mapFile, config, now }) -> { decision, lines:[] }
```

**Environment:** Node is NOT on PATH (conda env). Before node/npm:
`export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`
Tests run from inside `plugin/`: `node --test`. Repo root: `C:\Users\harun.hanbay\Desktop\cc-autopilot` (branch `feat/council-route`).

---

### Task 1: `confidenceThreshold` in config

**Files:**
- Modify: `plugin/config/autopilot.config.json`
- Modify: `plugin/lib/config.js`
- Test: `plugin/test/config.test.js` (append)

- [ ] **Step 1: Append the failing test**

Append to `plugin/test/config.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/config.test.js`
Expected: FAIL — `confidenceThreshold` undefined / not on DEFAULTS.

- [ ] **Step 3: Update `plugin/lib/config.js`**

Add `confidenceThreshold: 0.6` to `DEFAULTS` (after `staleDays: 14`):
```js
export const DEFAULTS = Object.freeze({
  enabled: true,
  mapSource: '../indexer/data/capability-map.json',
  topN: 5,
  scoreFloor: 0,
  staleDays: 14,
  confidenceThreshold: 0.6
});
```

Add a `[0,1]` validator near the other predicates:
```js
const isUnitInterval = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
```

Add the field to the returned object in `loadConfig` (after `staleDays`):
```js
    staleDays: isNonNegInt(r.staleDays) ? r.staleDays : DEFAULTS.staleDays,
    confidenceThreshold: isUnitInterval(r.confidenceThreshold) ? r.confidenceThreshold : DEFAULTS.confidenceThreshold
```

- [ ] **Step 4: Update `plugin/config/autopilot.config.json`**

Add `confidenceThreshold` (final shape):
```json
{
  "enabled": true,
  "mapSource": "../indexer/data/capability-map.json",
  "topN": 5,
  "scoreFloor": 0,
  "staleDays": 14,
  "confidenceThreshold": 0.6
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd plugin && node --test test/config.test.js`
Expected: PASS — all config tests (the original 4 + 2 new) pass.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/config.js plugin/config/autopilot.config.json plugin/test/config.test.js
git commit -m "feat(council): add confidenceThreshold config (default 0.6)"
```

---

### Task 2: `lib/decision.js` — `validateDecision` + `normalizeDecision`

**Files:**
- Create: `plugin/lib/decision.js`
- Test: `plugin/test/decision.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/decision.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/decision.test.js`
Expected: FAIL — cannot find module `../lib/decision.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/decision.js`:
```js
const DECISIONS = new Set(['use_existing', 'install_then_use', 'no_capability_needed']);

export function validateDecision(obj = {}) {
  const errs = [];
  if (!DECISIONS.has(obj?.decision)) errs.push(`decision must be one of ${[...DECISIONS].join('|')}`);
  if (!Array.isArray(obj?.capabilities) || !obj.capabilities.every((x) => typeof x === 'string'))
    errs.push('capabilities must be a string[]');
  if (!Array.isArray(obj?.installs) || !obj.installs.every((x) => typeof x === 'string'))
    errs.push('installs must be a string[]');
  if (typeof obj?.confidence !== 'number' || !Number.isFinite(obj.confidence) || obj.confidence < 0 || obj.confidence > 1)
    errs.push('confidence must be a number in [0,1]');
  if (typeof obj?.rationale !== 'string') errs.push('rationale must be a string');
  return errs;
}

function fallback(reason, confidence) {
  return { decision: 'no_capability_needed', capabilities: [], installs: [], method: '', rationale: reason, confidence };
}

export function normalizeDecision(obj, { confidenceThreshold = 0.6, knownIds = null } = {}) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const confidence = (typeof o.confidence === 'number' && Number.isFinite(o.confidence))
    ? Math.min(1, Math.max(0, o.confidence)) : 0;
  const method = typeof o.method === 'string' ? o.method : '';
  const rationale = typeof o.rationale === 'string' ? o.rationale : '';
  const filterIds = (arr) => {
    const a = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    return knownIds ? a.filter((id) => knownIds.has(id)) : a;
  };
  const capabilities = filterIds(o.capabilities);
  let installs = filterIds(o.installs);
  const decision = DECISIONS.has(o.decision) ? o.decision : 'no_capability_needed';

  if (confidence < confidenceThreshold) return fallback('confidence below threshold', confidence);

  if (decision === 'use_existing' || decision === 'no_capability_needed') installs = [];
  if (decision === 'use_existing' && capabilities.length === 0) return fallback('use_existing with no known capabilities', confidence);
  if (decision === 'install_then_use' && installs.length === 0) return fallback('install_then_use with no installs', confidence);

  return { decision, capabilities, installs, method, rationale, confidence };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd plugin && node --test test/decision.test.js`
Expected: PASS — all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/decision.js plugin/test/decision.test.js
git commit -m "feat(council): decision validate + normalize (threshold + hallucinated-id rejection)"
```

---

### Task 3: `cli.js` — `candidates` subcommand

**Files:**
- Modify: `plugin/lib/cli.js`
- Test: `plugin/test/candidates.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/candidates.test.js`:
```js
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
});

test('runCandidates returns empty + error when map missing (fail-soft)', async () => {
  const res = await runCandidates({
    prompt: 'x', mapFile: '/no/such/map.json',
    config: loadConfig({}), now: '2026-06-25T00:00:00Z'
  });
  assert.deepEqual(res.candidates, []);
  assert.match(res.error, /not found|bulunamad/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/candidates.test.js`
Expected: FAIL — `runCandidates` not exported.

- [ ] **Step 3: Add `runCandidates` to `plugin/lib/cli.js`**

Insert after the `runPreview` function (before `async function main`):
```js
export async function runCandidates({ prompt, mapFile, config, now }) {
  const { map, error } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  if (error || !map) return { candidates: [], error: error || 'harita yok' };
  const promptTokens = tokenize(prompt);
  const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
  return {
    candidates: candidates.map((c) => ({
      id: c.id, kind: c.kind, name: c.name, trust: c.trust,
      install: c.install?.command ?? null, score: scoreCapability(promptTokens, c)
    }))
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd plugin && node --test test/candidates.test.js`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/cli.js plugin/test/candidates.test.js
git commit -m "feat(council): cli candidates (machine-readable matcher output)"
```

---

### Task 4: `cli.js` — `decide` subcommand + `main` dispatch

**Files:**
- Modify: `plugin/lib/cli.js`
- Test: `plugin/test/decide.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/decide.test.js`:
```js
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
  // ghost id filtered -> use_existing with no known caps -> no_capability_needed
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/decide.test.js`
Expected: FAIL — `runDecide` not exported.

- [ ] **Step 3: Add the import and `runDecide` to `plugin/lib/cli.js`**

Add the import at the top (after the existing imports from `./matcher.js`):
```js
import { normalizeDecision } from './decision.js';
```

Insert `runDecide` after `runCandidates`:
```js
export async function runDecide({ decisionFile, mapFile, config, now }) {
  const { map } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  const knownIds = map ? new Set(map.capabilities.map((c) => c.id)) : null;

  let parsed = null;
  let readError = null;
  try {
    parsed = JSON.parse(await readFile(decisionFile, 'utf8'));
  } catch (e) {
    readError = e.message;
  }

  const decision = normalizeDecision(readError ? { confidence: 0 } : parsed,
    { confidenceThreshold: config.confidenceThreshold, knownIds });
  if (readError) decision.rationale = `karar dosyası okunamadı: ${readError}`;

  const lines = [
    `[cc-autopilot] karar: ${decision.decision}  (confidence ${decision.confidence})`,
    decision.capabilities.length ? `  yetenekler: ${decision.capabilities.join(', ')}` : '  yetenekler: -',
    decision.installs.length ? `  kurulacak:  ${decision.installs.join(', ')}` : '  kurulacak:  -',
    decision.method ? `  yöntem: ${decision.method}` : '  yöntem: -',
    `  gerekçe: ${decision.rationale || '-'}`,
    '(Kurulum bu sürümde otomatik DEĞİL — kurulacak yetenek(ler) için install komutu sonraki sürümde uygulanır.)'
  ];
  return { decision, lines };
}
```

- [ ] **Step 4: Update `main` dispatch in `plugin/lib/cli.js`**

Replace the existing `main` function with one that dispatches all three subcommands:
```js
async function main(argv) {
  const cmd = argv[2];
  const config = await loadPluginConfig();
  const mapFile = resolveMapFile(config);
  const now = new Date().toISOString();

  if (cmd === 'preview') {
    const { lines } = await runPreview({ prompt: argv.slice(3).join(' '), mapFile, config, now });
    console.log(lines.join('\n'));
  } else if (cmd === 'candidates') {
    const res = await runCandidates({ prompt: argv.slice(3).join(' '), mapFile, config, now });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'decide') {
    const decisionFile = argv[3];
    if (!decisionFile) {
      console.error('Usage: cli.js decide <decisionFile>');
      process.exitCode = 1;
      return;
    }
    const { decision, lines } = await runDecide({ decisionFile, mapFile, config, now });
    console.log(lines.join('\n'));
    console.log(`\n${JSON.stringify(decision)}`);
  } else {
    console.error('Usage: cli.js <preview|candidates|decide> ...');
    process.exitCode = 1;
  }
}
```

(Leave the `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` guard block unchanged at the bottom.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd plugin && node --test test/decide.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Run the full suite**

Run: `cd plugin && node --test`
Expected: PASS — all files green (smoke, config, matcher, map-loader, hook, preview, hook-entry, decision, candidates, decide).

- [ ] **Step 7: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/cli.js plugin/test/decide.test.js
git commit -m "feat(council): cli decide (validate/normalize decision) + 3-way dispatch"
```

---

### Task 5: `capability-router` SKILL.md (council orchestration)

**Files:**
- Create: `plugin/skills/capability-router/SKILL.md`

> **Note (deviation from spec §7 parenthetical):** the skill is left **model-invocable** (no `disable-model-invocation`) so the `/route` command can trigger it by reference. Spurious auto-invocation is harmless — the council only *decides* and never installs. This is intentional; documented here and surfaced at plan handoff.

This task creates an LLM recipe; there is no automated unit test (its inputs/outputs are exercised by the deterministic CLI in Tasks 3-4 and by the transcript smoke scenarios in Task 7).

- [ ] **Step 1: Create `plugin/skills/capability-router/SKILL.md`**

```markdown
---
name: capability-router
description: Run the cc-autopilot multi-agent capability council to decide which capabilities best serve a request. Invoked by the /route command; gathers matcher candidates, runs a Planner and a Critic subagent (<=2 rounds), and produces one validated decision object. Decides only — never installs.
allowed-tools: Bash(node *), Task, Write, Read
---

# Capability Router — multi-agent decision council

You orchestrate a small council to decide, autonomously, which capabilities (if any) best serve the user's request. You DECIDE; you never install anything. Follow these steps exactly.

## Inputs
- `REQUEST`: the user's request text (the `/route` argument, or the current task).
- `PLUGIN_ROOT`: the plugin directory (`${CLAUDE_PLUGIN_ROOT}` when run as an installed plugin; otherwise the `plugin/` dir of this repo).

## Step 1 — Gather candidates (deterministic)
Run:
```bash
node "$PLUGIN_ROOT/lib/cli.js" candidates "REQUEST"
```
Parse the JSON. If `candidates` is empty (or an `error` is present), STOP and report decision `no_capability_needed` (nothing to route to). Do not run the council.

## Step 2 — Planner subagent (Task tool)
Dispatch ONE subagent (general-purpose). Give it ONLY: the REQUEST and the JSON candidate list. Instruct it to return strict JSON:
`{ "capabilities": ["id"...], "method": "execution plan", "rationale": "why", "confidence": 0.0 }`
Rules for the Planner:
- Choose ONLY from the provided candidate ids. Never invent ids.
- Prefer the smallest, cheapest set that does the job; prefer already-suitable over installing more.
- `confidence` in [0,1] reflects how sure it is a listed capability genuinely helps.

## Step 3 — Critic subagent (Task tool)
Dispatch ONE subagent (general-purpose). Give it: the REQUEST, the candidate JSON, and the Planner's proposal. Instruct it to attack the proposal and return strict JSON:
`{ "verdict": "accept" | "revise" | "reject", "objections": ["..."], "suggested": { "capabilities": [...], "installs": [...] }, "confidence": 0.0 }`
The Critic asks: is a special capability genuinely needed, or does default behavior suffice? Is there a cheaper / already-installed option? Is the trust/risk acceptable? Is the token cost justified?

## Step 4 — Converge (<=2 rounds)
- If the Critic's verdict is `accept`, proceed.
- If `revise`/`reject` AND this is round 1, re-dispatch the Planner once with the Critic's objections, then proceed with the revised proposal (optionally re-run the Critic).
- Never exceed 2 Planner rounds. When in doubt or confidence is low, prefer `no_capability_needed`.

## Step 5 — Synthesize the decision object
Build ONE object (use the lower of Planner/Critic confidence when they disagree):
```json
{ "decision": "use_existing | install_then_use | no_capability_needed",
  "capabilities": ["id"...], "installs": ["id"...],
  "method": "execution plan", "rationale": "concise reasoning", "confidence": 0.0 }
```
- `use_existing`: chosen capabilities are already available; `installs` empty.
- `install_then_use`: list the ids that must be installed in `installs`.
- `no_capability_needed`: default behavior is best; empty lists.
Write this object to a scratch file using the Write tool, e.g. `PLUGIN_ROOT/.decision.tmp.json`.

## Step 6 — Validate (deterministic)
Run:
```bash
node "$PLUGIN_ROOT/lib/cli.js" decide "$PLUGIN_ROOT/.decision.tmp.json"
```
This normalizes the decision: it enforces the confidence threshold (low confidence -> `no_capability_needed`), strips ids not in the map, and clears nonsensical install lists. Treat the CLI's normalized output as the FINAL decision (it overrides your synthesis).

## Step 7 — Present
Report the final decision to the user: the `decision`, chosen `capabilities`, `method`, and `rationale`. If `install_then_use`, show the install command(s) for each id (from the candidate JSON's `install` field) as text — DO NOT run them; autonomous installation arrives in a later version. Clean up the scratch file.

## Failure handling
If any subagent fails or returns unparseable output, fall back to `no_capability_needed` and say so. Never break the user's underlying task — this is an advisory decision.
```

- [ ] **Step 2: Sanity-check the skill file exists and the deterministic commands it references work**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
test -f plugin/skills/capability-router/SKILL.md && echo "SKILL present"
node plugin/lib/cli.js candidates "audit my api security" | head -5
```
Expected: `SKILL present`, then JSON candidates from the real map.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/skills/capability-router/SKILL.md
git commit -m "feat(council): capability-router skill (Planner+Critic, <=2 rounds, decides only)"
```

---

### Task 6: `/route` upgrade + README

**Files:**
- Modify: `plugin/commands/route.md`
- Modify: `plugin/README.md`

- [ ] **Step 1: Replace `plugin/commands/route.md`**

```markdown
---
description: Route a request through the cc-autopilot capability council and report a decision (read-only; installs nothing)
allowed-tools: Bash(node *), Task, Write, Read
---

# /route — capability council

Use the **capability-router** skill to route the following request through the multi-agent council (Planner + Critic) and report a single decision (use_existing / install_then_use / no_capability_needed). The council decides only — it installs nothing.

Request: $ARGUMENTS

After the skill produces its final (validated) decision, present it to me: the decision, the chosen capabilities, the method, and the rationale. If the decision is `install_then_use`, show the install command(s) as text without running them.
```

- [ ] **Step 2: Update the "Usage" and "How it works" sections of `plugin/README.md`**

Replace the `## Usage` section body with:
```markdown
## Usage
```bash
npm test                                          # run the test suite
node lib/cli.js preview "audit my api security"   # read-only matcher preview (human-readable)
node lib/cli.js candidates "audit my api security" # machine-readable candidates (council input)
node lib/cli.js decide path/to/decision.json      # validate/normalize a council decision
```
In Claude Code (plugin installed):
- `/route <request>` — run the multi-agent capability council and get a decision (decides only; installs nothing).
```

Append to the `## How it works` list:
```markdown
- `skills/capability-router/SKILL.md` — the council: gathers candidates, runs Planner + Critic
  subagents (≤2 rounds), synthesizes a decision, and validates it via `lib/cli.js decide`.
- `lib/decision.js` — deterministic decision validation/normalization: confidence-threshold
  fallback to `no_capability_needed`, and rejection of capability ids not present in the map.
```

Append to the `## Config` list:
```markdown
- `confidenceThreshold` — minimum council confidence; below it the decision falls back to
  `no_capability_needed` (default 0.6)
```

- [ ] **Step 3: Verify the full suite still passes (docs-only change, but confirm)**

Run: `cd plugin && node --test`
Expected: PASS — all files green.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/commands/route.md plugin/README.md
git commit -m "feat(council): upgrade /route to trigger the council; README"
```

---

### Task 7: Transcript smoke scenarios + live verification

**Files:**
- Create: `plugin/skills/capability-router/SMOKE.md`

- [ ] **Step 1: Create `plugin/skills/capability-router/SMOKE.md`**

```markdown
# capability-router — manual smoke scenarios

The council is LLM-driven, so it is verified by hand (not `node --test`). Run each scenario in a
Claude Code session with the plugin active, then record the result.

Prereq: a built map at `mapSource` (`cd ../indexer && npm run scan`).

## Scenario A — capability genuinely helps -> use_existing
Command: `/route audit my OpenAPI spec for security vulnerabilities`
Expect: decision `use_existing` (or `install_then_use` if not present), capabilities include an
API-security skill (e.g. an `api-security-testing` skill). Rationale references API security.

## Scenario B — trivial/irrelevant request -> no_capability_needed
Command: `/route rename this local variable from x to count`
Expect: decision `no_capability_needed`. The council declines (default behavior suffices).

## Scenario C — candidates exist but are unnecessary -> Critic rejects -> no_capability_needed
Command: `/route write a one-line shell echo`
Expect: matcher may surface candidates, but the Critic argues none is needed; low confidence ->
normalized to `no_capability_needed`.

## What to record per scenario
- The final decision JSON (printed after the `decide` step).
- Whether it matches the expectation above.
- Any case where the council invented an id (should be impossible — `decide` strips unknown ids).
```

- [ ] **Step 2: Live-verify the deterministic council I/O against the real map**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
echo "=== candidates ===" && node plugin/lib/cli.js candidates "audit my api for security vulnerabilities"
echo "=== decide (valid) ===" && printf '%s' '{"decision":"use_existing","capabilities":["claude-plugins-official::api-security-testing::skill::42crunch-audit"],"installs":[],"method":"run audit","rationale":"fits","confidence":0.9}' > /tmp/dec.json && node plugin/lib/cli.js decide /tmp/dec.json
echo "=== decide (low confidence) ===" && printf '%s' '{"decision":"use_existing","capabilities":["claude-plugins-official::api-security-testing::skill::42crunch-audit"],"installs":[],"method":"x","rationale":"r","confidence":0.3}' > /tmp/dec2.json && node plugin/lib/cli.js decide /tmp/dec2.json
```
Expected:
- `candidates` prints JSON with real ids (api-security / postman skills), each with `score`.
- `decide (valid)` prints `karar: use_existing` keeping the (real, in-map) capability id.
- `decide (low confidence)` prints `karar: no_capability_needed` (threshold 0.6 > 0.3).

(Note: the id used above must exist in the current map; if the live map differs, copy a real id from the `candidates` output. The point is to confirm known-id pass-through vs threshold fallback.)

- [ ] **Step 3: Run the full suite once more**

Run: `cd plugin && node --test`
Expected: PASS — all files green.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/skills/capability-router/SMOKE.md
git commit -m "docs(council): manual transcript smoke scenarios + verified deterministic council I/O"
```

---

## Self-Review

**Spec coverage (design §1–12):**
- §2 architecture (SKILL + genuine subagents + deterministic I/O) → Tasks 2-5. ✓
- §3 folder layout (SKILL.md, decision.js, cli candidates/decide, route.md, config) → Tasks 1-6. ✓
- §4 data flow (candidates → Planner → Critic → ≤2 rounds → synthesize → decide → present) → Task 5 SKILL steps 1-7. ✓
- §5 decision object + decision.js (validate/normalize, threshold, hallucinated-id rejection, installs clearing, install_then_use+empty downgrade) → Task 2. ✓
- §6 cli candidates (JSON) + decide (fail-soft, knownIds) → Tasks 3-4. ✓
- §7 SKILL (Planner/Critic templates, convergence, fallback, calls cli) → Task 5. (Spec §7 said `disable-model-invocation`; Task 5 intentionally omits it so `/route` can trigger by reference — documented deviation.) ✓
- §8 /route upgrade + confidenceThreshold config → Tasks 1, 6. ✓
- §9 error handling (fail-soft CLI, subagent death → no_capability_needed, no candidates → stop, hallucinated-id strip) → Tasks 2, 4, 5. ✓
- §10 testing (decision unit, candidates, decide, config; LLM smoke scenarios) → Tasks 1-4, 7. ✓
- §11 scope (no install, hook unchanged) → respected; install commands only displayed (Task 5 step 7). ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step shows complete code. SKILL.md and SMOKE.md are complete content. ✓

**Type consistency:** `validateDecision(obj)->string[]`, `normalizeDecision(obj,{confidenceThreshold,knownIds})->decision`; decision shape `{decision,capabilities,installs,method,rationale,confidence}` identical in Tasks 2/4/5; `runCandidates`/`runDecide` signatures match between cli.js (Tasks 3-4) and tests; `confidenceThreshold` consistent across config (Task 1), decision (Task 2), decide (Task 4); capability id format `marketplace::plugin::kind::component` matches SP2 fixture + real map. ✓

**One documented deviation:** SKILL.md omits `disable-model-invocation` (spec §7 parenthetical) so `/route` can invoke it; harmless because the council only decides. Surfaced to the user at handoff.
