# mcp-registry Keşif Source'u (SP8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resmî MCP Registry'yi (`registry.modelcontextprotocol.io`) bir indexer keşif source'u olarak ekleyip, hem paket-tabanlı (npm/pypi) hem remote (http/sse) MCP server'larını `candidate` tier cap'leri olarak üretmek; installer'ın `mcpListed` doğrulamasını flag-önekli `claude mcp add` komutlarına karşı sertleştirmek.

**Architecture:** SP7'deki npm/github source deseninin birebir aynısı — saf `parse*(json)` yardımcıları (fixture'larla tam test) + ince `collect(ctx)` (DI'lı `ctx.fetchJson` ile fetch + parse + fail-soft). Yeni source mevcut `{ name, collect(ctx) }` sözleşmesini izler; `dedupe.js`'te `mcp-registry` zaten `npm`'den yüksek önceliklidir (rank 3 < 4).

**Tech Stack:** Node.js ESM (sıfır bağımlılık, global `fetch`), test runner = Node built-in `node --test`.

> **Node ortamı:** Node/npm sistem PATH'inde DEĞİL. Tüm komutlardan ÖNCE (Git Bash):
> ```bash
> export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
> ```
> **Branch:** Zaten `feat/mcp-registry` dalındayız (spec bu dalda commit'li). Tüm task'lar bu dala.
> **Git Bash kararsız** (msys fork crash riski). Git komutları crash ederse PowerShell ile tekrar dene.

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|-------|-----------|-------|
| `indexer/src/sources/mcp-registry.js` | MCP Registry keşif source (saf helpers + collect) | **Oluştur** |
| `indexer/test/fixtures/mcp-registry.sample.json` | registry yanıt fixture'ı | **Oluştur** |
| `indexer/test/mcp-registry.test.js` | source testleri | **Oluştur** |
| `indexer/src/sources/index.js` | mcp-registry kaydı | Değiştir |
| `indexer/test/sources-index.test.js` | registry listesi | Değiştir |
| `indexer/test/run-scan.test.js` | entegrasyon testi | Değiştir |
| `plugin/lib/cli.js` | `mcpAddName` + `mcpListed` sertleştirme | Değiştir |
| `plugin/test/install-cli.test.js` | remote-form regresyon testleri | Değiştir |

---

## Task 1: mcp-registry source (saf helpers + parseRegistry + collect)

**Files:**
- Create: `indexer/src/sources/mcp-registry.js`
- Create: `indexer/test/fixtures/mcp-registry.sample.json`
- Create test: `indexer/test/mcp-registry.test.js`

- [ ] **Step 1: Write the fixture** — Create `indexer/test/fixtures/mcp-registry.sample.json`:

```json
{
  "servers": [
    {
      "server": {
        "name": "io.github.foo/npm-srv",
        "description": "An npm MCP server",
        "title": "NPM Srv",
        "version": "1.0.0",
        "repository": { "url": "https://github.com/foo/npm-srv", "source": "github" },
        "packages": [{ "registryType": "npm", "identifier": "@foo/npm-srv", "version": "1.0.0", "transport": { "type": "stdio" } }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": false } }
    },
    {
      "server": {
        "name": "io.github.foo/npm-srv",
        "description": "An npm MCP server (newer)",
        "title": "NPM Srv",
        "version": "2.0.0",
        "repository": { "url": "https://github.com/foo/npm-srv", "source": "github" },
        "packages": [{ "registryType": "npm", "identifier": "@foo/npm-srv", "version": "2.0.0", "transport": { "type": "stdio" } }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    },
    {
      "server": {
        "name": "ai.adeu/adeu",
        "description": "A pypi MCP server",
        "version": "1.5.2",
        "repository": { "url": "https://github.com/dealfluence/adeu", "source": "github" },
        "packages": [{ "registryType": "pypi", "identifier": "adeu", "version": "1.5.2", "transport": { "type": "stdio" } }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    },
    {
      "server": {
        "name": "ac.inference.sh/mcp",
        "description": "A remote http MCP server",
        "version": "1.0.1",
        "remotes": [{ "type": "streamable-http", "url": "https://api.inference.sh/mcp" }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    },
    {
      "server": {
        "name": "com.example/sse-srv",
        "description": "A remote sse MCP server",
        "version": "1.0.0",
        "remotes": [{ "type": "sse", "url": "https://example.com/sse" }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    },
    {
      "server": {
        "name": "com.example/oci-only",
        "description": "Docker only, not installable by us",
        "version": "1.0.0",
        "packages": [{ "registryType": "oci", "identifier": "example/img", "version": "1.0.0" }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    },
    {
      "server": {
        "name": "com.example/no-targets",
        "description": "No packages and no remotes",
        "version": "1.0.0"
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    },
    {
      "server": {
        "name": "com.evil/injection",
        "description": "Unsafe identifier",
        "version": "1.0.0",
        "packages": [{ "registryType": "npm", "identifier": "evil && rm -rf /", "version": "1.0.0", "transport": { "type": "stdio" } }]
      },
      "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    }
  ],
  "metadata": { "nextCursor": "x", "count": 8 }
}
```

- [ ] **Step 2: Write the failing test** — Create `indexer/test/mcp-registry.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as reg from '../src/sources/mcp-registry.js';

const NOW = '2026-06-26T00:00:00Z';
const FIXT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mcp-registry.sample.json');
async function fixture() { return JSON.parse(await readFile(FIXT, 'utf8')); }

test('source name is "mcp-registry"', () => {
  assert.equal(reg.name, 'mcp-registry');
});

test('serverName folds the whole namespaced name into a collision-safe token', () => {
  assert.equal(reg.serverName('ai.adeu/adeu'), 'ai-adeu-adeu');
  assert.equal(reg.serverName('ac.inference.sh/mcp'), 'ac-inference-sh-mcp');
  assert.equal(reg.serverName('io.github.foo/npm-srv'), 'io-github-foo-npm-srv');
  assert.equal(reg.serverName('///'), 'mcp');                 // degenerate -> fallback
});

test('extractRepo pulls github owner/repo from repository.url', () => {
  assert.equal(reg.extractRepo({ repository: { url: 'https://github.com/Foo/Bar' } }), 'github:foo/bar');
  assert.equal(reg.extractRepo({ repository: { url: 'https://gitlab.com/a/b' } }), null);
  assert.equal(reg.extractRepo({}), null);
});

test('installFor builds npm/pypi package commands (name-first)', () => {
  const npmSrv = { name: 'io.github.foo/npm-srv', packages: [{ registryType: 'npm', identifier: '@foo/npm-srv' }] };
  assert.deepEqual(reg.installFor(npmSrv), { method: 'mcp', command: 'claude mcp add io-github-foo-npm-srv -- npx -y @foo/npm-srv', package: '@foo/npm-srv' });
  const pypiSrv = { name: 'ai.adeu/adeu', packages: [{ registryType: 'pypi', identifier: 'adeu' }] };
  assert.deepEqual(reg.installFor(pypiSrv), { method: 'mcp', command: 'claude mcp add ai-adeu-adeu -- uvx adeu', package: 'adeu' });
});

test('installFor builds remote http/sse commands (flags before name)', () => {
  const http = { name: 'ac.inference.sh/mcp', remotes: [{ type: 'streamable-http', url: 'https://api.inference.sh/mcp' }] };
  assert.deepEqual(reg.installFor(http), { method: 'mcp', command: 'claude mcp add --transport http ac-inference-sh-mcp https://api.inference.sh/mcp', package: null });
  const sse = { name: 'com.example/sse-srv', remotes: [{ type: 'sse', url: 'https://example.com/sse' }] };
  assert.deepEqual(reg.installFor(sse), { method: 'mcp', command: 'claude mcp add --transport sse com-example-sse-srv https://example.com/sse', package: null });
});

test('installFor returns null for oci-only, no-targets, and unsafe values', () => {
  assert.equal(reg.installFor({ name: 'x/y', packages: [{ registryType: 'oci', identifier: 'a/b' }] }), null);
  assert.equal(reg.installFor({ name: 'x/y' }), null);
  assert.equal(reg.installFor({ name: 'x/y', packages: [{ registryType: 'npm', identifier: 'evil && rm -rf /' }] }), null);
  assert.equal(reg.installFor({ name: 'x/y', remotes: [{ type: 'streamable-http', url: 'http://insecure.com/x' }] }), null); // not https
});

test('parseRegistry dedupes to latest, skips non-installable, builds candidate-shaped caps', async () => {
  const caps = reg.parseRegistry(await fixture(), { now: NOW });
  // npm(latest only) + pypi + http + sse = 4; oci/no-targets/injection skipped; npm-srv dup folded
  assert.equal(caps.length, 4);

  const npmCap = caps.find((c) => c.id === 'mcp-registry::io.github.foo/npm-srv::mcp');
  assert.ok(npmCap, 'npm cap present');
  assert.equal(npmCap.kind, 'mcp');
  assert.equal(npmCap.description, 'An npm MCP server (newer)');  // latest version won
  assert.equal(npmCap.source.discoveredVia, 'mcp-registry');
  assert.equal(npmCap.source.repo, 'github:foo/npm-srv');
  assert.equal(npmCap.install.command, 'claude mcp add io-github-foo-npm-srv -- npx -y @foo/npm-srv');
  assert.equal(npmCap.lastSeen, NOW);

  assert.ok(caps.some((c) => c.install.command.includes('--transport http')));
  assert.ok(caps.some((c) => c.install.command.includes('--transport sse')));
});

test('parseRegistry applies the per-source cap', async () => {
  const caps = reg.parseRegistry(await fixture(), { now: NOW, cap: 1 });
  assert.equal(caps.length, 1);
});

test('collect fetches and parses via injected fetchJson', async () => {
  const json = await fixture();
  const res = await reg.collect({ fetchJson: async () => json, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 4);
});

test('collect returns ok:false when the fetch fails', async () => {
  const res = await reg.collect({ fetchJson: async () => null, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});

test('collect returns ok:false when fetchJson is not a function', async () => {
  const res = await reg.collect({ now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/mcp-registry.test.js`
Expected: FAIL — "Cannot find module .../mcp-registry.js".

- [ ] **Step 4: Write minimal implementation** — Create `indexer/src/sources/mcp-registry.js`:

```javascript
import { makeCapability, deriveKeywords } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'mcp-registry';

const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers?limit=100';
const SERVER_CAP = 100;
const OFFICIAL_META = 'io.modelcontextprotocol.registry/official';
// Package identifier is interpolated into a shell-run install command; validate
// defensively (npm SAFE_PKG ile aynı, incl. @scope/name).
const SAFE_IDENT = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
// Remote url: https only, no shell metacharacters / whitespace.
const SAFE_URL = /^https:\/\/[^\s`'"&|;<>$()]+$/;

// Fold the whole namespaced registry name into a collision-safe `claude mcp add` name
// (SP7 npm-fix lesson: never emit a bare generic token like "mcp").
export function serverName(regName) {
  const cleaned = String(regName).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'mcp';
}

export function extractRepo(server) {
  const url = server?.repository?.url || '';
  const m = String(url).match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return m ? normalizeRepo(`${m[1]}/${m[2]}`) : null;
}

// Pick the install target, preferring packages (npm > pypi) then remotes (http > sse).
// Returns { method:'mcp', command, package } or null if nothing safely installable.
export function installFor(server) {
  const nm = serverName(server?.name);
  const packages = Array.isArray(server?.packages) ? server.packages : [];
  const npmPkg = packages.find((p) => p?.registryType === 'npm' && SAFE_IDENT.test(String(p.identifier || '')));
  if (npmPkg) return { method: 'mcp', command: `claude mcp add ${nm} -- npx -y ${npmPkg.identifier}`, package: npmPkg.identifier };
  const pypiPkg = packages.find((p) => p?.registryType === 'pypi' && SAFE_IDENT.test(String(p.identifier || '')));
  if (pypiPkg) return { method: 'mcp', command: `claude mcp add ${nm} -- uvx ${pypiPkg.identifier}`, package: pypiPkg.identifier };
  const remotes = Array.isArray(server?.remotes) ? server.remotes : [];
  const http = remotes.find((r) => r?.type === 'streamable-http' && SAFE_URL.test(String(r.url || '')));
  if (http) return { method: 'mcp', command: `claude mcp add --transport http ${nm} ${http.url}`, package: null };
  const sse = remotes.find((r) => r?.type === 'sse' && SAFE_URL.test(String(r.url || '')));
  if (sse) return { method: 'mcp', command: `claude mcp add --transport sse ${nm} ${sse.url}`, package: null };
  return null;
}

function isLatest(entry) {
  return entry?._meta?.[OFFICIAL_META]?.isLatest === true;
}

// Dedupe to one entry per server name: prefer isLatest === true, else first seen.
function dedupeToLatest(entries) {
  const byName = new Map();
  for (const e of entries) {
    const nm = e?.server?.name;
    if (!nm) continue;
    const existing = byName.get(nm);
    if (!existing) { byName.set(nm, e); continue; }
    if (!isLatest(existing) && isLatest(e)) byName.set(nm, e);
  }
  return [...byName.values()];
}

export function parseRegistry(json, { now, cap = SERVER_CAP } = {}) {
  const entries = Array.isArray(json?.servers) ? json.servers : [];
  const caps = [];
  for (const entry of dedupeToLatest(entries)) {
    const server = entry.server;
    const install = installFor(server);
    if (!install) continue;                         // oci-only / no target / unsafe -> skip
    caps.push(makeCapability({
      kind: 'mcp', name: server.name, description: server.description || '',
      keywords: deriveKeywords([server.name, server.title, server.description].filter(Boolean).join(' ')),
      marketplace: 'mcp-registry', plugin: server.name,
      install, cost: null, popularity: {},
      source: { repo: extractRepo(server), discoveredVia: 'mcp-registry' }, now
    }));
    if (caps.length >= cap) break;
  }
  return caps;
}

export async function collect(ctx) {
  const { fetchJson, now } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
  const json = await fetchJson(REGISTRY_URL);
  if (!json) return { capabilities: [], ok: false, error: 'mcp registry search failed' };
  return { capabilities: parseRegistry(json, { now }), ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/mcp-registry.test.js`
Expected: PASS (11 tests green).

- [ ] **Step 6: Commit**

```bash
git add indexer/src/sources/mcp-registry.js indexer/test/mcp-registry.test.js indexer/test/fixtures/mcp-registry.sample.json
git commit -m "feat(mcp-registry): official MCP registry source (packages npm/pypi + remotes http/sse, candidate tier)"
```

---

## Task 2: register source + run-scan integration test

**Files:**
- Modify: `indexer/src/sources/index.js`
- Modify: `indexer/test/sources-index.test.js`
- Modify: `indexer/test/run-scan.test.js`

- [ ] **Step 1: Update sources-index test** — In `indexer/test/sources-index.test.js`, change the `assert.deepEqual` line from:

```javascript
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin', 'github', 'npm']);
```
to:
```javascript
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin', 'github', 'npm', 'mcp-registry']);
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js`
Expected: FAIL — names list is missing `mcp-registry`.

- [ ] **Step 3: Register the source** — Replace `indexer/src/sources/index.js` with:

```javascript
import * as official from './official-catalog.js';
import * as known from './known-marketplaces.js';
import * as builtin from './builtin-catalog.js';
import * as github from './github.js';
import * as npm from './npm.js';
import * as mcpRegistry from './mcp-registry.js';

// Ordered by authority. official/known/builtin are local; github/npm/mcp-registry are
// web-discovery (network via injected ctx.fetchJson; fail-soft when offline/rate-limited).
export const sources = [official, known, builtin, github, npm, mcpRegistry];
```

- [ ] **Step 4: Add run-scan integration test** — Append to the END of `indexer/test/run-scan.test.js`:

```javascript
test('runScan integrates mcp-registry caps via injected fetchJson (candidate tier)', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cc-scan-reg-'));
  const trusted = path.join(dataDir, 'trusted.json');
  await (await import('node:fs/promises')).writeFile(trusted, JSON.stringify({ sources: [] }), 'utf8');

  const REG = { servers: [
    { server: { name: 'io.github.foo/srv', description: 'd', version: '1.0.0',
      repository: { url: 'https://github.com/foo/srv' },
      packages: [{ registryType: 'npm', identifier: '@foo/srv' }] },
      _meta: { 'io.modelcontextprotocol.registry/official': { isLatest: true } } }
  ] };
  const fetchJson = async (url) => (url.includes('registry.modelcontextprotocol.io') ? REG : null);

  const map = await runScan({
    dataDir, trustedSources: trusted,
    officialCatalog: '/no/such/official.json', knownMarketplaces: '/no/such/known.json',
    fetchJson, githubToken: null, now: NOW
  });

  const rc = map.capabilities.find((c) => c.source.discoveredVia === 'mcp-registry');
  assert.ok(rc, 'mcp-registry cap present');
  assert.equal(rc.trust, 'candidate');                 // repo present, not in trusted set
  assert.equal(rc.install.method, 'mcp');
  assert.equal(map.sources['mcp-registry'].count, 1);

  await rm(dataDir, { recursive: true, force: true });
});
```

- [ ] **Step 5: Run the scan + sources tests**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js test/run-scan.test.js`
Expected: PASS — sources-index (1) + run-scan (original 2 + new integration = 3).

Then the full indexer suite:
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add indexer/src/sources/index.js indexer/test/sources-index.test.js indexer/test/run-scan.test.js
git commit -m "feat(mcp-registry): register source + inject via runScan (candidate tier live)"
```

---

## Task 3: `mcpListed` sertleştirme (flag-önekli `claude mcp add`)

**Files:**
- Modify: `plugin/lib/cli.js`
- Modify: `plugin/test/install-cli.test.js`

- [ ] **Step 1: Update the failing tests** — In `plugin/test/install-cli.test.js`:

(a) Add `mcpAddName` to the import. Change:
```javascript
import { runInstall, pluginListed, realEnv, verifyCmdFor, mcpListed, listed } from '../lib/cli.js';
```
to:
```javascript
import { runInstall, pluginListed, realEnv, verifyCmdFor, mcpListed, listed, mcpAddName } from '../lib/cli.js';
```

(b) Append to the END of `plugin/test/install-cli.test.js`:
```javascript
test('mcpAddName extracts the server name from both command forms', () => {
  assert.equal(mcpAddName('claude mcp add my-server -- npx -y @scope/pkg'), 'my-server');
  assert.equal(mcpAddName('claude mcp add ai-adeu-adeu -- uvx adeu'), 'ai-adeu-adeu');
  assert.equal(mcpAddName('claude mcp add --transport http my-remote https://x.com/mcp'), 'my-remote');
  assert.equal(mcpAddName('claude mcp add --transport sse my-sse https://x.com/sse'), 'my-sse');
  assert.equal(mcpAddName('claude plugin install p@mp'), '');   // not an mcp add command
});

test('mcpListed matches a remote-form server name (flags before the name)', () => {
  const item = { command: 'claude mcp add --transport http my-remote https://x.com/mcp' };
  assert.equal(mcpListed('my-remote  https://x.com/mcp  ✓\n', item), true);
  assert.equal(mcpListed('my-remote-extra\n', item), false);    // word boundary, no substring collision
  assert.equal(mcpListed('No MCP servers configured.', item), false);  // empty-state guard preserved
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/install-cli.test.js`
Expected: FAIL — `mcpAddName` not exported; and the remote-form `mcpListed` currently captures `--transport` (wrong token) so the match fails.

- [ ] **Step 3: Add `mcpAddName` and rewire `mcpListed`** — In `plugin/lib/cli.js`, replace the existing `mcpListed` function:

```javascript
// The mcp server is registered under the name in `claude mcp add <name> -- ...`,
// so verify by matching that name (not the package) in `claude mcp list`.
export function mcpListed(listText, item) {
  const m = String(item?.command || '').match(/mcp add\s+(\S+)/);
  const nameTok = m ? m[1] : '';
  if (!nameTok) return false;
  return new RegExp(`(^|[^\\w-])${escapeRegex(nameTok)}([^\\w-]|$)`).test(String(listText));
}
```
with:
```javascript
// Extract the server name from a `claude mcp add` command. The name follows any
// options: `claude mcp add [--transport http] <name> <cmdOrUrl> [-- ...]`. Skip the
// `--flag` (and its value, e.g. `--transport http`) and return the first plain token.
export function mcpAddName(command) {
  const after = String(command).split(/mcp add\s+/)[1];
  if (!after) return '';
  const toks = after.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '--') break;                       // '--' starts the run command; name must precede it
    if (t.startsWith('-')) {
      if (t === '--transport') i++;              // skip the flag's value (http/sse)
      continue;
    }
    return t;                                     // first plain token = server name
  }
  return '';
}

// The mcp server is registered under the name in `claude mcp add <name> ...`,
// so verify by matching that name (not the package) in `claude mcp list`.
export function mcpListed(listText, item) {
  const text = String(listText);
  if (/no\s+mcp\s+servers/i.test(text)) return false;   // empty-state help text, nothing configured
  const nameTok = mcpAddName(item?.command || '');
  if (!nameTok) return false;
  return new RegExp(`(^|[^\\w-])${escapeRegex(nameTok)}([^\\w-]|$)`).test(text);
}
```

(Note: the previous `mcpListed` already had the `/no\s+mcp\s+servers/i` empty-state guard from SP7; it is preserved above. Only the name-extraction changed from the inline regex to `mcpAddName`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/install-cli.test.js`
Expected: PASS.

Then the full plugin suite:
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all green (existing package-form `mcpListed` tests still pass — name-first token is unchanged).

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/cli.js plugin/test/install-cli.test.js
git commit -m "fix(mcp-registry): harden mcpListed for flag-prefixed mcp add commands (remote http/sse)"
```

---

## Task 4: uçtan-uca doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Full suites**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all green (indexer ~84, plugin ~101 — was 171 total, now ~185).

- [ ] **Step 2: Live scan (network-dependent, fail-soft)**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node src/cli.js scan && node src/cli.js status
```
Expected: scan completes regardless of network. With network: `status` shows `bySource:` including `mcp-registry` > 0, and `byTrust:` `candidate` > 0. Offline: mcp-registry contributes 0 (fail-soft) and scan still succeeds.

- [ ] **Step 3: Candidate flow via the plugin CLI (uses whatever the live scan produced)**

If the live scan produced any `mcp-registry` candidate, pick its id from the map and verify the install plan marks it `needs-approval` (NOT `already-installed` — the empty-state guard + specific name must hold):
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
CID=$(node -e "const m=require('./indexer/data/capability-map.json'); const c=m.capabilities.find(x=>x.source.discoveredVia==='mcp-registry'); console.log(c?c.id:'')")
echo "candidate: $CID"
printf '%s' "{\"decision\":\"install_then_use\",\"capabilities\":[\"$CID\"],\"installs\":[\"$CID\"],\"method\":\"x\",\"rationale\":\"r\",\"confidence\":0.9}" > /c/tmp/cc-reg.json
cd plugin && node lib/cli.js install /c/tmp/cc-reg.json
rm -f /c/tmp/cc-reg.json
```
Expected: `needs-approval: <CID> — claude mcp add ...`. If the live scan produced no mcp-registry candidate (offline), state that and rely on the integration test (Task 2) which proves the wiring deterministically.

- [ ] **Step 4: Confirm clean working tree**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git status -s`
Expected: only pre-existing untracked junk (e.g. `bash.exe.stackdump`); no stray scratch files staged. (`capability-map.json` is gitignored.)

---

## Tamamlanma Kriteri (spec §9 ile eşleşir)

- [ ] `node src/cli.js scan` ağ varsa mcp-registry candidate cap'leri üretir; yoksa fail-soft (boş, scan başarılı).
- [ ] mcp-registry candidate cap'ler matcher'da görünür, konsey seçebilir, installer onay yolu (`needs-approval`) tetiklenir.
- [ ] Installer method-aware doğrulama hem paket-form hem remote-form `claude mcp add` komutlarını `claude mcp list` ile doğru okur (`mcpAddName`/`mcpListed`).
- [ ] Testler ağa çıkmadan tüm yolları kapsar; tüm testler yeşil; teknik borç yok.
```
