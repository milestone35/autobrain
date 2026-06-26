# PyPI Seed-List Keşif Source'u (SP9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kürateli bir seed-list (`config/pypi-seeds.json`) içindeki MCP PyPI paket adlarını resmî per-package JSON API (`pypi.org/pypi/<ad>/json`) ile canlı zenginleştirip `candidate` tier `mcp` cap'leri (`claude mcp add <ad> -- uvx <ad>`) üreten bir indexer source eklemek.

**Architecture:** SP7/SP8 source desenini birebir izler — saf `parse*`/`build*` yardımcıları (fixture'larla test) + ince fail-soft `collect(ctx)` (seed dosyasını yerel okur, her paketi DI'lı `ctx.fetchJson` ile çeker). PyPI'nin temiz anahtar-kelime arama API'si olmadığından bu keşif değil, kürateli liste zenginleştirmesidir. dedupe/trust/installer'a kod değişikliği GEREKMEZ (SP8 Pass-2 ecosystem-key `pypi:` zaten doğru); sadece test eklenir.

**Tech Stack:** Node.js ESM (sıfır bağımlılık, global `fetch`), test runner = Node built-in `node --test`.

> **Node ortamı:** Node/npm sistem PATH'inde DEĞİL. Tüm komutlardan ÖNCE (Git Bash):
> ```bash
> export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
> ```
> **Branch:** Zaten `feat/pypi-seeds` dalındayız (spec bu dalda commit'li). Tüm task'lar bu dala.
> **Git Bash kararsız** (msys fork crash riski). Git komutları crash ederse PowerShell ile tekrar dene.

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|-------|-----------|-------|
| `indexer/config/pypi-seeds.json` | kürateli MCP PyPI paket adı listesi | **Oluştur** |
| `indexer/src/sources/pypi.js` | PyPI source (saf helpers + collect) | **Oluştur** |
| `indexer/test/pypi.test.js` | source testleri | **Oluştur** |
| `indexer/src/store.js` | `resolvePaths` `sourcePaths.pypiSeeds` ekler | Değiştir |
| `indexer/test/store.test.js` | pypiSeeds path testi | Değiştir |
| `indexer/src/sources/index.js` | pypi kaydı | Değiştir |
| `indexer/test/sources-index.test.js` | registry listesi | Değiştir |
| `indexer/test/run-scan.test.js` | entegrasyon testi | Değiştir |
| `indexer/test/dedupe.test.js` | pypi+registry aynı-paket merge testi | Değiştir |

---

## Task 1: pypi source (seed config + saf helpers + collect)

**Files:**
- Create: `indexer/config/pypi-seeds.json`
- Create: `indexer/src/sources/pypi.js`
- Create test: `indexer/test/pypi.test.js`

- [ ] **Step 1: Write the seed config** — Create `indexer/config/pypi-seeds.json`:

```json
{
  "packages": [
    "mcp-server-git",
    "mcp-server-fetch",
    "mcp-server-time",
    "mcp-server-sqlite",
    "awslabs.core-mcp-server"
  ]
}
```

- [ ] **Step 2: Write the failing test** — Create `indexer/test/pypi.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as pypi from '../src/sources/pypi.js';

const NOW = '2026-06-26T00:00:00Z';

const GIT_PKG = {
  info: {
    name: 'mcp-server-git',
    summary: 'A Git MCP server',
    keywords: 'git, mcp, llm',
    home_page: null,
    project_urls: { Homepage: 'https://modelcontextprotocol.io', Repository: 'https://github.com/Owner/Repo.git' }
  }
};

test('source name is "pypi"', () => {
  assert.equal(pypi.name, 'pypi');
});

test('serverName folds non-alphanumerics into a collision-safe token', () => {
  assert.equal(pypi.serverName('mcp-server-git'), 'mcp-server-git');
  assert.equal(pypi.serverName('awslabs.core-mcp-server'), 'awslabs-core-mcp-server');
  assert.equal(pypi.serverName('///'), 'mcp');
});

test('parsePypiSeeds keeps safe string names and drops unsafe/non-string', () => {
  const seeds = pypi.parsePypiSeeds({ packages: ['mcp-server-git', 'bad name!', '-rf', 42, '', 'ok.pkg_1'] });
  assert.deepEqual(seeds, ['mcp-server-git', 'ok.pkg_1']);   // space, leading-dash, number, empty dropped
});

test('parsePypiSeeds returns [] when packages is missing or not an array', () => {
  assert.deepEqual(pypi.parsePypiSeeds({}), []);
  assert.deepEqual(pypi.parsePypiSeeds({ packages: 'x' }), []);
  assert.deepEqual(pypi.parsePypiSeeds(null), []);
});

test('extractRepo finds github in project_urls or home_page, else null', () => {
  assert.equal(pypi.extractRepo({ project_urls: { Repository: 'https://github.com/Owner/Repo.git' } }), 'github:owner/repo');
  assert.equal(pypi.extractRepo({ project_urls: { Homepage: 'https://example.com' }, home_page: 'https://github.com/a/b' }), 'github:a/b');
  assert.equal(pypi.extractRepo({ project_urls: { Homepage: 'https://example.com' } }), null);
  assert.equal(pypi.extractRepo({}), null);
});

test('pypiKeywords merges comma/space-split info.keywords with derived terms', () => {
  const kw = pypi.pypiKeywords(GIT_PKG.info);
  assert.ok(kw.includes('git'));
  assert.ok(kw.includes('mcp'));
  assert.ok(kw.includes('llm'));
  assert.ok(kw.includes('server'));      // derived from name/summary
  assert.equal(kw.length, new Set(kw).size); // deduped
});

test('buildCap builds a candidate-shaped mcp cap with a uvx command', () => {
  const c = pypi.buildCap(GIT_PKG, { now: NOW });
  assert.equal(c.id, 'pypi::mcp-server-git::mcp');
  assert.equal(c.kind, 'mcp');
  assert.equal(c.source.marketplace, 'pypi');
  assert.equal(c.source.discoveredVia, 'pypi');
  assert.equal(c.source.repo, 'github:owner/repo');
  assert.equal(c.install.method, 'mcp');
  assert.equal(c.install.package, 'mcp-server-git');
  assert.equal(c.install.command, 'claude mcp add mcp-server-git -- uvx mcp-server-git');
  assert.equal(c.lastSeen, NOW);
});

test('buildCap folds a dotted name for the add-name but keeps the real package for uvx', () => {
  const c = pypi.buildCap({ info: { name: 'awslabs.core-mcp-server', summary: 'x' } }, { now: NOW });
  assert.equal(c.install.command, 'claude mcp add awslabs-core-mcp-server -- uvx awslabs.core-mcp-server');
  assert.equal(c.install.package, 'awslabs.core-mcp-server');
});

test('buildCap returns null for missing or unsafe names', () => {
  assert.equal(pypi.buildCap({ info: {} }, { now: NOW }), null);
  assert.equal(pypi.buildCap({ info: { name: '-rf' } }, { now: NOW }), null);   // leading-dash
  assert.equal(pypi.buildCap({}, { now: NOW }), null);
});

// --- collect (seed file + injected fetchJson) ---
async function seedFile(packages) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cc-pypi-'));
  const file = path.join(dir, 'pypi-seeds.json');
  await writeFile(file, JSON.stringify({ packages }), 'utf8');
  return { dir, file };
}

test('collect reads seeds and builds caps via injected fetchJson (per-package fail-soft)', async () => {
  const { dir, file } = await seedFile(['mcp-server-git', 'missing-pkg', 'bad name!']);
  const fetchJson = async (url) => (url.includes('/mcp-server-git/') ? GIT_PKG : null); // missing-pkg -> null
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: file }, fetchJson, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 1);                 // git built; missing skipped; bad name filtered
  assert.equal(res.capabilities[0].id, 'pypi::mcp-server-git::mcp');
  await rm(dir, { recursive: true, force: true });
});

test('collect returns ok:false when fetchJson is not a function', async () => {
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: '/x' }, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});

test('collect returns ok:false when the seed file is missing', async () => {
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: '/no/such/pypi-seeds.json' }, fetchJson: async () => GIT_PKG, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});

test('collect returns ok:true with [] for an empty seed list', async () => {
  const { dir, file } = await seedFile([]);
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: file }, fetchJson: async () => GIT_PKG, now: NOW });
  assert.equal(res.ok, true);
  assert.deepEqual(res.capabilities, []);
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/pypi.test.js`
Expected: FAIL — "Cannot find module .../pypi.js".

- [ ] **Step 4: Write minimal implementation** — Create `indexer/src/sources/pypi.js`:

```javascript
import { readJson } from '../store.js';
import { makeCapability, deriveKeywords } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'pypi';

const PKG_URL = (n) => `https://pypi.org/pypi/${encodeURIComponent(n)}/json`;
const SEED_CAP = 200;
// Package name is interpolated into a shell-run install command; validate defensively
// (same as npm SAFE_PKG / mcp-registry SAFE_IDENT; rejects a leading dash so it can't be
// consumed as a uvx flag). The @scope/ branch is unused for PyPI but harmless.
const SAFE_IDENT = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._][A-Za-z0-9._-]*$/;

// Fold the package name into a collision-safe `claude mcp add` server name (same fold as
// the mcp-registry source). The real package name is still used verbatim for `uvx`.
export function serverName(pkgName) {
  const cleaned = String(pkgName).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'mcp';
}

export function parsePypiSeeds(json) {
  const list = Array.isArray(json?.packages) ? json.packages : [];
  const out = [];
  for (const p of list) {
    if (typeof p === 'string' && SAFE_IDENT.test(p)) out.push(p);
    if (out.length >= SEED_CAP) break;
  }
  return out;
}

export function extractRepo(info) {
  const urls = info?.project_urls && typeof info.project_urls === 'object' ? Object.values(info.project_urls) : [];
  const candidates = [...urls, info?.home_page];
  for (const u of candidates) {
    const m = String(u || '').match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
    if (m) return normalizeRepo(`${m[1]}/${m[2]}`);
  }
  return null;
}

export function pypiKeywords(info) {
  const raw = typeof info?.keywords === 'string'
    ? info.keywords.split(/[,\s]+/)
    : (Array.isArray(info?.keywords) ? info.keywords : []);
  const fromKw = raw.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  const derived = deriveKeywords([info?.name, info?.summary].filter(Boolean).join(' '));
  return [...new Set([...fromKw, ...derived])];
}

export function buildCap(pkgJson, { now }) {
  const info = pkgJson?.info;
  const name = info?.name;
  if (typeof name !== 'string' || !SAFE_IDENT.test(name)) return null;
  return makeCapability({
    kind: 'mcp', name, description: info.summary || '',
    keywords: pypiKeywords(info),
    marketplace: 'pypi', plugin: name,
    install: { method: 'mcp', command: `claude mcp add ${serverName(name)} -- uvx ${name}`, package: name },
    cost: null, popularity: {},
    source: { repo: extractRepo(info), discoveredVia: 'pypi' }, now
  });
}

export async function collect(ctx) {
  const { sourcePaths, fetchJson, now, log = () => {} } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
  const seeds = await readJson(sourcePaths?.pypiSeeds, null);
  if (!seeds) return { capabilities: [], ok: false, error: 'pypi-seeds.json not found' };
  const names = parsePypiSeeds(seeds);
  const capabilities = [];
  for (const n of names) {
    try {
      const pkg = await fetchJson(PKG_URL(n));
      if (!pkg) { log(`pypi: no metadata for ${n}`); continue; }
      const cap = buildCap(pkg, { now });
      if (cap) capabilities.push(cap);
    } catch (e) {
      log(`pypi: skipping ${n}: ${e.message}`);
    }
  }
  return { capabilities, ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/pypi.test.js`
Expected: PASS (13 tests green).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add indexer/src/sources/pypi.js indexer/test/pypi.test.js indexer/config/pypi-seeds.json
git commit -m "feat(pypi): seed-list source (official per-package JSON API -> candidate mcp caps, uvx)"
```

---

## Task 2: resolvePaths `pypiSeeds`

**Files:**
- Modify: `indexer/src/store.js`
- Modify: `indexer/test/store.test.js`

- [ ] **Step 1: Write the failing test** — Append to the END of `indexer/test/store.test.js`:

```javascript
test('resolvePaths exposes pypiSeeds (default under config, overridable)', () => {
  const def = resolvePaths({ home: '/H', dataDir: '/D' });
  assert.ok(def.sourcePaths.pypiSeeds.endsWith(path.join('config', 'pypi-seeds.json')));
  const over = resolvePaths({ home: '/H', dataDir: '/D', pypiSeeds: '/X/seeds.json' });
  assert.equal(over.sourcePaths.pypiSeeds, '/X/seeds.json');
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/store.test.js`
Expected: FAIL — `pypiSeeds` is undefined (`endsWith` of undefined throws / assertion fails).

- [ ] **Step 3: Implement** — In `indexer/src/store.js`, in `resolvePaths`, change the `sourcePaths` object from:

```javascript
    sourcePaths: {
      officialCatalog: opts.officialCatalog || path.join(pluginsDir, 'plugin-catalog-cache.json'),
      knownMarketplaces: opts.knownMarketplaces || path.join(pluginsDir, 'known_marketplaces.json')
    }
```
to:
```javascript
    sourcePaths: {
      officialCatalog: opts.officialCatalog || path.join(pluginsDir, 'plugin-catalog-cache.json'),
      knownMarketplaces: opts.knownMarketplaces || path.join(pluginsDir, 'known_marketplaces.json'),
      pypiSeeds: opts.pypiSeeds || path.join(INDEXER_ROOT, 'config', 'pypi-seeds.json')
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/store.test.js`
Expected: PASS (all store tests, including the new one).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add indexer/src/store.js indexer/test/store.test.js
git commit -m "feat(pypi): resolvePaths exposes config/pypi-seeds.json (overridable)"
```

---

## Task 3: register source + run-scan integration + dedupe merge test

**Files:**
- Modify: `indexer/src/sources/index.js`
- Modify: `indexer/test/sources-index.test.js`
- Modify: `indexer/test/run-scan.test.js`
- Modify: `indexer/test/dedupe.test.js`

- [ ] **Step 1: Update sources-index test** — In `indexer/test/sources-index.test.js`, change the `assert.deepEqual` line from:
```javascript
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin', 'github', 'npm', 'mcp-registry']);
```
to:
```javascript
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin', 'github', 'npm', 'mcp-registry', 'pypi']);
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js`
Expected: FAIL — names list is missing `pypi`.

- [ ] **Step 3: Register the source** — Replace `indexer/src/sources/index.js` with:
```javascript
import * as official from './official-catalog.js';
import * as known from './known-marketplaces.js';
import * as builtin from './builtin-catalog.js';
import * as github from './github.js';
import * as npm from './npm.js';
import * as mcpRegistry from './mcp-registry.js';
import * as pypi from './pypi.js';

// Ordered by authority. official/known/builtin are local; github/npm/mcp-registry/pypi are
// web-discovery (network via injected ctx.fetchJson; fail-soft when offline/rate-limited).
export const sources = [official, known, builtin, github, npm, mcpRegistry, pypi];
```

- [ ] **Step 4: Add run-scan integration test** — Append to the END of `indexer/test/run-scan.test.js`:
```javascript
test('runScan integrates pypi caps via injected fetchJson + seed file (candidate tier)', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cc-scan-pypi-'));
  const trusted = path.join(dataDir, 'trusted.json');
  const seeds = path.join(dataDir, 'pypi-seeds.json');
  const fs = await import('node:fs/promises');
  await fs.writeFile(trusted, JSON.stringify({ sources: [] }), 'utf8');
  await fs.writeFile(seeds, JSON.stringify({ packages: ['mcp-server-git'] }), 'utf8');

  const PKG = { info: { name: 'mcp-server-git', summary: 'Git MCP', keywords: 'git, mcp',
    project_urls: { Repository: 'https://github.com/foo/git-mcp' } } };
  const fetchJson = async (url) => (url.includes('pypi.org/pypi/mcp-server-git/') ? PKG : null);

  const map = await runScan({
    dataDir, trustedSources: trusted, pypiSeeds: seeds,
    officialCatalog: '/no/such/official.json', knownMarketplaces: '/no/such/known.json',
    fetchJson, githubToken: null, now: NOW
  });

  const pc = map.capabilities.find((c) => c.source.discoveredVia === 'pypi');
  assert.ok(pc, 'pypi cap present');
  assert.equal(pc.trust, 'candidate');                 // repo present, not in trusted set
  assert.equal(pc.install.method, 'mcp');
  assert.equal(pc.install.command, 'claude mcp add mcp-server-git -- uvx mcp-server-git');
  assert.equal(map.sources.pypi.count, 1);

  await rm(dataDir, { recursive: true, force: true });
});
```

- [ ] **Step 5: Add the dedupe merge test** — Append to the END of `indexer/test/dedupe.test.js`:
```javascript
test('merges a pypi cap and an mcp-registry cap that install the same pypi package (registry wins)', () => {
  const pypiCap = {
    id: 'pypi::mcp-server-git::mcp', kind: 'mcp', name: 'mcp-server-git', description: 'pypi desc',
    keywords: ['git'], source: { marketplace: 'pypi', repo: null, discoveredVia: 'pypi' },
    install: { method: 'mcp', command: 'claude mcp add mcp-server-git -- uvx mcp-server-git', package: 'mcp-server-git' },
    trust: null, cost: null, popularity: {}, lastSeen: '2026-01-01T00:00:00Z'
  };
  const regCap = {
    id: 'mcp-registry::io.github.x/git::mcp', kind: 'mcp', name: 'io.github.x/git', description: 'registry desc longer',
    keywords: ['mcp'], source: { marketplace: 'mcp-registry', repo: 'github:x/git', discoveredVia: 'mcp-registry' },
    install: { method: 'mcp', command: 'claude mcp add io-github-x-git -- uvx mcp-server-git', package: 'mcp-server-git' },
    trust: null, cost: null, popularity: {}, lastSeen: '2026-02-01T00:00:00Z'
  };
  for (const input of [[pypiCap, regCap], [regCap, pypiCap]]) {
    const out = dedupeCapabilities(input);
    assert.equal(out.length, 1);                                   // merged (both uvx -> key pypi:mcp-server-git)
    assert.equal(out[0].id, 'mcp-registry::io.github.x/git::mcp');  // registry rank 3 beats pypi rank 5
    assert.deepEqual(out[0].keywords, ['git', 'mcp']);
  }
});
```

- [ ] **Step 6: Run the affected tests, then the full suite**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js test/run-scan.test.js test/dedupe.test.js`
Expected: PASS — sources-index (1), run-scan (existing + new), dedupe (existing + new).

Then the full indexer suite:
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add indexer/src/sources/index.js indexer/test/sources-index.test.js indexer/test/run-scan.test.js indexer/test/dedupe.test.js
git commit -m "feat(pypi): register source + run-scan integration + pypi/registry dedupe test (candidate tier live)"
```

---

## Task 4: uçtan-uca doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Full suites**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all green (indexer ~108, plugin 100 — plugin unchanged).

- [ ] **Step 2: Live scan (network-dependent, fail-soft)**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node src/cli.js scan && node src/cli.js status
```
Expected: scan completes regardless of network. With network: `status` shows `bySource:` including `pypi` > 0 (the seed packages that resolve), `byTrust: candidate` increases. Offline: pypi contributes 0 (fail-soft) and scan still succeeds.

- [ ] **Step 3: Candidate flow via the plugin CLI**

Pick a pypi candidate id from the map and verify the install plan marks it `needs-approval` (NOT `already-installed`):
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
CID=$(node -e "const m=require('./indexer/data/capability-map.json'); const c=m.capabilities.find(x=>x.source.discoveredVia==='pypi'); console.log(c?c.id:'')")
echo "pypi candidate: $CID"
printf '%s' "{\"decision\":\"install_then_use\",\"capabilities\":[\"$CID\"],\"installs\":[\"$CID\"],\"method\":\"x\",\"rationale\":\"r\",\"confidence\":0.9}" > /c/tmp/cc-pypi.json
cd plugin && node lib/cli.js install /c/tmp/cc-pypi.json
rm -f /c/tmp/cc-pypi.json
```
Expected: `needs-approval: <CID> — claude mcp add <name> -- uvx <pkg>`. If the live scan produced no pypi candidate (offline), state that and rely on the integration test (Task 3) which proves the wiring deterministically.

- [ ] **Step 4: Confirm clean working tree**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git status -s`
Expected: only pre-existing untracked junk (e.g. `bash.exe.stackdump`); `capability-map.json` is gitignored.

---

## Tamamlanma Kriteri (spec §9 ile eşleşir)

- [ ] `node src/cli.js scan` ağ varsa seed paketlerinden `bySource: pypi>0`, `byTrust: candidate>0`; yoksa fail-soft (boş, scan başarılı).
- [ ] pypi candidate cap'ler matcher'da görünür, konsey seçebilir, installer onay yolu (`needs-approval`) tetiklenir; method-aware doğrulama `uvx` komutunu `claude mcp list` ile okur.
- [ ] pypi + mcp-registry aynı paket → dedupe tek cap'e indirger (registry otorite).
- [ ] Testler ağa çıkmadan tüm yolları kapsar; tüm testler yeşil; teknik borç yok.
```
