# Router + Matcher + Hook (Sub-project 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `plugin/` Claude Code plugin that consumes `capability-map.json` and, on every prompt, runs a generous lexical matcher in a fail-open `UserPromptSubmit` hook to inject candidate capabilities as a passive hint — plus a read-only `/route` preview command.

**Architecture:** A self-contained, zero-dependency Node (ESM) plugin that knows the indexer only via the `capability-map.json` path. Pure, deterministic modules (`config`, `map-loader`, `matcher`) are unit-tested with a fixture map and injected `now`. A thin stateless hook (`hooks/user-prompt-submit.js`) wires stdin → `handleHook` (pure) → stdout JSON, always exiting 0. A `/route` command wraps `runPreview` for observability.

**Tech Stack:** Node.js ≥18 (ESM), zero runtime dependencies, built-in test runner (`node --test`) + `node:assert/strict`. Local file reads only.

**Scope (this plan):** plugin manifest + `UserPromptSubmit` hook (passive injection) + lexical matcher + map-loader (path, schemaVersion guard, staleness) + config + `/route` preview + tests + README.
**Out of scope (next plans):** multi-agent council skill (SP3), trusted-list auto-installer + candidate/unknown approval (SP4), publish/remote map (Faz 2), web-discovery sources (indexer plan).

**Key shapes** (every task uses exactly these names):
```js
// config: { enabled:bool, mapSource:string, topN:int, scoreFloor:number, staleDays:int }
loadConfig(rawJson) -> config                       // lib/config.js  (merge defaults + validate)

tokenize(text) -> string[]                           // lib/matcher.js
scoreCapability(promptTokens, cap) -> number         // lib/matcher.js  (name x3, keyword x2, desc x1)
rankCandidates(scored, topN) -> cap[]                // lib/matcher.js  (score desc, installs desc, id asc)
matchPrompt(prompt, map, opts) -> { candidates, promptTokens }  // lib/matcher.js

loadMap({ mapFile, staleDays, now }) -> { map, error, stale, ageDays }   // lib/map-loader.js

handleHook({ stdinText, config, mapFile, now }) -> { additionalContext } | null   // lib/hook.js
runPreview({ prompt, mapFile, config, now }) -> { candidates, lines }             // lib/cli.js
```

**Note on environment:** This repo's Node lives in a conda env, not on PATH. Run tests/CLI after:
`export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"` then `cd plugin && node --test`. The live hook command in the manifest uses `node` and assumes `node` is resolvable by the CC runtime (documented as a README caveat).

---

### Task 1: Project scaffold + fixture map

**Files:**
- Create: `plugin/package.json`
- Create: `plugin/.gitignore`
- Create: `plugin/config/autopilot.config.json`
- Create: `plugin/test/fixtures/capability-map.sample.json`
- Create: `plugin/test/smoke.test.js`

- [ ] **Step 1: Write package.json**

Create `plugin/package.json`:
```json
{
  "name": "cc-autopilot-router",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "node --test",
    "preview": "node lib/cli.js preview"
  }
}
```

- [ ] **Step 2: Write .gitignore**

Create `plugin/.gitignore`:
```
node_modules/
*.tmp
```

- [ ] **Step 3: Write the default config**

Create `plugin/config/autopilot.config.json`:
```json
{
  "enabled": true,
  "mapSource": "../indexer/data/capability-map.json",
  "topN": 5,
  "scoreFloor": 0,
  "staleDays": 14
}
```

- [ ] **Step 4: Write the fixture map** (real `id` format `marketplace::plugin::kind::component`)

Create `plugin/test/fixtures/capability-map.sample.json`:
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-19T00:00:00Z",
  "sources": { "official": { "ok": true, "count": 3 } },
  "capabilities": [
    {
      "id": "mp::api-sec::skill::api-audit",
      "kind": "skill", "name": "api-audit",
      "description": "Audit API security and find vulnerabilities",
      "keywords": ["api", "audit", "security", "vulnerabilities"],
      "source": { "marketplace": "mp", "repo": null, "discoveredVia": "official" },
      "install": { "method": "plugin", "command": "claude plugin install api-sec@mp", "package": null },
      "trust": "trusted", "cost": { "always_on": 100, "on_invoke": 2000 },
      "popularity": { "unique_installs": 50, "stars": null }, "lastSeen": "2026-06-19T00:00:00Z"
    },
    {
      "id": "mp::api-sec::skill::api-fuzz",
      "kind": "skill", "name": "api-fuzz",
      "description": "Fuzz API endpoints",
      "keywords": ["api", "fuzz", "endpoints"],
      "source": { "marketplace": "mp", "repo": null, "discoveredVia": "official" },
      "install": { "method": "plugin", "command": "claude plugin install api-sec@mp", "package": null },
      "trust": "trusted", "cost": null,
      "popularity": { "unique_installs": 200, "stars": null }, "lastSeen": "2026-06-19T00:00:00Z"
    },
    {
      "id": "mp::docs::skill::write-readme",
      "kind": "skill", "name": "write-readme",
      "description": "Generate documentation and README files",
      "keywords": ["documentation", "readme", "docs"],
      "source": { "marketplace": "mp", "repo": null, "discoveredVia": "official" },
      "install": { "method": "plugin", "command": "claude plugin install docs@mp", "package": null },
      "trust": "trusted", "cost": null,
      "popularity": { "unique_installs": 10, "stars": null }, "lastSeen": "2026-06-19T00:00:00Z"
    }
  ]
}
```

- [ ] **Step 5: Write a smoke test**

Create `plugin/test/smoke.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 6: Run the smoke test**

Run: `cd plugin && node --test test/smoke.test.js`
Expected: PASS — `tests 1 ... pass 1`.

- [ ] **Step 7: Commit**

```bash
cd ~/cc-autopilot 2>/dev/null || cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/package.json plugin/.gitignore plugin/config plugin/test/fixtures plugin/test/smoke.test.js
git commit -m "feat(router): plugin scaffold (ESM, node --test, default config, fixture map)"
```

---

### Task 2: `config.js` — `loadConfig`

**Files:**
- Create: `plugin/lib/config.js`
- Test: `plugin/test/config.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/config.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/config.test.js`
Expected: FAIL — cannot find module `../lib/config.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/config.js`:
```js
export const DEFAULTS = Object.freeze({
  enabled: true,
  mapSource: '../indexer/data/capability-map.json',
  topN: 5,
  scoreFloor: 0,
  staleDays: 14
});

const isBool = (v) => typeof v === 'boolean';
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
const isPosInt = (v) => Number.isInteger(v) && v > 0;
const isNonNegNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function loadConfig(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: isBool(r.enabled) ? r.enabled : DEFAULTS.enabled,
    mapSource: isStr(r.mapSource) ? r.mapSource : DEFAULTS.mapSource,
    topN: isPosInt(r.topN) ? r.topN : DEFAULTS.topN,
    scoreFloor: isNonNegNum(r.scoreFloor) ? r.scoreFloor : DEFAULTS.scoreFloor,
    staleDays: isNonNegInt(r.staleDays) ? r.staleDays : DEFAULTS.staleDays
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugin && node --test test/config.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/config.js plugin/test/config.test.js
git commit -m "feat(router): loadConfig (per-field defaults + validation)"
```

---

### Task 3: `matcher.js` — `tokenize`

**Files:**
- Create: `plugin/lib/matcher.js`
- Test: `plugin/test/matcher.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/matcher.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../lib/matcher.js';

test('tokenize lowercases, splits on non-alnum, drops short words + stopwords, dedupes', () => {
  assert.deepEqual(tokenize('Audit my API for the Security'), ['api', 'audit', 'security']);
});

test('tokenize returns [] for empty/nullish', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test('tokenize is order-independent (sorted unique set)', () => {
  assert.deepEqual(tokenize('security audit'), tokenize('audit security'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/matcher.test.js`
Expected: FAIL — cannot find module `../lib/matcher.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/matcher.js` (stopword list intentionally mirrors `indexer/src/normalize.js` — copy, not shared import, to keep the contract boundary clean):
```js
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'use', 'using', 'via', 'can', 'all', 'any', 'not', 'but'
]);

export function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugin && node --test test/matcher.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/matcher.js plugin/test/matcher.test.js
git commit -m "feat(router): tokenize (lexical, deterministic)"
```

---

### Task 4: `matcher.js` — `scoreCapability`, `rankCandidates`, `matchPrompt`

**Files:**
- Modify: `plugin/lib/matcher.js`
- Test: `plugin/test/matcher.test.js`

- [ ] **Step 1: Write the failing test (append)**

Append to `plugin/test/matcher.test.js`:
```js
import { scoreCapability, rankCandidates, matchPrompt } from '../lib/matcher.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'capability-map.sample.json'), 'utf8'));
const cap = (id) => MAP.capabilities.find((c) => c.id === id);

test('scoreCapability weights name x3, keyword x2, description x1', () => {
  const t = tokenize('audit my api security');
  // api-audit: name {api,audit}=2*3=6; keywords {api,audit,security}=3*2=6; desc {audit,api,security}=3*1=3 => 15
  assert.equal(scoreCapability(t, cap('mp::api-sec::skill::api-audit')), 15);
  // api-fuzz: name {api}=1*3=3; keywords {api}=1*2=2; desc {api}=1*1=1 => 6
  assert.equal(scoreCapability(t, cap('mp::api-sec::skill::api-fuzz')), 6);
  // write-readme: no overlap => 0
  assert.equal(scoreCapability(t, cap('mp::docs::skill::write-readme')), 0);
});

test('rankCandidates sorts by score desc, then unique_installs desc, then id asc', () => {
  const scored = [
    { cap: { id: 'b', popularity: { unique_installs: 10 } }, score: 5 },
    { cap: { id: 'a', popularity: { unique_installs: 10 } }, score: 5 },
    { cap: { id: 'c', popularity: { unique_installs: 99 } }, score: 9 }
  ];
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['c', 'a', 'b']);
});

test('rankCandidates caps at topN', () => {
  const scored = [1, 2, 3, 4].map((n) => ({ cap: { id: `id${n}`, popularity: {} }, score: n }));
  assert.equal(rankCandidates(scored, 2).length, 2);
});

test('matchPrompt returns ranked candidates above scoreFloor (generous gate)', () => {
  const { candidates } = matchPrompt('audit my api security', MAP, { topN: 5, scoreFloor: 0 });
  assert.deepEqual(candidates.map((c) => c.id), ['mp::api-sec::skill::api-audit', 'mp::api-sec::skill::api-fuzz']);
});

test('matchPrompt returns [] when nothing matches', () => {
  const { candidates } = matchPrompt('xyzzy nothing here', MAP, { topN: 5, scoreFloor: 0 });
  assert.deepEqual(candidates, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/matcher.test.js`
Expected: FAIL — `scoreCapability`/`rankCandidates`/`matchPrompt` not exported.

- [ ] **Step 3: Write minimal implementation (append)**

Append to `plugin/lib/matcher.js`:
```js
function countMatches(promptTokens, candidateTokens) {
  const set = new Set(candidateTokens);
  let n = 0;
  for (const t of promptTokens) if (set.has(t)) n++;
  return n;
}

export function scoreCapability(promptTokens, cap) {
  const nameHits = countMatches(promptTokens, tokenize(cap.name));
  const kwHits = countMatches(promptTokens, (cap.keywords || []).map((k) => k.toLowerCase()));
  const descHits = countMatches(promptTokens, tokenize(cap.description));
  return nameHits * 3 + kwHits * 2 + descHits * 1;
}

export function rankCandidates(scored, topN) {
  return [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ai = a.cap.popularity?.unique_installs ?? 0;
      const bi = b.cap.popularity?.unique_installs ?? 0;
      if (bi !== ai) return bi - ai;
      return a.cap.id < b.cap.id ? -1 : a.cap.id > b.cap.id ? 1 : 0;
    })
    .slice(0, topN)
    .map((s) => s.cap);
}

export function matchPrompt(prompt, map, opts = {}) {
  const topN = opts.topN ?? 5;
  const scoreFloor = opts.scoreFloor ?? 0;
  const promptTokens = tokenize(prompt);
  const scored = [];
  for (const cap of map?.capabilities || []) {
    const score = scoreCapability(promptTokens, cap);
    if (score > scoreFloor) scored.push({ cap, score });
  }
  return { candidates: rankCandidates(scored, topN), promptTokens };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugin && node --test test/matcher.test.js`
Expected: PASS — all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/matcher.js plugin/test/matcher.test.js
git commit -m "feat(router): scoreCapability + rankCandidates + matchPrompt"
```

---

### Task 5: `map-loader.js` — `loadMap` (load + schemaVersion guard + staleness)

**Files:**
- Create: `plugin/lib/map-loader.js`
- Test: `plugin/test/map-loader.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/map-loader.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMap } from '../lib/map-loader.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');
async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-map-')); }

test('loadMap loads a valid map and is fresh when within staleDays', async () => {
  const res = await loadMap({ mapFile: FIXT, staleDays: 14, now: '2026-06-25T00:00:00Z' });
  assert.equal(res.error, null);
  assert.equal(res.map.capabilities.length, 3);
  assert.equal(res.stale, false);
  assert.equal(res.ageDays, 6);
});

test('loadMap flags stale when older than staleDays', async () => {
  const res = await loadMap({ mapFile: FIXT, staleDays: 14, now: '2026-08-01T00:00:00Z' });
  assert.equal(res.stale, true);
  assert.ok(res.ageDays > 14);
});

test('loadMap returns error when file missing', async () => {
  const res = await loadMap({ mapFile: '/no/such/map.json', staleDays: 14, now: '2026-06-19T00:00:00Z' });
  assert.equal(res.map, null);
  assert.match(res.error, /not found|bulunamad/i);
});

test('loadMap returns error on corrupt JSON', async () => {
  const dir = await tmp();
  const f = path.join(dir, 'bad.json');
  await writeFile(f, '{ not json', 'utf8');
  const res = await loadMap({ mapFile: f, staleDays: 14, now: '2026-06-19T00:00:00Z' });
  assert.equal(res.map, null);
  assert.match(res.error, /JSON/i);
  await rm(dir, { recursive: true, force: true });
});

test('loadMap returns error on unsupported schemaVersion', async () => {
  const dir = await tmp();
  const f = path.join(dir, 'v99.json');
  await writeFile(f, JSON.stringify({ schemaVersion: 99, capabilities: [] }), 'utf8');
  const res = await loadMap({ mapFile: f, staleDays: 14, now: '2026-06-19T00:00:00Z' });
  assert.equal(res.map, null);
  assert.match(res.error, /schemaVersion/);
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/map-loader.test.js`
Expected: FAIL — cannot find module `../lib/map-loader.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/map-loader.js`:
```js
import { readFile } from 'node:fs/promises';

const DAY_MS = 86400000;

function fail(error) {
  return { map: null, error, stale: false, ageDays: null };
}

export async function loadMap({ mapFile, staleDays = 14, now } = {}) {
  let raw;
  try {
    raw = await readFile(mapFile, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fail(`Harita bulunamadı (not found): ${mapFile}. Önce 'npm run scan' çalıştırın.`);
    return fail(`Harita okunamadı: ${mapFile}: ${e.message}`);
  }

  let map;
  try {
    map = JSON.parse(raw);
  } catch (e) {
    return fail(`Bozuk JSON (corrupt): ${mapFile}: ${e.message}`);
  }

  if (map?.schemaVersion !== 1) return fail(`Desteklenmeyen schemaVersion: ${map?.schemaVersion}`);

  const nowMs = Date.parse(now || new Date().toISOString());
  const genMs = Date.parse(map.generatedAt);
  const ageDays = Number.isFinite(genMs) ? Math.floor((nowMs - genMs) / DAY_MS) : null;
  const stale = ageDays !== null && ageDays > staleDays;

  return { map, error: null, stale, ageDays };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugin && node --test test/map-loader.test.js`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/map-loader.js plugin/test/map-loader.test.js
git commit -m "feat(router): loadMap (schemaVersion guard + staleness, error-returning)"
```

---

### Task 6: `lib/hook.js` — `handleHook` + injection formatting

**Files:**
- Create: `plugin/lib/hook.js`
- Test: `plugin/test/hook.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/hook.test.js`:
```js
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
  assert.match(out.additionalContext, /cc-autopilot/);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/hook.test.js`
Expected: FAIL — cannot find module `../lib/hook.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/hook.js`:
```js
import { loadMap } from './map-loader.js';
import { matchPrompt } from './matcher.js';

function formatCandidate(cap) {
  const head = `- ${cap.name}  (${cap.kind}·${cap.trust ?? 'unknown'}) — ${cap.description || ''}`.trimEnd();
  const install = cap.install?.command ? `\n    kur: ${cap.install.command}` : '';
  return head + install;
}

export function formatContext(candidates, map, stale, ageDays) {
  const total = map.capabilities.length;
  const staleNote = stale ? `  (harita ${ageDays} gün eski — 'npm run scan' önerilir)` : '';
  const lines = [
    `[cc-autopilot] Bu istek için işe yarayabilecek yetenekler (harita: ${total} yetenek):${staleNote}`,
    ...candidates.map(formatCandidate),
    '(Alakasızsa yok say. Karar/kurulum sonraki sürümde otomatikleşecek.)'
  ];
  return lines.join('\n');
}

export async function handleHook({ stdinText, config, mapFile, now }) {
  try {
    if (!config?.enabled) return null;

    let prompt;
    try {
      prompt = JSON.parse(stdinText)?.prompt;
    } catch {
      return null; // bad stdin -> fail-open
    }
    if (!prompt || typeof prompt !== 'string') return null;

    const { map, error, stale, ageDays } = await loadMap({ mapFile, staleDays: config.staleDays, now });
    if (error || !map) return null; // fail-open: no map, no injection

    const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
    if (!candidates.length) return null;

    return { additionalContext: formatContext(candidates, map, stale, ageDays) };
  } catch {
    return null; // any unexpected error -> fail-open
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugin && node --test test/hook.test.js`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/hook.js plugin/test/hook.test.js
git commit -m "feat(router): handleHook + injection formatting (fail-open)"
```

---

### Task 7: `cli.js` — `runPreview` + `main` dispatch

**Files:**
- Create: `plugin/lib/cli.js`
- Test: `plugin/test/preview.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugin/test/preview.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/preview.test.js`
Expected: FAIL — cannot find module `../lib/cli.js`.

- [ ] **Step 3: Write minimal implementation**

Create `plugin/lib/cli.js`:
```js
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { loadMap } from './map-loader.js';
import { matchPrompt, scoreCapability, tokenize } from './matcher.js';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(LIB_DIR, '..');

// Resolve config.mapSource (possibly relative) against the plugin root.
export function resolveMapFile(config, root = PLUGIN_ROOT) {
  return path.isAbsolute(config.mapSource) ? config.mapSource : path.resolve(root, config.mapSource);
}

export async function loadPluginConfig(root = PLUGIN_ROOT) {
  try {
    const raw = await readFile(path.join(root, 'config', 'autopilot.config.json'), 'utf8');
    return loadConfig(JSON.parse(raw));
  } catch {
    return loadConfig({}); // missing/corrupt config -> defaults
  }
}

export async function runPreview({ prompt, mapFile, config, now }) {
  const { map, error, stale, ageDays } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  if (error || !map) {
    return { candidates: [], lines: [`[cc-autopilot] harita yüklenemedi: ${error}`] };
  }
  const promptTokens = tokenize(prompt);
  const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
  const lines = [
    `[cc-autopilot] preview — ${candidates.length} aday (harita: ${map.capabilities.length}${stale ? `, ${ageDays}g eski` : ''})`,
    ...candidates.map((c) => `  [score ${scoreCapability(promptTokens, c)}] ${c.id}  (${c.kind}·${c.trust}) — ${c.name}`)
  ];
  return { candidates, lines };
}

async function main(argv) {
  const cmd = argv[2];
  if (cmd !== 'preview') {
    console.error('Usage: cli.js preview "<prompt>"');
    process.exitCode = 1;
    return;
  }
  const prompt = argv.slice(3).join(' ');
  const config = await loadPluginConfig();
  const mapFile = resolveMapFile(config);
  const { lines } = await runPreview({ prompt, mapFile, config, now: new Date().toISOString() });
  console.log(lines.join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugin && node --test test/preview.test.js`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/lib/cli.js plugin/test/preview.test.js
git commit -m "feat(router): runPreview + CLI dispatch + path resolution"
```

---

### Task 8: Hook entry script + plugin manifest + `/route` command

**Files:**
- Create: `plugin/hooks/user-prompt-submit.js`
- Create: `plugin/hooks/hooks.json`
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/commands/route.md`
- Test: `plugin/test/hook-entry.test.js`

- [ ] **Step 1: Write the failing test** (drives the hook entry script via a child process)

Create `plugin/test/hook-entry.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, '..', 'hooks', 'user-prompt-submit.js');

function runHook(stdinText) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(stdinText);
  });
}

test('hook entry exits 0 and emits hookSpecificOutput for a matching prompt', async () => {
  const { code, out } = await runHook(JSON.stringify({ prompt: 'audit my api security' }));
  assert.equal(code, 0);
  // The real map may or may not be present; if present we get JSON, otherwise empty (fail-open).
  if (out.trim()) {
    const parsed = JSON.parse(out);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
  }
});

test('hook entry exits 0 with no output on garbage stdin (fail-open)', async () => {
  const { code, out } = await runHook('{ not json');
  assert.equal(code, 0);
  assert.equal(out.trim(), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugin && node --test test/hook-entry.test.js`
Expected: FAIL — `hooks/user-prompt-submit.js` does not exist (spawn yields non-zero / module-not-found).

- [ ] **Step 3: Write the hook entry script**

Create `plugin/hooks/user-prompt-submit.js`:
```js
#!/usr/bin/env node
import { handleHook } from '../lib/hook.js';
import { loadPluginConfig, resolveMapFile } from '../lib/cli.js';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

async function main() {
  try {
    const stdinText = await readStdin();
    const config = await loadPluginConfig();
    const mapFile = resolveMapFile(config);
    const result = await handleHook({ stdinText, config, mapFile, now: new Date().toISOString() });
    if (result) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: result.additionalContext
        }
      }));
    }
  } catch {
    // fail-open: emit nothing
  }
  process.exit(0);
}

main();
```

- [ ] **Step 4: Write the hooks registration**

Create `plugin/hooks/hooks.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: Write the plugin manifest**

Create `plugin/.claude-plugin/plugin.json`:
```json
{
  "name": "cc-autopilot",
  "version": "0.1.0",
  "description": "Routes each prompt to the best capabilities from the cc-autopilot capability map (passive candidate hints).",
  "hooks": "./hooks/hooks.json"
}
```

- [ ] **Step 6: Write the `/route` command**

Create `plugin/commands/route.md`:
```markdown
---
description: Preview cc-autopilot router candidates for a prompt (read-only; installs nothing)
allowed-tools: Bash(node *)
---

# /route — capability preview

Read-only preview of which capabilities the cc-autopilot router would surface for the given prompt. Nothing is installed or decided.

!`node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js" preview "$ARGUMENTS"`

The candidates above are ranked by lexical relevance (read-only). In a later version the router will decide and install autonomously.
```

- [ ] **Step 7: Run the hook-entry test to verify it passes**

Run: `cd plugin && node --test test/hook-entry.test.js`
Expected: PASS — 2 tests pass (exit 0 both cases; fail-open on garbage).

- [ ] **Step 8: Run the full suite**

Run: `cd plugin && node --test`
Expected: PASS — all files pass (smoke, config, matcher, map-loader, hook, preview, hook-entry).

- [ ] **Step 9: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/hooks plugin/.claude-plugin plugin/commands plugin/test/hook-entry.test.js
git commit -m "feat(router): hook entry + plugin manifest + /route preview command"
```

---

### Task 9: README + live verification

**Files:**
- Create: `plugin/README.md`

- [ ] **Step 1: Write the README**

Create `plugin/README.md`:
```markdown
# cc-autopilot router (plugin)

Consumes `capability-map.json` (produced by the `indexer/`) and, on every prompt,
injects a passive hint listing candidate capabilities via a fail-open
`UserPromptSubmit` hook. Includes a read-only `/route` preview command.

## Requirements
- Node.js >= 18 (no other dependencies)
- A built map at the path in `config/autopilot.config.json` (`mapSource`,
  default `../indexer/data/capability-map.json`). Build it with `cd ../indexer && npm run scan`.

## Usage
```bash
npm test                         # run the test suite
node lib/cli.js preview "audit my api security"   # read-only matcher preview
```
In Claude Code (plugin installed): `/route audit my api security`.

## How it works
- `hooks/user-prompt-submit.js` — reads the prompt from stdin, loads the map,
  runs the lexical matcher, and (if candidates) emits
  `hookSpecificOutput.additionalContext`. Always exits 0 (fail-open).
- `lib/matcher.js` — deterministic lexical scoring: name×3, keyword×2, description×1.
  Generous gate (`scoreFloor=0`); ranking + `topN` cap limit noise.
- `lib/map-loader.js` — loads the map, guards `schemaVersion`, computes staleness.
- `lib/config.js` — `config/autopilot.config.json` with per-field defaults.

## Config (`config/autopilot.config.json`)
- `enabled` — master switch (false = router silent)
- `mapSource` — path to capability-map.json (relative to plugin root, or absolute)
- `topN` — max candidates injected (default 5)
- `scoreFloor` — minimum score to surface (default 0 = any lexical signal)
- `staleDays` — age after which a "run scan" note is appended (default 14)

## Notes / caveats
- The hook command uses `node`; the CC runtime must be able to resolve `node` on
  its PATH. If Node is in a non-PATH location (e.g. a conda env), ensure CC's
  environment can find it.
- Council (autonomous decision) and auto-install arrive in later sub-projects;
  this version only surfaces passive hints.
```

- [ ] **Step 2: Build the real map (if not already present)**

Run: `cd ../indexer && node src/cli.js scan`
Expected: `scan complete: <N> capabilities` (N in the hundreds).

- [ ] **Step 3: Live preview against the real map**

Run: `cd plugin && node lib/cli.js preview "audit my api for security vulnerabilities"`
Expected: prints `[cc-autopilot] preview — <k> aday (harita: <N>)` followed by ranked candidate lines with scores; k ≥ 1.

- [ ] **Step 4: Live fail-open check (no map)**

Run: `cd plugin && node lib/cli.js preview "anything"` with `mapSource` pointed at a missing file (temporarily, or rely on Step 3 having the map). For a missing map, expect a single `harita yüklenemedi` line and exit without throw.
Expected: no crash; a clear error line.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/README.md
git commit -m "docs(router): usage README + verified live preview"
```

---

## Self-Review

**Spec coverage (design §1–13):**
- §3 folder layout → Tasks 1–9 create `lib/`, `hooks/`, `commands/`, `config/`, `.claude-plugin/`, `test/`. ✓
- §4 data flow (config → map-loader → matcher → additionalContext; fail-open) → Task 6 `handleHook` + Task 8 hook entry. ✓
- §5 matcher (tokenize, name×3/keyword×2/desc×1, generous gate, score→installs→id ranking, topN) → Tasks 3–4. ✓
- §6 map-loader (path resolve, schemaVersion guard, staleness, error-returning) → Task 5 + `resolveMapFile` Task 7. ✓
- §7 hook & injection format (stdin `prompt`, `hookSpecificOutput.additionalContext`, compact lines, stale note, fail-open, pure `handleHook`) → Tasks 6, 8. ✓
- §8 `/route` preview (`runPreview` + command wrapper via `!` bash) → Tasks 7, 8. ✓
- §9 config (defaults merge, per-field validation, `enabled`) → Task 2. ✓
- §10 error handling (hook fail-open, map errors, config fallback, read-only, stale note) → Tasks 5, 6, 7. ✓
- §11 test strategy (matcher, map-loader, config, hook, preview, all deterministic with injected `now`) → Tasks 2–8. ✓
- §12 scope (council/installer/publish/web excluded) → respected; manifest leaves room (`hooks` key) but adds nothing for SP3/SP4. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". Every code step shows complete code. ✓

**Type consistency:** Verified names consistent across tasks — `loadConfig`/`DEFAULTS`; `tokenize`/`scoreCapability`/`rankCandidates`/`matchPrompt`; `loadMap` → `{ map, error, stale, ageDays }`; `handleHook({ stdinText, config, mapFile, now })` → `{ additionalContext }|null`; `formatContext`; `runPreview({ prompt, mapFile, config, now })` → `{ candidates, lines }`; `resolveMapFile`/`loadPluginConfig` shared by hook entry + CLI. Capability fields (`id, kind, name, description, keywords, source, install, trust, cost, popularity, lastSeen`) match the indexer's emitted shape and the fixture. ✓

**One intentional duplication:** the stopword list + tokenization logic is copied from `indexer/src/normalize.js` rather than imported — deliberate, to keep the "only contract is capability-map.json" boundary (design §2). Noted in Task 3.
