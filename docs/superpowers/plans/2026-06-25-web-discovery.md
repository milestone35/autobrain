# Web-Keşif Source'ları (SP7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** İki web-keşif indexer source'u (GitHub CC plugin/marketplace repoları, npm MCP paketleri) ekleyip `candidate` trust tier'ını uçtan uca canlandırmak; installer'ı install-method-aware doğrulamayla sertleştirmek.

**Architecture:** Source'lar mevcut `{ name, collect(ctx) }` sözleşmesini izler; ağ erişimi `ctx.fetchJson` ile enjekte edilir (testler ağa çıkmaz). Saf `parse*` yardımcıları fixture'larla test edilir; collect fail-soft (ağ/rate-limit → ok:false boş). Installer `install.method`'a göre doğru `list` komutuyla doğrular (plugin→`claude plugin list`, mcp→`claude mcp list`).

**Tech Stack:** Node.js ESM (sıfır bağımlılık, global `fetch`), test runner = Node built-in `node --test`.

> **Node ortamı:** Node/npm sistem PATH'inde DEĞİL. Tüm komutlardan ÖNCE (Git Bash):
> ```bash
> export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
> ```
> **Branch:** Başlamadan önce `master`'dan dal aç: `git checkout -b feat/web-discovery`. Tüm task'lar bu dala.
> **Git Bash kararsız** (msys fork crash riski). Git komutları crash ederse PowerShell ile tekrar dene: `git ...` (PowerShell'de aynı komut).

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|-------|-----------|-------|
| `indexer/src/http.js` | `makeFetchJson(fetchImpl)` — DI'lı JSON fetch | **Oluştur** |
| `indexer/test/http.test.js` | http testleri | **Oluştur** |
| `indexer/src/normalize.js` | `capabilitiesFromManifest` (paylaşılan) | Değiştir |
| `indexer/src/sources/known-marketplaces.js` | paylaşılan helper'ı kullan (DRY) | Değiştir |
| `indexer/test/normalize.test.js` | capabilitiesFromManifest testi | Değiştir |
| `indexer/src/sources/github.js` | GitHub keşif source | **Oluştur** |
| `indexer/test/github.test.js` | github testleri | **Oluştur** |
| `indexer/src/sources/npm.js` | npm keşif source | **Oluştur** |
| `indexer/test/npm.test.js` | npm testleri | **Oluştur** |
| `indexer/src/sources/index.js` | github+npm kaydı | Değiştir |
| `indexer/src/cli.js` (runScan) | `ctx.fetchJson`/`githubToken` enjeksiyonu | Değiştir |
| `indexer/test/run-scan.test.js` | no-network güncelleme + entegrasyon testi | Değiştir |
| `indexer/test/sources-index.test.js` | registry github+npm | Değiştir |
| `plugin/lib/installer.js` | `planInstalls` plana `method` ekler | Değiştir |
| `plugin/lib/cli.js` | `verifyCmdFor`/`mcpListed`/`listed` + `realEnv` method-aware | Değiştir |
| `plugin/test/installer.test.js` | exact-equal plan item'a `method` ekle | Değiştir |
| `plugin/test/install-cli.test.js` | method-aware yardımcı testleri | Değiştir |

---

## Task 1: http — `makeFetchJson` (DI'lı JSON fetch)

**Files:**
- Create: `indexer/src/http.js`
- Create test: `indexer/test/http.test.js`

- [ ] **Step 1: Write the failing test** — Create `indexer/test/http.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchJson } from '../src/http.js';

test('makeFetchJson returns parsed JSON on 2xx', async () => {
  const fj = makeFetchJson(async () => ({ ok: true, json: async () => ({ a: 1 }) }));
  assert.deepEqual(await fj('http://x'), { a: 1 });
});

test('makeFetchJson returns null on non-2xx', async () => {
  const fj = makeFetchJson(async () => ({ ok: false, status: 403, json: async () => ({}) }));
  assert.equal(await fj('http://x'), null);
});

test('makeFetchJson returns null on network throw', async () => {
  const fj = makeFetchJson(async () => { throw new Error('ECONNRESET'); });
  assert.equal(await fj('http://x'), null);
});

test('makeFetchJson returns null on invalid JSON', async () => {
  const fj = makeFetchJson(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
  assert.equal(await fj('http://x'), null);
});

test('makeFetchJson passes headers and a default User-Agent', async () => {
  let seen = null;
  const fj = makeFetchJson(async (url, opts) => { seen = opts; return { ok: true, json: async () => ({}) }; });
  await fj('http://x', { headers: { Authorization: 'Bearer t' } });
  assert.equal(seen.headers.Authorization, 'Bearer t');
  assert.ok(seen.headers['User-Agent']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/http.test.js`
Expected: FAIL — "Cannot find module .../http.js".

- [ ] **Step 3: Write minimal implementation** — Create `indexer/src/http.js`:

```javascript
// Minimal JSON fetch wrapper. fetchImpl is injected so tests never hit the network.
// Returns parsed JSON on 2xx, or null on any failure (non-2xx, network error, bad JSON).
export function makeFetchJson(fetchImpl = globalThis.fetch) {
  return async function fetchJson(url, { headers = {} } = {}) {
    let res;
    try {
      res = await fetchImpl(url, { headers: { 'User-Agent': 'cc-autopilot', ...headers } });
    } catch {
      return null;
    }
    if (!res || !res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/http.test.js`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/http.js indexer/test/http.test.js
git commit -m "feat(web-discovery): makeFetchJson — DI JSON fetch wrapper (null on any failure)"
```

---

## Task 2: shared `capabilitiesFromManifest` + DRY known-marketplaces

**Files:**
- Modify: `indexer/src/normalize.js`
- Modify: `indexer/src/sources/known-marketplaces.js`
- Test: `indexer/test/normalize.test.js`

- [ ] **Step 1: Write the failing test** — Append to the END of `indexer/test/normalize.test.js`:

```javascript
import { capabilitiesFromManifest } from '../src/normalize.js';

test('capabilitiesFromManifest builds one plugin cap per manifest plugin', () => {
  const manifest = { plugins: [{ name: 'p1', description: 'd1' }, { name: 'p2' }, { bad: true }] };
  const caps = capabilitiesFromManifest(manifest, {
    marketplace: 'mp', repo: 'github:o/r', discoveredVia: 'github',
    installCommand: (n) => `cmd ${n}`, now: 't'
  });
  assert.equal(caps.length, 2);                       // entry without a name is skipped
  assert.equal(caps[0].id, 'mp::p1::plugin::p1');
  assert.equal(caps[0].kind, 'plugin');
  assert.equal(caps[0].install.command, 'cmd p1');
  assert.equal(caps[0].install.method, 'plugin');
  assert.equal(caps[0].source.repo, 'github:o/r');
  assert.equal(caps[0].source.discoveredVia, 'github');
  assert.equal(caps[0].lastSeen, 't');
});

test('capabilitiesFromManifest returns [] for a manifest with no plugins', () => {
  assert.deepEqual(capabilitiesFromManifest({}, { marketplace: 'm', discoveredVia: 'x', installCommand: () => 'c', now: 't' }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/normalize.test.js`
Expected: FAIL — `capabilitiesFromManifest` is not exported.

- [ ] **Step 3: Write minimal implementation** — In `indexer/src/normalize.js`, add at the END (it already exports `makeCapability` and `deriveKeywords`):

```javascript
// Build plugin capabilities from a marketplace.json manifest. Shared by the
// `known` (local) and `github` (web) sources. installCommand(pluginName) -> string.
export function capabilitiesFromManifest(manifest, { marketplace, repo = null, discoveredVia, installCommand, now }) {
  const caps = [];
  for (const p of manifest?.plugins || []) {
    if (!p || typeof p.name !== 'string' || !p.name) continue;
    caps.push(makeCapability({
      kind: 'plugin', name: p.name, description: p.description || '',
      keywords: deriveKeywords([p.name, p.description].filter(Boolean).join(' ')),
      marketplace, plugin: p.name,
      install: { method: 'plugin', command: installCommand(p.name), package: null },
      cost: null, popularity: {},
      source: { repo, discoveredVia }, now
    }));
  }
  return caps;
}
```

- [ ] **Step 4: Refactor known-marketplaces to use it (DRY)** — In `indexer/src/sources/known-marketplaces.js`, change the import line:

```javascript
import { makeCapability, deriveKeywords } from '../normalize.js';
```
to:
```javascript
import { capabilitiesFromManifest } from '../normalize.js';
```

Then replace the inner `for (const p of manifest.plugins || []) { ... }` loop (the `capabilities.push(makeCapability({...}))` block) with:

```javascript
      const caps = capabilitiesFromManifest(manifest, {
        marketplace: mpName, repo, discoveredVia: 'known',
        installCommand: (n) => `claude plugin install ${n}@${mpName}`, now
      });
      for (const c of caps) capabilities.push(c);
```

(Leave the surrounding `readJson`/`readManifest`/`normalizeRepo` logic untouched. `deriveKeywords`/`makeCapability` are no longer imported here — they moved into the shared helper.)

- [ ] **Step 5: Run tests to verify all pass**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/normalize.test.js test/known-marketplaces.test.js`
Expected: PASS — the existing known-marketplaces tests still pass (identical output), plus the 2 new normalize tests.

- [ ] **Step 6: Commit**

```bash
git add indexer/src/normalize.js indexer/src/sources/known-marketplaces.js indexer/test/normalize.test.js
git commit -m "feat(web-discovery): shared capabilitiesFromManifest; DRY known-marketplaces"
```

---

## Task 3: GitHub source

**Files:**
- Create: `indexer/src/sources/github.js`
- Create test: `indexer/test/github.test.js`

- [ ] **Step 1: Write the failing test** — Create `indexer/test/github.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as github from '../src/sources/github.js';

const NOW = '2026-06-25T00:00:00Z';

const CODE_SEARCH = {
  items: [
    { repository: { full_name: 'Owner/Repo' }, path: '.claude-plugin/marketplace.json' },
    { repository: { full_name: 'Owner/Repo' }, path: '.claude-plugin/marketplace.json' }, // dup
    { repository: { full_name: 'a/b' }, path: '.claude-plugin/marketplace.json' },
    { path: 'no-repo.json' } // malformed, skipped
  ]
};
const MANIFEST = { name: 'cool-mp', plugins: [{ name: 'sec-audit', description: 'Audit security' }] };

test('source name is "github"', () => {
  assert.equal(github.name, 'github');
});

test('parseCodeSearch dedupes repos and skips malformed items', () => {
  const repos = github.parseCodeSearch(CODE_SEARCH);
  assert.deepEqual(repos.map((r) => r.fullName), ['Owner/Repo', 'a/b']);
  assert.deepEqual(repos[0], { owner: 'Owner', repo: 'Repo', fullName: 'Owner/Repo', path: '.claude-plugin/marketplace.json' });
});

test('rawManifestUrl builds a HEAD raw URL', () => {
  assert.equal(
    github.rawManifestUrl({ fullName: 'Owner/Repo', path: '.claude-plugin/marketplace.json' }),
    'https://raw.githubusercontent.com/Owner/Repo/HEAD/.claude-plugin/marketplace.json'
  );
});

test('collect fetches search + manifests and emits candidate plugin caps', async () => {
  const fetchJson = async (url) => {
    if (url.includes('/search/code')) return CODE_SEARCH;
    if (url.includes('raw.githubusercontent.com/Owner/Repo')) return MANIFEST;
    return null; // a/b has no manifest -> skipped
  };
  const res = await github.collect({ fetchJson, now: NOW, githubToken: null });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 1);
  const c = res.capabilities[0];
  assert.equal(c.kind, 'plugin');
  assert.equal(c.name, 'sec-audit');
  assert.equal(c.source.discoveredVia, 'github');
  assert.equal(c.source.repo, 'github:owner/repo');
  assert.equal(c.install.method, 'plugin');
  assert.equal(c.install.command, 'claude plugin marketplace add Owner/Repo && claude plugin install sec-audit@cool-mp');
});

test('collect returns ok:false when the search call fails', async () => {
  const res = await github.collect({ fetchJson: async () => null, now: NOW, githubToken: null });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/github.test.js`
Expected: FAIL — "Cannot find module .../github.js".

- [ ] **Step 3: Write minimal implementation** — Create `indexer/src/sources/github.js`:

```javascript
import { capabilitiesFromManifest } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'github';

const CODE_SEARCH_URL =
  'https://api.github.com/search/code?q=filename:marketplace.json+path:.claude-plugin&per_page=30';
const REPO_CAP = 30;

export function parseCodeSearch(json, cap = REPO_CAP) {
  const items = Array.isArray(json?.items) ? json.items : [];
  const repos = [];
  const seen = new Set();
  for (const it of items) {
    const fullName = it?.repository?.full_name;
    const path = it?.path;
    if (!fullName || !path || seen.has(fullName)) continue;
    const [owner, repo] = String(fullName).split('/');
    if (!owner || !repo) continue;
    seen.add(fullName);
    repos.push({ owner, repo, fullName, path });
  }
  return repos.slice(0, cap);
}

export function rawManifestUrl({ fullName, path }) {
  return `https://raw.githubusercontent.com/${fullName}/HEAD/${path}`;
}

export async function collect(ctx) {
  const { fetchJson, now, githubToken = null, log = () => {} } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };

  const headers = { Accept: 'application/vnd.github+json' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const search = await fetchJson(CODE_SEARCH_URL, { headers });
  if (!search) return { capabilities: [], ok: false, error: 'github code search failed (rate-limit/auth?)' };

  const capabilities = [];
  for (const r of parseCodeSearch(search)) {
    try {
      const manifest = await fetchJson(rawManifestUrl(r));
      if (!manifest) { log(`github: no manifest for ${r.fullName}`); continue; }
      const marketplace = manifest.name || `${r.owner}-${r.repo}`;
      const caps = capabilitiesFromManifest(manifest, {
        marketplace,
        repo: normalizeRepo(r.fullName),
        discoveredVia: 'github',
        installCommand: (n) => `claude plugin marketplace add ${r.fullName} && claude plugin install ${n}@${marketplace}`,
        now
      });
      for (const c of caps) capabilities.push(c);
    } catch (e) {
      log(`github: skipping ${r.fullName}: ${e.message}`);
    }
  }
  return { capabilities, ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/github.test.js`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/sources/github.js indexer/test/github.test.js
git commit -m "feat(web-discovery): github source (code-search -> marketplace plugins, candidate tier)"
```

---

## Task 4: npm source

**Files:**
- Create: `indexer/src/sources/npm.js`
- Create test: `indexer/test/npm.test.js`

- [ ] **Step 1: Write the failing test** — Create `indexer/test/npm.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as npm from '../src/sources/npm.js';

const NOW = '2026-06-25T00:00:00Z';

test('source name is "npm"', () => {
  assert.equal(npm.name, 'npm');
});

test('isLikelyMcpServer accepts mcp servers and rejects unrelated packages', () => {
  assert.equal(npm.isLikelyMcpServer({ name: 'foo-mcp-server', keywords: ['mcp', 'server'] }), true);
  assert.equal(npm.isLikelyMcpServer({ name: 'server-foo', keywords: ['model-context-protocol'] }), true);
  assert.equal(npm.isLikelyMcpServer({ name: 'mcp-thing', keywords: ['mcp'] }), true);          // name signal
  assert.equal(npm.isLikelyMcpServer({ name: 'random-lib', keywords: ['mcp'] }), false);        // no server signal
  assert.equal(npm.isLikelyMcpServer({ name: 'unrelated', keywords: ['http'] }), false);        // no mcp keyword
});

test('extractRepo pulls owner/repo from various repository url shapes', () => {
  assert.equal(npm.extractRepo({ links: { repository: 'https://github.com/Owner/Repo' } }), 'github:owner/repo');
  assert.equal(npm.extractRepo({ repository: { url: 'git+https://github.com/o/r.git' } }), 'github:o/r');
  assert.equal(npm.extractRepo({ repository: 'github.com/a/b' }), 'github:a/b');
  assert.equal(npm.extractRepo({}), null);
});

test('parseNpmSearch emits candidate mcp caps for likely servers only', () => {
  const json = { objects: [
    { package: { name: 'cool-mcp-server', description: 'An MCP server', keywords: ['mcp', 'server'], links: { repository: 'https://github.com/o/r' } } },
    { package: { name: 'random-lib', description: 'x', keywords: ['http'] } } // filtered out
  ] };
  const caps = npm.parseNpmSearch(json, { now: NOW });
  assert.equal(caps.length, 1);
  const c = caps[0];
  assert.equal(c.kind, 'mcp');
  assert.equal(c.name, 'cool-mcp-server');
  assert.equal(c.marketplace, 'npm');
  assert.equal(c.source.discoveredVia, 'npm');
  assert.equal(c.source.repo, 'github:o/r');
  assert.equal(c.install.method, 'mcp');
  assert.equal(c.install.package, 'cool-mcp-server');
  assert.equal(c.install.command, 'claude mcp add cool-mcp-server -- npx -y cool-mcp-server');
});

test('collect fetches search and parses', async () => {
  const json = { objects: [{ package: { name: 'x-mcp', description: 'd', keywords: ['mcp', 'server'] } }] };
  const res = await npm.collect({ fetchJson: async () => json, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 1);
});

test('collect returns ok:false when the search call fails', async () => {
  const res = await npm.collect({ fetchJson: async () => null, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/npm.test.js`
Expected: FAIL — "Cannot find module .../npm.js".

- [ ] **Step 3: Write minimal implementation** — Create `indexer/src/sources/npm.js`:

```javascript
import { makeCapability, deriveKeywords } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'npm';

const SEARCH_URL = 'https://registry.npmjs.org/-/v1/search?text=keywords:mcp&size=50';
const PKG_CAP = 50;

export function isLikelyMcpServer(pkg) {
  const name = String(pkg?.name || '').toLowerCase();
  const kws = (Array.isArray(pkg?.keywords) ? pkg.keywords : []).map((k) => String(k).toLowerCase());
  const hasMcpKw = kws.includes('mcp') || kws.includes('model-context-protocol');
  const serverSignal = kws.includes('server') || kws.includes('model-context-protocol') ||
    /(^|[-_/])mcp([-_/]|$)/.test(name) || /(^|[-_/])server([-_/]|$)/.test(name);
  return hasMcpKw && serverSignal;
}

export function extractRepo(pkg) {
  const raw = pkg?.links?.repository ||
    (typeof pkg?.repository === 'string' ? pkg.repository : pkg?.repository?.url) || '';
  const m = String(raw).match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return m ? normalizeRepo(`${m[1]}/${m[2]}`) : null;
}

function shortName(pkgName) {
  const base = String(pkgName).split('/').pop() || String(pkgName);
  return base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp';
}

export function parseNpmSearch(json, { now, cap = PKG_CAP } = {}) {
  const objects = Array.isArray(json?.objects) ? json.objects : [];
  const caps = [];
  for (const o of objects) {
    const pkg = o?.package;
    if (!pkg?.name || !isLikelyMcpServer(pkg)) continue;
    const keywords = [...new Set([
      ...(Array.isArray(pkg.keywords) ? pkg.keywords.map((k) => String(k)) : []),
      ...deriveKeywords([pkg.name, pkg.description].filter(Boolean).join(' '))
    ])];
    caps.push(makeCapability({
      kind: 'mcp', name: pkg.name, description: pkg.description || '', keywords,
      marketplace: 'npm', plugin: pkg.name,
      install: { method: 'mcp', command: `claude mcp add ${shortName(pkg.name)} -- npx -y ${pkg.name}`, package: pkg.name },
      cost: null, popularity: {},
      source: { repo: extractRepo(pkg), discoveredVia: 'npm' }, now
    }));
    if (caps.length >= cap) break;
  }
  return caps;
}

export async function collect(ctx) {
  const { fetchJson, now } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
  const json = await fetchJson(SEARCH_URL);
  if (!json) return { capabilities: [], ok: false, error: 'npm search failed' };
  return { capabilities: parseNpmSearch(json, { now }), ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/npm.test.js`
Expected: PASS (6 tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/sources/npm.js indexer/test/npm.test.js
git commit -m "feat(web-discovery): npm source (keywords:mcp search -> MCP server caps, candidate tier)"
```

---

## Task 5: register sources + inject fetchJson + scan tests

**Files:**
- Modify: `indexer/src/sources/index.js`
- Modify: `indexer/src/cli.js` (runScan)
- Modify: `indexer/test/sources-index.test.js`
- Modify: `indexer/test/run-scan.test.js`

- [ ] **Step 1: Update sources-index test** — Replace the contents of `indexer/test/sources-index.test.js` with:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sources } from '../src/sources/index.js';

test('registry exposes all local + web sources with the contract shape', () => {
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin', 'github', 'npm']);
  for (const s of sources) {
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.collect, 'function');
  }
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js`
Expected: FAIL — names are `['official','known','builtin']`, missing github/npm.

- [ ] **Step 3: Register the sources** — Replace `indexer/src/sources/index.js` with:

```javascript
import * as official from './official-catalog.js';
import * as known from './known-marketplaces.js';
import * as builtin from './builtin-catalog.js';
import * as github from './github.js';
import * as npm from './npm.js';

// Ordered by authority. official/known/builtin are local; github/npm are web-discovery
// (network via injected ctx.fetchJson; fail-soft when offline/rate-limited).
export const sources = [official, known, builtin, github, npm];
```

- [ ] **Step 4: Inject fetchJson + githubToken in runScan** — In `indexer/src/cli.js`:

(a) Add the import near the top (after the `import { sources } ...` line):
```javascript
import { makeFetchJson } from './http.js';
```

(b) In `runScan`, just after the line `const log = opts.log || (() => {});`, add:
```javascript
  const fetchJson = opts.fetchJson || makeFetchJson();
  const githubToken = opts.githubToken ?? process.env.GITHUB_TOKEN ?? null;
```

(c) In the `for (const src of sources)` loop, change the collect call from:
```javascript
      const res = await src.collect({ sourcePaths: paths.sourcePaths, prevState: {}, now, log });
```
to:
```javascript
      const res = await src.collect({ sourcePaths: paths.sourcePaths, prevState: {}, now, log, fetchJson, githubToken });
```

- [ ] **Step 5: Update run-scan test (no network) + add integration test** — In `indexer/test/run-scan.test.js`:

(a) In the existing `runScan({ ... })` call, add `fetchJson: async () => null,` (so github/npm make no network call and return ok:false empty). The call becomes:
```javascript
  const map = await runScan({
    dataDir,
    trustedSources: trusted,
    officialCatalog: OFFICIAL,
    knownMarketplaces: '/no/such/known.json',
    fetchJson: async () => null,
    now: NOW
  });
```

(b) Append a new integration test to the END of the file:
```javascript
test('runScan integrates github + npm caps via injected fetchJson (candidate tier)', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cc-scan-web-'));
  const trusted = path.join(dataDir, 'trusted.json');
  await (await import('node:fs/promises')).writeFile(trusted, JSON.stringify({ sources: [] }), 'utf8');

  const CODE_SEARCH = { items: [{ repository: { full_name: 'o/r' }, path: '.claude-plugin/marketplace.json' }] };
  const MANIFEST = { name: 'mp', plugins: [{ name: 'webskill', description: 'a web plugin' }] };
  const NPM_SEARCH = { objects: [{ package: { name: 'x-mcp', description: 'd', keywords: ['mcp', 'server'], links: { repository: 'https://github.com/o/r2' } } }] };
  const fetchJson = async (url) => {
    if (url.includes('/search/code')) return CODE_SEARCH;
    if (url.includes('raw.githubusercontent.com')) return MANIFEST;
    if (url.includes('registry.npmjs.org')) return NPM_SEARCH;
    return null;
  };

  const map = await runScan({
    dataDir, trustedSources: trusted,
    officialCatalog: '/no/such/official.json', knownMarketplaces: '/no/such/known.json',
    fetchJson, githubToken: null, now: NOW
  });

  const gh = map.capabilities.find((c) => c.source.discoveredVia === 'github');
  const np = map.capabilities.find((c) => c.source.discoveredVia === 'npm');
  assert.ok(gh, 'github cap present');
  assert.ok(np, 'npm cap present');
  assert.equal(gh.trust, 'candidate');                 // repo present, not in trusted set
  assert.equal(np.trust, 'candidate');
  assert.equal(map.sources.github.count, 1);
  assert.equal(map.sources.npm.count, 1);

  await rm(dataDir, { recursive: true, force: true });
});
```

- [ ] **Step 6: Run the scan + sources tests**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js test/run-scan.test.js`
Expected: PASS — sources-index (1), run-scan original + new integration (2).

Then the full indexer suite:
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add indexer/src/sources/index.js indexer/src/cli.js indexer/test/sources-index.test.js indexer/test/run-scan.test.js
git commit -m "feat(web-discovery): register github+npm, inject fetchJson in runScan (candidate tier live)"
```

---

## Task 6: method-aware installer

**Files:**
- Modify: `plugin/lib/installer.js`
- Modify: `plugin/lib/cli.js`
- Modify: `plugin/test/installer.test.js`
- Modify: `plugin/test/install-cli.test.js`

- [ ] **Step 1: Update the failing tests**

(a) In `plugin/test/installer.test.js`, the exact-equal assertion on line ~15 must include the new `method` field. Change:
```javascript
  assert.deepEqual(plan, [{ id: 'mp::p::skill::a', command: 'claude plugin install mp::p::skill::a', trust: 'trusted', mode: 'auto' }]);
```
to:
```javascript
  assert.deepEqual(plan, [{ id: 'mp::p::skill::a', command: 'claude plugin install mp::p::skill::a', trust: 'trusted', mode: 'auto', method: 'plugin' }]);
```

Append a new test to the END of `plugin/test/installer.test.js`:
```javascript
test('planInstalls carries install.method (mcp vs plugin)', () => {
  const map = { capabilities: [
    { id: 'npm::x::mcp', trust: 'candidate', install: { method: 'mcp', command: 'claude mcp add x -- npx -y x' } },
    { id: 'mp::p::skill::a', trust: 'trusted', install: { method: 'plugin', command: 'claude plugin install p@mp' } }
  ] };
  const plan = planInstalls({ installs: ['npm::x::mcp', 'mp::p::skill::a'] }, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.method), ['mcp', 'plugin']);
});
```

(b) Append method-aware helper tests to the END of `plugin/test/install-cli.test.js` (it already imports from `../lib/cli.js`; add the new names to that import). Change the import:
```javascript
import { runInstall, pluginListed, realEnv } from '../lib/cli.js';
```
to:
```javascript
import { runInstall, pluginListed, realEnv, verifyCmdFor, mcpListed, listed } from '../lib/cli.js';
```
Then append:
```javascript
test('verifyCmdFor maps install method to the right list command', () => {
  assert.equal(verifyCmdFor('plugin'), 'claude plugin list');
  assert.equal(verifyCmdFor('mcp'), 'claude mcp list');
  assert.equal(verifyCmdFor('other'), null);          // unknown -> trust exit code
});

test('mcpListed matches the registered mcp name from the add command, collision-safe', () => {
  const item = { command: 'claude mcp add my-server -- npx -y @scope/pkg' };
  assert.equal(mcpListed('my-server  npx ...\n', item), true);
  assert.equal(mcpListed('my-server-extra\n', item), false);   // word boundary, no substring collision
  assert.equal(mcpListed('something-else', item), false);
});

test('listed dispatches by method (mcp vs plugin)', () => {
  const mcpItem = { method: 'mcp', command: 'claude mcp add srv -- npx -y p' };
  const pluginItem = { method: 'plugin', id: 'mp::api-sec::skill::x' };
  assert.equal(listed('mcp', 'srv\n', mcpItem), true);
  assert.equal(listed('plugin', 'api-sec@mp\n', pluginItem), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/installer.test.js test/install-cli.test.js`
Expected: FAIL — installer exact-equal mismatch (no `method`); `verifyCmdFor`/`mcpListed`/`listed` not exported.

- [ ] **Step 3a: Add `method` to planInstalls** — In `plugin/lib/installer.js`, change the `plan.push(...)` line in `planInstalls` from:
```javascript
    plan.push({ id, command, trust: cap.trust, mode });
```
to:
```javascript
    plan.push({ id, command, trust: cap.trust, mode, method: cap.install?.method ?? 'plugin' });
```

- [ ] **Step 3b: Add the method-aware helpers + make realEnv method-aware** — In `plugin/lib/cli.js`:

(i) Add these exports just below the existing `pluginListed` function:
```javascript
export function verifyCmdFor(method) {
  if (method === 'plugin') return 'claude plugin list';
  if (method === 'mcp') return 'claude mcp list';
  return null;                                   // unknown -> trust exit code
}

// The mcp server is registered under the name in `claude mcp add <name> -- ...`,
// so verify by matching that name (not the package) in `claude mcp list`.
export function mcpListed(listText, item) {
  const m = String(item?.command || '').match(/mcp add\s+(\S+)/);
  const nameTok = m ? m[1] : '';
  if (!nameTok) return false;
  return new RegExp(`(^|[^\\w-])${escapeRegex(nameTok)}([^\\w-]|$)`).test(String(listText));
}

export function listed(method, listText, item) {
  return method === 'mcp' ? mcpListed(listText, item) : pluginListed(listText, item.id);
}
```

(ii) Replace the `probePluginList` function with a generalized `probeList(cmd)`:
```javascript
async function probeList(cmd) {
  try {
    const { stdout } = await pexec(cmd);
    return { ok: true, text: stdout };
  } catch {
    return { ok: false, text: '' };
  }
}
```

(iii) Replace the `realEnv` `isInstalled` and `verify` functions with method-aware versions:
```javascript
    isInstalled: async (item) => {
      const cmd = verifyCmdFor(item.method);
      if (!cmd) return false;                       // unknown method -> attempt install
      const p = await probeList(cmd);
      return p.ok && listed(item.method, p.text, item);
    },
    verify: async (item) => {
      const cmd = verifyCmdFor(item.method);
      if (!cmd) { log('uyarı: bilinmeyen kurulum yöntemi — exit-code güveniliyor'); return true; }
      const p = await probeList(cmd);
      if (!p.ok) { log('uyarı: kurulum doğrulanamadı (list komutu yok) — exit-code güveniliyor'); return true; }
      return listed(item.method, p.text, item);
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/installer.test.js test/install-cli.test.js`
Expected: PASS.

Then the full plugin suite:
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/installer.js plugin/lib/cli.js plugin/test/installer.test.js plugin/test/install-cli.test.js
git commit -m "feat(web-discovery): method-aware install verify (plugin list vs mcp list)"
```

---

## Task 7: uçtan-uca doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Full suites**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all green (indexer ~62, plugin ~99 — was 141 total, now ~161).

- [ ] **Step 2: Live scan (network-dependent, fail-soft)**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node src/cli.js scan && node src/cli.js status
```
Expected: scan completes regardless of network. If network + (for github) `GITHUB_TOKEN` available: `status` shows `bySource:` including `github` and/or `npm` > 0, and `byTrust:` includes `candidate` > 0. If offline/rate-limited: github/npm contribute 0 (fail-soft) and scan still succeeds — this is acceptable per the spec.
Note: to exercise github, set `GITHUB_TOKEN` first (`export GITHUB_TOKEN=...`); npm needs no token.

- [ ] **Step 3: Candidate flow via the plugin CLI (uses whatever the live scan produced)**

If the live scan produced any `candidate` cap, pick its id from `status`/the map and verify the install plan marks it `needs-approval`:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin
printf '%s' '{"decision":"install_then_use","capabilities":["<CANDIDATE_ID>"],"installs":["<CANDIDATE_ID>"],"method":"x","rationale":"r","confidence":0.9}' > /c/tmp/cc-cand.json
node lib/cli.js install /c/tmp/cc-cand.json
rm -f /c/tmp/cc-cand.json
```
Expected: the result line shows `needs-approval: <CANDIDATE_ID>` (untrusted approval path is now alive). If the live scan produced no candidate (offline), state that and rely on the integration test (Task 5) which proves the wiring deterministically.

- [ ] **Step 4: Confirm clean working tree**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git status -s`
Expected: only pre-existing untracked junk (if any); no stray scratch files staged. (`capability-map.json` is gitignored — not committed.)

---

## Tamamlanma Kriteri (spec §9 ile eşleşir)

- [ ] `node src/cli.js scan` ağ+token varsa github/npm candidate cap'leri üretir; yoksa fail-soft (boş, scan başarılı).
- [ ] candidate cap'ler matcher'da görünür, konsey seçebilir, installer onay yolu (`needs-approval`) tetiklenir.
- [ ] Installer method-aware: plugin→`claude plugin list`, mcp→`claude mcp list`.
- [ ] Testler ağa çıkmadan tüm yolları kapsar; tüm testler yeşil; teknik borç yok.
