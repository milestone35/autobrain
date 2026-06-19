# Trusted-List Auto-Installer (Sub-project 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the SP3 council decides `install_then_use`, actually install the chosen capabilities under the design §7 autonomy boundary — trusted → silent auto-install + verify; candidate/unknown → single approval — via a deterministic `lib/installer.js` and a `cli.js install` subcommand wired into the council skill.

**Architecture:** `lib/installer.js` has a pure `planInstalls` (decision + map → install items with trust-derived mode) and a dependency-injected `executeInstalls` (the `run`/`isInstalled`/`verify`/`approve` functions are injected, so the entire autonomy-boundary logic is unit-tested with fakes — no real installs in tests). `cli.js install <decisionFile> [--approved ids]` binds the real implementations and enforces that untrusted capabilities are never installed without `--approved`. The council skill's Step 7 invokes it.

**Tech Stack:** Node.js ≥18 (ESM), zero runtime dependencies, `node --test` + `node:assert/strict`. Builds on SP1-3 (`lib/{config,matcher,map-loader,hook,cli,decision}.js`).

**Scope (this plan):** `autoInstall` config, `lib/installer.js` (`planInstalls` + `executeInstalls`), `cli.js install`, council skill Step 7 integration, DI tests, smoke scenarios.
**Out of scope:** web-discovery sources (would make candidate/unknown live), `trusted-sources.json` promotion UI, publish (Faz 2). Today all map capabilities are `trusted`, so the live path is trusted=silent; the approval path is built + tested via fakes but dormant.

**Refinement vs spec §5:** the spec listed injected deps `{ run, isInstalled, approve }`. This plan splits the post-install check into a separate `verify` dep (`{ run, isInstalled, verify, approve }`). Rationale: §8 wants both "don't trust without verifying" AND a graceful fallback when the presence-check mechanism is unavailable. A single predicate can't return the two opposite defaults needed for the pre-check (false when unknown → attempt) vs the post-check (true when unknown → trust exit code). Two predicates do.

**Key shapes** (every task uses exactly these names):
```js
// lib/installer.js
planInstalls(decision, map, { autoInstall }) -> [{ id, command, trust, mode }]
//   mode: 'auto' | 'skip' | 'approval'
executeInstalls(plan, { run, isInstalled, verify, approve, log }) -> [{ id, status, command?, error? }]
//   status: 'installed' | 'failed' | 'needs-approval' | 'skipped' | 'already-installed'
//   run(command)->Promise (throws on failure); isInstalled(item)->Promise<bool> (pre-check);
//   verify(item)->Promise<bool> (post-run); approve(item)->Promise<bool>
// lib/cli.js
runInstall({ decisionFile, mapFile, config, approvedIds, now, env? }) -> { results, lines }
```

**Environment:** Node is NOT on PATH (conda env). Before node/npm:
`export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`
Tests run from inside `plugin/`: `node --test`. Repo root: `C:\Users\harun.hanbay\Desktop\cc-autopilot` (branch `feat/installer`).

---

### Task 1: `autoInstall` config

**Files:**
- Modify: `plugin/lib/config.js`
- Modify: `plugin/config/autopilot.config.json`
- Test: `plugin/test/config.test.js` (append)

- [ ] **Step 1: Append the failing test**

Append to `plugin/test/config.test.js`:
```js
test('loadConfig defaults autoInstall to true', () => {
  assert.equal(loadConfig().autoInstall, true);
  assert.equal(DEFAULTS.autoInstall, true);
});

test('loadConfig accepts a boolean autoInstall and rejects non-boolean', () => {
  assert.equal(loadConfig({ autoInstall: false }).autoInstall, false);
  assert.equal(loadConfig({ autoInstall: 'yes' }).autoInstall, DEFAULTS.autoInstall);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/config.test.js`
Expected: FAIL — `autoInstall` undefined.

- [ ] **Step 3: Edit `plugin/lib/config.js`**

Add `autoInstall: true` as the last field of `DEFAULTS` (after `confidenceThreshold: 0.6`). Add the field to `loadConfig`'s returned object (after the `confidenceThreshold:` line, add a comma to it), reusing the existing `isBool` predicate:
```js
    confidenceThreshold: isUnitInterval(r.confidenceThreshold) ? r.confidenceThreshold : DEFAULTS.confidenceThreshold,
    autoInstall: isBool(r.autoInstall) ? r.autoInstall : DEFAULTS.autoInstall
```

- [ ] **Step 4: Edit `plugin/config/autopilot.config.json`** (final content):
```json
{
  "enabled": true,
  "mapSource": "../indexer/data/capability-map.json",
  "topN": 5,
  "scoreFloor": 0,
  "staleDays": 14,
  "confidenceThreshold": 0.6,
  "autoInstall": true
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd plugin && node --test test/config.test.js`
Expected: PASS — all config tests (prior + 2 new).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/config.js plugin/config/autopilot.config.json plugin/test/config.test.js
git commit -m "feat(installer): add autoInstall config (default true)"
```

---

### Task 2: `lib/installer.js` — `planInstalls`

**Files:**
- Create: `plugin/lib/installer.js`
- Test: `plugin/test/installer.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/installer.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInstalls } from '../lib/installer.js';

function mapWith(caps) {
  return { schemaVersion: 1, capabilities: caps };
}
function cap(id, trust, command = `claude plugin install ${id}`) {
  return { id, trust, install: command ? { method: 'plugin', command, package: null } : null };
}

test('planInstalls marks trusted as auto when autoInstall is on', () => {
  const map = mapWith([cap('mp::p::skill::a', 'trusted')]);
  const plan = planInstalls({ installs: ['mp::p::skill::a'] }, map, { autoInstall: true });
  assert.deepEqual(plan, [{ id: 'mp::p::skill::a', command: 'claude plugin install mp::p::skill::a', trust: 'trusted', mode: 'auto' }]);
});

test('planInstalls marks trusted as skip when autoInstall is off', () => {
  const map = mapWith([cap('mp::p::skill::a', 'trusted')]);
  const plan = planInstalls({ installs: ['mp::p::skill::a'] }, map, { autoInstall: false });
  assert.equal(plan[0].mode, 'skip');
});

test('planInstalls marks candidate and unknown as approval', () => {
  const map = mapWith([cap('mp::c::skill::b', 'candidate'), cap('mp::u::skill::c', 'unknown')]);
  const plan = planInstalls({ installs: ['mp::c::skill::b', 'mp::u::skill::c'] }, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.mode), ['approval', 'approval']);
});

test('planInstalls skips ids absent from the map and items without a command', () => {
  const map = mapWith([cap('mp::p::skill::a', 'trusted'), cap('mp::p::skill::nocmd', 'trusted', '')]);
  const plan = planInstalls({ installs: ['mp::ghost::skill::x', 'mp::p::skill::a', 'mp::p::skill::nocmd'] }, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.id), ['mp::p::skill::a']);
});

test('planInstalls returns [] for empty/missing installs', () => {
  assert.deepEqual(planInstalls({ installs: [] }, mapWith([]), { autoInstall: true }), []);
  assert.deepEqual(planInstalls({}, mapWith([]), { autoInstall: true }), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/installer.test.js`
Expected: FAIL — cannot find module `../lib/installer.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/installer.js`:
```js
export function planInstalls(decision, map, { autoInstall = true } = {}) {
  const ids = Array.isArray(decision?.installs) ? decision.installs : [];
  const byId = new Map((map?.capabilities || []).map((c) => [c.id, c]));
  const plan = [];
  for (const id of ids) {
    const cap = byId.get(id);
    if (!cap) continue;                       // not in map -> skip (defense; SP3 already strips)
    const command = cap.install?.command ?? null;
    if (!command) continue;                   // nothing runnable
    const mode = cap.trust === 'trusted'
      ? (autoInstall ? 'auto' : 'skip')
      : 'approval';                           // candidate | unknown
    plan.push({ id, command, trust: cap.trust, mode });
  }
  return plan;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd plugin && node --test test/installer.test.js`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/installer.js plugin/test/installer.test.js
git commit -m "feat(installer): planInstalls (trust-derived install mode)"
```

---

### Task 3: `lib/installer.js` — `executeInstalls` (dependency-injected)

**Files:**
- Modify: `plugin/lib/installer.js`
- Test: `plugin/test/installer.test.js` (append)

- [ ] **Step 1: Append the failing test**

Append to `plugin/test/installer.test.js`:
```js
import { executeInstalls } from '../lib/installer.js';

// Stateful fake: run() marks a command installed; isInstalled/verify read that state.
function fakeEnv({ approveAll = false, verifyAfterRun = true, preInstalled = [] } = {}) {
  const installed = new Set(preInstalled);            // by command
  const calls = { run: [], approve: [] };
  return {
    calls,
    env: {
      run: async (command) => { calls.run.push(command); if (verifyAfterRun) installed.add(command); },
      isInstalled: async (item) => installed.has(item.command),
      verify: async (item) => installed.has(item.command),
      approve: async (item) => { calls.approve.push(item.id); return approveAll; },
      log: () => {}
    }
  };
}
const item = (id, mode) => ({ id, command: `cmd:${id}`, trust: mode === 'approval' ? 'candidate' : 'trusted', mode });

test('executeInstalls runs an auto item and verifies it installed', async () => {
  const { env, calls } = fakeEnv();
  const res = await executeInstalls([item('a', 'auto')], env);
  assert.deepEqual(res, [{ id: 'a', status: 'installed' }]);
  assert.deepEqual(calls.run, ['cmd:a']);
});

test('executeInstalls reports failed when post-run verify is false', async () => {
  const { env, calls } = fakeEnv({ verifyAfterRun: false });
  const res = await executeInstalls([item('a', 'auto')], env);
  assert.equal(res[0].status, 'failed');
  assert.deepEqual(calls.run, ['cmd:a']);          // it tried
});

test('executeInstalls does NOT run an approval item without approval', async () => {
  const { env, calls } = fakeEnv({ approveAll: false });
  const res = await executeInstalls([item('b', 'approval')], env);
  assert.equal(res[0].status, 'needs-approval');
  assert.deepEqual(calls.run, []);                 // never ran
  assert.deepEqual(calls.approve, ['b']);
});

test('executeInstalls runs an approval item once approved', async () => {
  const { env, calls } = fakeEnv({ approveAll: true });
  const res = await executeInstalls([item('b', 'approval')], env);
  assert.equal(res[0].status, 'installed');
  assert.deepEqual(calls.run, ['cmd:b']);
});

test('executeInstalls skips an already-installed item without running', async () => {
  const { env, calls } = fakeEnv({ preInstalled: ['cmd:a'] });
  const res = await executeInstalls([item('a', 'auto')], env);
  assert.equal(res[0].status, 'already-installed');
  assert.deepEqual(calls.run, []);
});

test('executeInstalls reports skip-mode items without running', async () => {
  const { env, calls } = fakeEnv();
  const res = await executeInstalls([item('a', 'skip')], env);
  assert.equal(res[0].status, 'skipped');
  assert.equal(res[0].command, 'cmd:a');
  assert.deepEqual(calls.run, []);
});

test('executeInstalls catches a throwing run and continues to the next item', async () => {
  const installed = new Set();
  const runCalls = [];
  const env = {
    run: async (command) => { runCalls.push(command); if (command === 'cmd:a') throw new Error('boom'); installed.add(command); },
    isInstalled: async () => false,
    verify: async (it) => installed.has(it.command),
    approve: async () => true,
    log: () => {}
  };
  const res = await executeInstalls([item('a', 'auto'), item('c', 'auto')], env);
  assert.equal(res[0].status, 'failed');
  assert.match(res[0].error, /boom/);
  assert.equal(res[1].status, 'installed');        // continued
  assert.deepEqual(runCalls, ['cmd:a', 'cmd:c']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/installer.test.js`
Expected: FAIL — `executeInstalls` not exported.

- [ ] **Step 3: Append the implementation**

Append to `plugin/lib/installer.js`:
```js
export async function executeInstalls(plan, { run, isInstalled, verify, approve, log = () => {} } = {}) {
  const results = [];
  for (const item of plan) {
    try {
      if (await isInstalled(item)) {
        results.push({ id: item.id, status: 'already-installed' });
        continue;
      }
      if (item.mode === 'skip') {
        results.push({ id: item.id, status: 'skipped', command: item.command });
        continue;
      }
      if (item.mode === 'approval' && !(await approve(item))) {
        results.push({ id: item.id, status: 'needs-approval', command: item.command });
        continue;
      }
      await run(item.command);                       // 'auto' or approved 'approval'
      const ok = await verify(item);
      results.push(ok
        ? { id: item.id, status: 'installed' }
        : { id: item.id, status: 'failed', error: 'doğrulama başarısız (kurulum sonrası görünmüyor)' });
    } catch (e) {
      log(`install ${item.id} failed: ${e.message}`);
      results.push({ id: item.id, status: 'failed', error: e.message });
    }
  }
  return results;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd plugin && node --test test/installer.test.js`
Expected: PASS — all 12 tests pass (5 planInstalls + 7 executeInstalls).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/installer.js plugin/test/installer.test.js
git commit -m "feat(installer): executeInstalls (DI run/isInstalled/verify/approve, fail-soft)"
```

---

### Task 4: `cli.js` — `install` subcommand + dispatch

**Files:**
- Modify: `plugin/lib/cli.js`
- Test: `plugin/test/install-cli.test.js`

- [ ] **Step 1: Write the failing test** (injects a fake `env`, so no real installs run)

Create `plugin/test/install-cli.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');
async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-install-')); }
async function writeDecision(dir, obj) {
  const f = path.join(dir, 'decision.json');
  await writeFile(f, JSON.stringify(obj), 'utf8');
  return f;
}
function fakeEnv() {
  const installed = new Set();
  const calls = { run: [] };
  return {
    calls,
    env: {
      run: async (c) => { calls.run.push(c); installed.add(c); },
      isInstalled: async () => false,
      verify: async () => true,
      approve: async () => false,   // overridden by approvedIds path in runInstall
      log: () => {}
    }
  };
}

test('runInstall installs a trusted capability (auto) via injected env', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, { decision: 'install_then_use', installs: ['mp::api-sec::skill::api-audit'] });
  const { env, calls } = fakeEnv();
  const res = await runInstall({ decisionFile: f, mapFile: FIXT, config: loadConfig({ autoInstall: true }), now: '2026-06-25T00:00:00Z', env });
  assert.equal(res.results[0].status, 'installed');
  assert.equal(calls.run.length, 1);
  assert.match(res.lines.join('\n'), /installed|kuruldu/i);
  await rm(dir, { recursive: true, force: true });
});

test('runInstall reports skip (no run) when autoInstall is off', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, { decision: 'install_then_use', installs: ['mp::api-sec::skill::api-audit'] });
  const { env, calls } = fakeEnv();
  const res = await runInstall({ decisionFile: f, mapFile: FIXT, config: loadConfig({ autoInstall: false }), now: '2026-06-25T00:00:00Z', env });
  assert.equal(res.results[0].status, 'skipped');
  assert.deepEqual(calls.run, []);
  await rm(dir, { recursive: true, force: true });
});

test('runInstall fails soft when the decision file is missing', async () => {
  const { env } = fakeEnv();
  const res = await runInstall({ decisionFile: '/no/such/decision.json', mapFile: FIXT, config: loadConfig({}), now: '2026-06-25T00:00:00Z', env });
  assert.deepEqual(res.results, []);
  assert.match(res.lines.join('\n'), /okunamad|kurulmad/i);
});
```

(The fixture map's `mp::api-sec::skill::api-audit` is `trusted`, so with `autoInstall:true` it is an `auto` item, and with `autoInstall:false` it is a `skip` item — matching the two tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugin && node --test test/install-cli.test.js`
Expected: FAIL — `runInstall` not exported.

- [ ] **Step 3: Edit `plugin/lib/cli.js`**

(a) Add imports after `import { normalizeDecision } from './decision.js';`:
```js
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { planInstalls, executeInstalls } from './installer.js';

const pexec = promisify(exec);
```

(b) Add these real-binding helpers and `runInstall` after `runDecide` (and before `async function main`):
```js
// plugin name is the 2nd segment of an id: marketplace::PLUGIN::kind::component
function pluginName(id) { return String(id).split('::')[1] || id; }

async function probePluginList() {
  try {
    const { stdout } = await pexec('claude plugin list');
    return { ok: true, text: stdout };
  } catch {
    return { ok: false, text: '' };
  }
}

// Real injected deps for actual installs. isInstalled is false when the probe is
// unavailable (so we attempt); verify trusts the exit code when the probe is
// unavailable (so a successful install is not falsely reported as failed).
function realEnv(approvedIds, log) {
  return {
    run: async (command) => { await pexec(command); },
    isInstalled: async (item) => {
      const p = await probePluginList();
      return p.ok && p.text.includes(pluginName(item.id));
    },
    verify: async (item) => {
      const p = await probePluginList();
      if (!p.ok) { log('uyarı: kurulum doğrulanamadı (claude plugin list yok) — exit-code güveniliyor'); return true; }
      return p.text.includes(pluginName(item.id));
    },
    approve: async (item) => approvedIds.has(item.id),
    log
  };
}

function formatInstallResult(r) {
  const tail = r.error ? ` — ${r.error}` : r.command ? ` — ${r.command}` : '';
  return `  ${r.status}: ${r.id}${tail}`;
}

export async function runInstall({ decisionFile, mapFile, config, approvedIds = new Set(), now, env }) {
  const { map } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  let decision = null;
  try { decision = JSON.parse(await readFile(decisionFile, 'utf8')); } catch { decision = null; }
  if (!decision || !map) {
    return { results: [], lines: ['[cc-autopilot] kurulum: karar/harita okunamadı, hiçbir şey kurulmadı'] };
  }
  const plan = planInstalls(decision, map, { autoInstall: config.autoInstall });
  const deps = env || realEnv(approvedIds, (m) => console.error(m));
  const results = await executeInstalls(plan, deps);
  const lines = ['[cc-autopilot] kurulum sonuçları:', ...results.map(formatInstallResult)];
  if (results.some((r) => r.status === 'needs-approval')) {
    lines.push("(Onay bekleyenler için: tekrar '--approved <id>' ile çağırın.)");
  }
  if (results.some((r) => r.status === 'failed')) {
    lines.push('(Başarısızlar atlandı — o yetenek olmadan devam edebilir veya komutu elle çalıştırabilirsiniz.)');
  }
  return { results, lines };
}
```

(c) Add an `install` branch to `main`'s dispatch, before the final `else`:
```js
  } else if (cmd === 'install') {
    const decisionFile = argv[3];
    if (!decisionFile || decisionFile.startsWith('--')) {
      console.error('Usage: cli.js install <decisionFile> [--approved id1,id2]');
      process.exitCode = 1;
      return;
    }
    const ai = argv.indexOf('--approved');
    const approvedIds = ai !== -1 && argv[ai + 1] ? new Set(argv[ai + 1].split(',')) : new Set();
    const { lines } = await runInstall({ decisionFile, mapFile, config, approvedIds, now });
    console.log(lines.join('\n'));
```

Also update the usage string in the final `else` to include `install`:
```js
    console.error('Usage: cli.js <preview|candidates|decide|install> ...');
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd plugin && node --test test/install-cli.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `cd plugin && node --test`
Expected: PASS — all files green (incl. installer + install-cli).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/cli.js plugin/test/install-cli.test.js
git commit -m "feat(installer): cli install (real run/verify bindings, --approved gate) + dispatch"
```

---

### Task 5: Council skill Step 7 integration + SMOKE update

**Files:**
- Modify: `plugin/skills/capability-router/SKILL.md`
- Modify: `plugin/skills/capability-router/SMOKE.md`

- [ ] **Step 1: Replace Step 7 of `plugin/skills/capability-router/SKILL.md`**

Find the current `## Step 7 — Present` section and REPLACE it entirely with:
```markdown
## Step 7 — Present and (if needed) install
Report the final decision: the `decision`, chosen `capabilities`, `method`, and `rationale`.

If the decision is `install_then_use`, run the installer over the same decision file:
```bash
node "$PLUGIN_ROOT/lib/cli.js" install "$PLUGIN_ROOT/.decision.tmp.json"
```
Read its results:
- `installed` / `already-installed` / `skipped` — report them as-is.
- `needs-approval` — these are candidate/unknown (untrusted) capabilities. Ask the user ONCE
  whether to install them (show the id + install command). If they agree, re-run with the approved ids:
  ```bash
  node "$PLUGIN_ROOT/lib/cli.js" install "$PLUGIN_ROOT/.decision.tmp.json" --approved <comma,separated,ids>
  ```
  If they decline, report that those capabilities were skipped.
- `failed` — report which failed; continue without them and offer the manual install command.

Trusted capabilities install silently (no prompt) when `autoInstall` is on (the default). Never
prompt for trusted installs. After installs complete, hand the task off to the chosen capability.
Finally, clean up the scratch file.
```

- [ ] **Step 2: Append install scenarios to `plugin/skills/capability-router/SMOKE.md`**

Append:
```markdown

## Scenario D — trusted install_then_use -> silent auto-install
Precondition: the chosen capability is NOT yet installed, `autoInstall: true` (default).
Command: `/route <request needing an uninstalled trusted plugin>`
Expect: decision `install_then_use`; the installer runs `claude plugin install ...` with no prompt;
result `installed` (or `failed` with a manual command if the environment blocks it). No approval asked.

## Scenario E — autoInstall off -> command shown, nothing installed
Precondition: set `autoInstall: false` in `config/autopilot.config.json`.
Command: `/route <request needing an uninstalled trusted plugin>`
Expect: result `skipped` with the install command printed; nothing is installed. (Restore
`autoInstall: true` afterward.)

## What to record (installs)
- The `install` results block (status per id).
- For trusted: confirm NO approval prompt appeared.
- For any `needs-approval` (only once untrusted/web-discovered capabilities exist): confirm a single
  approval was requested and nothing installed without it.
```

- [ ] **Step 3: Confirm the full suite still passes (docs-only, but verify)**

Run: `cd plugin && node --test`
Expected: PASS — all green.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/skills/capability-router/SKILL.md plugin/skills/capability-router/SMOKE.md
git commit -m "feat(installer): wire installer into council Step 7 + install smoke scenarios"
```

---

### Task 6: README + live verification

**Files:**
- Modify: `plugin/README.md`

- [ ] **Step 1: Update `plugin/README.md`**

Add `install` to the Usage code block (after the `decide` line):
```markdown
node lib/cli.js install path/to/decision.json     # install a council decision (trusted=silent; --approved for untrusted)
```

Append to the `## How it works` list:
```markdown
- `lib/installer.js` — `planInstalls` (trust → install mode) + `executeInstalls` (dependency-injected
  run/verify/approve). Trusted installs run silently; candidate/unknown require `--approved`.
```

Append to the `## Config` list:
```markdown
- `autoInstall` — when true (default), trusted capabilities install silently; when false, the
  install command is shown but not run
```

- [ ] **Step 2: Live-verify the deterministic install paths (no real install)**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
# autoInstall off -> a real-map trusted id should be reported 'skipped', nothing installed:
printf '%s' '{"decision":"install_then_use","installs":["claude-plugins-official::api-security-testing::skill::42crunch-audit"]}' > /c/tmp/idec.json
node -e "import('./plugin/lib/cli.js').then(async m => { const { loadConfig } = await import('./plugin/lib/config.js'); const r = await m.runInstall({ decisionFile: '/c/tmp/idec.json', mapFile: './indexer/data/capability-map.json', config: loadConfig({ autoInstall: false }), now: new Date().toISOString() }); console.log(r.lines.join('\n')); });"
```
Expected: a `skipped:` line for the id with its install command; nothing is installed (autoInstall off means no `run`).

(Note: do NOT run a live `autoInstall:true` install in verification unless you intend to actually install the plugin into this Claude Code environment. The DI unit tests already prove the auto path runs+verifies; the real exec is exercised by the smoke scenarios when you choose to.)

- [ ] **Step 3: Run the full suite once more**

Run: `cd plugin && node --test`
Expected: PASS — all green.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/README.md
git commit -m "docs(installer): README usage/config + verified skip-path"
```

---

## Self-Review

**Spec coverage (design §1–11):**
- §2 architecture (planInstalls + DI executeInstalls + cli install + council integration) → Tasks 2-5. ✓
- §3 folder layout (installer.js, cli install, SKILL Step 7, config, SMOKE, README) → Tasks 1-6. ✓
- §4 data flow (plan → execute; trusted auto, untrusted approval via --approved; verify) → Tasks 3-5. ✓
- §5 planInstalls + executeInstalls contracts → Tasks 2-3. (Spec's `{run,isInstalled,approve}` refined to add `verify`; rationale in header + flagged at handoff.) ✓
- §6 cli install + autoInstall config → Tasks 1, 4. ✓
- §7 trust tiers/autonomy boundary (trusted auto/skip; candidate/unknown approval; enforced in CLI via --approved) → Tasks 2, 4. ✓
- §8 error handling (fail-soft executeInstalls never throws; verify-fail → failed; graceful probe fallback; --approved gate; bad decision file → no installs) → Tasks 3, 4. ✓
- §9 testing (planInstalls unit; executeInstalls DI with fakes incl. run-not-called assertions; cli no-exec paths; config) → Tasks 1-4. ✓
- §10 scope (no web sources; live path trusted; approval dormant but tested) → respected. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step shows complete code. ✓

**Type consistency:** `planInstalls(decision, map, {autoInstall}) -> [{id,command,trust,mode}]` with mode `auto|skip|approval`; `executeInstalls(plan, {run,isInstalled,verify,approve,log}) -> [{id,status,command?,error?}]` with status `installed|failed|needs-approval|skipped|already-installed`; `runInstall({decisionFile,mapFile,config,approvedIds,now,env}) -> {results,lines}`; consistent across Tasks 2/3/4 and the tests. Capability shape (`id`, `trust`, `install.command`) matches the SP1 map + SP2 fixture. ✓

**Boundary enforcement:** untrusted never installs without `--approved` — enforced in `realEnv.approve` (Task 4) and proven by the executeInstalls "does NOT run an approval item without approval" test (Task 3). ✓
