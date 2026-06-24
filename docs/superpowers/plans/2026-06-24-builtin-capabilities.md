# Yerleşik Yetenek Taksonomisi (SP5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yetenek haritasını Claude Code'un kurulum gerektirmeyen yerleşik yeteneklerini (bang `!`, yerleşik araçlar, yerleşik slash komutları, yerleşik subagent'lar) kapsayacak şekilde genişletmek; konseyin bunları önerip eşit alakada kurulabilir plugin'lere tercih etmesini sağlamak.

**Architecture:** İki-parça mimari korunur. indexer'a tek yeni `builtin-catalog` source eklenir (sabit küratörlü liste, `install:null`). normalize 4 yeni `kind` kabul eder; trust yeni `builtin` tier'ı tanır. plugin tarafında matcher eşit skorda builtin'i öne alır; installer zaten `install:null`'ı atladığı için değişmez (regresyon testiyle kilitlenir). Konsey reçetesi builtin → kurma, doğrudan kullan.

**Tech Stack:** Node.js ESM (sıfır bağımlılık), test runner = Node built-in `node --test`.

> **Önemli — Node ortamı:** Node/npm sistem PATH'inde DEĞİL, conda env'inde. Bu plandaki tüm komutlardan ÖNCE (Git Bash):
> ```bash
> export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
> ```

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|-------|-----------|-------|
| `indexer/src/normalize.js` | `KINDS` set'ine 4 yeni kind | Değiştir |
| `indexer/src/trust.js` | `classifyTrust` builtin dalı | Değiştir |
| `indexer/src/sources/builtin-catalog.js` | Sabit yerleşik yetenek listesi (source) | **Oluştur** |
| `indexer/src/sources/index.js` | Yeni source'u kaydet | Değiştir |
| `indexer/test/normalize.test.js` | Yeni kind kabul testi | Değiştir |
| `indexer/test/trust.test.js` | builtin tier testi | Değiştir |
| `indexer/test/builtin-catalog.test.js` | Katalog source testi | **Oluştur** |
| `indexer/test/sources-index.test.js` | Registry'de builtin testi | Değiştir |
| `plugin/lib/matcher.js` | `rankCandidates` builtin tie-break | Değiştir |
| `plugin/test/matcher.test.js` | builtin önceliği testi | Değiştir |
| `plugin/test/installer.test.js` | builtin atlanır regresyon testi | Değiştir |
| `plugin/skills/capability-router/SKILL.md` | builtin → use-directly notu | Değiştir |

---

## Task 1: normalize — 4 yeni kind kabul et

**Files:**
- Modify: `indexer/src/normalize.js:23` (`KINDS` set)
- Test: `indexer/test/normalize.test.js`

- [ ] **Step 1: Write the failing test**

`indexer/test/normalize.test.js` dosyasının SONUNA ekle:

```javascript
test('makeCapability accepts the four builtin kinds', () => {
  const base = { name: 'x', marketplace: 'builtin', plugin: 'core', component: 'x', now: 't' };
  for (const kind of ['bang', 'builtin-tool', 'slash', 'builtin-agent']) {
    const c = makeCapability({ ...base, kind });
    assert.equal(c.kind, kind);
  }
});

test('validateCapability still rejects an unknown kind', () => {
  const errs = validateCapability({ kind: 'nonsense', name: 'x', marketplace: 'builtin', plugin: 'core' });
  assert.ok(errs.some((e) => e.includes('kind')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/normalize.test.js`
Expected: FAIL — "kind must be one of skill|agent|mcp|command|plugin" for the builtin kinds.

- [ ] **Step 3: Write minimal implementation**

`indexer/src/normalize.js` içinde `KINDS` satırını değiştir:

```javascript
const KINDS = new Set(['skill', 'agent', 'mcp', 'command', 'plugin', 'bang', 'builtin-tool', 'slash', 'builtin-agent']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/normalize.test.js`
Expected: PASS (all normalize tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/normalize.js indexer/test/normalize.test.js
git commit -m "feat(builtin): normalize accepts bang/builtin-tool/slash/builtin-agent kinds"
```

---

## Task 2: trust — builtin tier

**Files:**
- Modify: `indexer/src/trust.js:12` (`classifyTrust`)
- Test: `indexer/test/trust.test.js`

- [ ] **Step 1: Write the failing test**

`indexer/test/trust.test.js` dosyasının SONUNA ekle:

```javascript
test('discoveredVia builtin => builtin tier', () => {
  assert.equal(classifyTrust(cap({ source: { repo: null, discoveredVia: 'builtin' } }), new Set()), 'builtin');
});

test('builtin tier wins even if a repo is present', () => {
  assert.equal(classifyTrust(cap({ source: { repo: 'github:x/y', discoveredVia: 'builtin' } }), new Set()), 'builtin');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/trust.test.js`
Expected: FAIL — returns 'unknown' (first test) / 'candidate' (second) instead of 'builtin'.

- [ ] **Step 3: Write minimal implementation**

`indexer/src/trust.js` içinde `classifyTrust`'a, ilk satır olarak builtin dalını ekle:

```javascript
export function classifyTrust(cap, trustedSet) {
  if (cap.source?.discoveredVia === 'builtin') return 'builtin';
  if (cap.source?.discoveredVia === 'official') return 'trusted';
  const repo = normalizeRepo(cap.source?.repo);
  if (repo && trustedSet.has(repo)) return 'trusted';
  if (repo || cap.install?.command) return 'candidate';
  return 'unknown';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/trust.test.js`
Expected: PASS (all trust tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/trust.js indexer/test/trust.test.js
git commit -m "feat(builtin): trust classifies discoveredVia:builtin as builtin tier"
```

---

## Task 3: builtin-catalog source

**Files:**
- Create: `indexer/src/sources/builtin-catalog.js`
- Test: `indexer/test/builtin-catalog.test.js`

- [ ] **Step 1: Write the failing test**

`indexer/test/builtin-catalog.test.js` oluştur:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as builtin from '../src/sources/builtin-catalog.js';

const NOW = '2026-06-24T00:00:00Z';

test('source name is "builtin"', () => {
  assert.equal(builtin.name, 'builtin');
});

test('collect emits builtin capabilities with install:null and builtin source', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  assert.equal(res.ok, true);
  assert.ok(res.capabilities.length >= 18, `expected >=18, got ${res.capabilities.length}`);
  for (const c of res.capabilities) {
    assert.equal(c.install, null, `${c.id} must have install:null`);
    assert.equal(c.source.discoveredVia, 'builtin');
    assert.equal(c.source.marketplace, 'builtin');
    assert.equal(c.lastSeen, NOW);
    assert.ok(['bang', 'builtin-tool', 'slash', 'builtin-agent'].includes(c.kind));
  }
});

test('collect includes the bang shell capability with ssh keyword', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const shell = res.capabilities.find((c) => c.kind === 'bang');
  assert.ok(shell, 'bang capability present');
  assert.equal(shell.id, 'builtin::core::bang::shell');
  assert.ok(shell.keywords.includes('ssh'));
});

test('collect covers all four builtin kinds', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const kinds = new Set(res.capabilities.map((c) => c.kind));
  for (const k of ['bang', 'builtin-tool', 'slash', 'builtin-agent']) assert.ok(kinds.has(k), `missing kind ${k}`);
});

test('collect ids are unique', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const ids = res.capabilities.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/builtin-catalog.test.js`
Expected: FAIL — "Cannot find module .../builtin-catalog.js".

- [ ] **Step 3: Write minimal implementation**

`indexer/src/sources/builtin-catalog.js` oluştur:

```javascript
import { makeCapability } from '../normalize.js';

export const name = 'builtin';

// Sabit, küratörlü liste. Claude Code'un kurulum gerektirmeyen yerleşik yetenekleri.
// CC sürümüyle nadiren değişir; gerektiğinde elle güncelle (YAGNI).
const BUILTINS = [
  { kind: 'bang', name: 'shell',
    description: 'Run any shell command inline in the session (git, ls, ssh, curl, build tools).',
    keywords: ['shell', 'command', 'ssh', 'remote', 'git', 'curl', 'terminal', 'run', 'bash'] },

  { kind: 'builtin-tool', name: 'Read', description: 'Read a file from the filesystem.', keywords: ['read', 'file', 'view', 'open'] },
  { kind: 'builtin-tool', name: 'Write', description: 'Write a new file or overwrite an existing one.', keywords: ['write', 'file', 'create', 'save'] },
  { kind: 'builtin-tool', name: 'Edit', description: 'Make an exact string replacement in a file.', keywords: ['edit', 'file', 'modify', 'change', 'replace'] },
  { kind: 'builtin-tool', name: 'Grep', description: 'Search file contents with a regular expression (ripgrep).', keywords: ['grep', 'search', 'find', 'regex', 'content'] },
  { kind: 'builtin-tool', name: 'Glob', description: 'Find files by glob pattern.', keywords: ['glob', 'find', 'files', 'pattern', 'path'] },
  { kind: 'builtin-tool', name: 'Bash', description: 'Execute a bash command and return its output.', keywords: ['bash', 'command', 'shell', 'execute', 'run', 'script'] },
  { kind: 'builtin-tool', name: 'WebFetch', description: 'Fetch a URL and process its content.', keywords: ['web', 'fetch', 'url', 'http', 'download', 'page'] },
  { kind: 'builtin-tool', name: 'WebSearch', description: 'Search the web for current information.', keywords: ['web', 'search', 'google', 'internet', 'lookup', 'research'] },
  { kind: 'builtin-tool', name: 'Task', description: 'Launch a subagent to handle a complex multi-step task.', keywords: ['task', 'agent', 'subagent', 'delegate', 'parallel'] },

  { kind: 'slash', name: '/init', description: 'Initialize a CLAUDE.md with codebase documentation.', keywords: ['init', 'claudemd', 'document', 'setup', 'onboard'] },
  { kind: 'slash', name: '/review', description: 'Review a pull request.', keywords: ['review', 'pull', 'request', 'code', 'feedback'] },
  { kind: 'slash', name: '/security-review', description: 'Run a security review of pending changes on the branch.', keywords: ['security', 'review', 'vulnerability', 'audit', 'scan'] },
  { kind: 'slash', name: '/code-review', description: 'Review the current diff for bugs and cleanups.', keywords: ['code', 'review', 'diff', 'bug', 'cleanup', 'quality'] },

  { kind: 'builtin-agent', name: 'Explore', description: 'Read-only search agent for broad fan-out searches across many files.', keywords: ['explore', 'search', 'find', 'agent', 'codebase', 'discover'] },
  { kind: 'builtin-agent', name: 'Plan', description: 'Software architect agent for designing implementation plans.', keywords: ['plan', 'architect', 'design', 'agent', 'strategy'] },
  { kind: 'builtin-agent', name: 'general-purpose', description: 'General-purpose agent for complex research and multi-step tasks.', keywords: ['general', 'agent', 'research', 'task', 'multi', 'step'] },
  { kind: 'builtin-agent', name: 'code-reviewer', description: 'Agent that reviews completed work against the plan and coding standards.', keywords: ['code', 'reviewer', 'agent', 'review', 'standards', 'quality'] }
];

export async function collect(ctx) {
  const { now } = ctx;
  const capabilities = BUILTINS.map((b) => makeCapability({
    kind: b.kind, name: b.name, description: b.description, keywords: b.keywords,
    marketplace: 'builtin', plugin: 'core', component: b.name,
    // install verilmedi -> normalize install:null yapar
    cost: null, popularity: { unique_installs: null },
    source: { repo: null, discoveredVia: 'builtin' }, now
  }));
  return { capabilities, ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/builtin-catalog.test.js`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/sources/builtin-catalog.js indexer/test/builtin-catalog.test.js
git commit -m "feat(builtin): builtin-catalog source (bang, tools, slash, agents)"
```

---

## Task 4: source'u registry'ye kaydet

**Files:**
- Modify: `indexer/src/sources/index.js`
- Test: `indexer/test/sources-index.test.js`

- [ ] **Step 1: Write the failing test**

`indexer/test/sources-index.test.js` içindeki ilk test'in ilk assert satırını değiştir ve sonuna yeni bir test ekle. Dosyanın tamamı şu hale gelir:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sources } from '../src/sources/index.js';

test('registry exposes the local sources with the contract shape', () => {
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin']);
  for (const s of sources) {
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.collect, 'function');
  }
});

test('builtin source is registered', () => {
  assert.ok(sources.some((s) => s.name === 'builtin'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js`
Expected: FAIL — `sources.map` yields `['official','known']`, missing `'builtin'`.

- [ ] **Step 3: Write minimal implementation**

`indexer/src/sources/index.js` tamamını değiştir:

```javascript
import * as official from './official-catalog.js';
import * as known from './known-marketplaces.js';
import * as builtin from './builtin-catalog.js';

// Ordered by authority. Web-discovery sources (github, mcp-registry, npm, pypi)
// implement the same { name, collect(ctx) } contract and are appended here in a later plan.
export const sources = [official, known, builtin];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/sources-index.test.js`
Expected: PASS (2 tests green).

- [ ] **Step 5: Commit**

```bash
git add indexer/src/sources/index.js indexer/test/sources-index.test.js
git commit -m "feat(builtin): register builtin source in indexer registry"
```

---

## Task 5: matcher — eşit skorda builtin önceliği

**Files:**
- Modify: `plugin/lib/matcher.js:32-43` (`rankCandidates`)
- Test: `plugin/test/matcher.test.js`

- [ ] **Step 1: Write the failing test**

`plugin/test/matcher.test.js` dosyasının SONUNA ekle:

```javascript
test('rankCandidates prefers builtin over installable on equal score', () => {
  const scored = [
    { cap: { id: 'plugin-cap', trust: 'trusted', popularity: { unique_installs: 999 } }, score: 5 },
    { cap: { id: 'builtin-cap', trust: 'builtin', popularity: { unique_installs: 0 } }, score: 5 }
  ];
  // equal score: builtin wins even though the plugin has far more installs
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['builtin-cap', 'plugin-cap']);
});

test('rankCandidates: relevance still dominates builtin preference', () => {
  const scored = [
    { cap: { id: 'builtin-cap', trust: 'builtin', popularity: {} }, score: 2 },
    { cap: { id: 'plugin-cap', trust: 'trusted', popularity: {} }, score: 9 }
  ];
  // higher-score plugin must still rank first; builtin preference is only a tie-break
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['plugin-cap', 'builtin-cap']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/matcher.test.js`
Expected: FAIL — first new test yields `['plugin-cap','builtin-cap']` (sorted by installs desc, builtin ignored).

- [ ] **Step 3: Write minimal implementation**

`plugin/lib/matcher.js` içine, `rankCandidates`'in ÜSTÜNE helper ekle ve `rankCandidates`'i değiştir:

```javascript
function isBuiltin(cap) {
  return cap?.trust === 'builtin' || cap?.source?.discoveredVia === 'builtin';
}

export function rankCandidates(scored, topN) {
  return [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ab = isBuiltin(a.cap) ? 1 : 0;
      const bb = isBuiltin(b.cap) ? 1 : 0;
      if (bb !== ab) return bb - ab;                 // equal score: builtin (zero-install) first
      const ai = a.cap.popularity?.unique_installs ?? 0;
      const bi = b.cap.popularity?.unique_installs ?? 0;
      if (bi !== ai) return bi - ai;
      return a.cap.id < b.cap.id ? -1 : a.cap.id > b.cap.id ? 1 : 0;
    })
    .slice(0, topN)
    .map((s) => s.cap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/matcher.test.js`
Expected: PASS — including the existing "sorts by score desc, then unique_installs desc, then id asc" test (those caps have no `trust`, so `isBuiltin` is false for all → unchanged).

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/matcher.js plugin/test/matcher.test.js
git commit -m "feat(builtin): matcher prefers builtin over installable on equal score"
```

---

## Task 6: installer — builtin atlanır (regresyon koruması, kod değişikliği yok)

**Files:**
- Test: `plugin/test/installer.test.js`

- [ ] **Step 1: Write the failing/locking test**

`plugin/test/installer.test.js` dosyasının SONUNA ekle (mevcut importları kullanır; `planInstalls`'in zaten import edildiğini doğrula, değilse import satırına ekle):

```javascript
test('planInstalls skips builtin capabilities (install:null => not runnable)', () => {
  const map = { capabilities: [
    { id: 'builtin::core::bang::shell', trust: 'builtin', install: null },
    { id: 'mp::p::skill::s', trust: 'trusted', install: { command: 'claude plugin install p@mp' } }
  ] };
  const decision = { installs: ['builtin::core::bang::shell', 'mp::p::skill::s'] };
  const plan = planInstalls(decision, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.id), ['mp::p::skill::s']);  // builtin absent
});
```

- [ ] **Step 2: Run test to verify it passes immediately (behavior already correct)**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/installer.test.js`
Expected: PASS — `planInstalls` skips caps with no `install.command` (matcher.js:9 `if (!command) continue;`). This test LOCKS that behavior so a future change can't accidentally try to install a builtin.

> Bu task'ta kod DEĞİŞMEZ; davranış zaten doğru. Test bir regresyon kilididir. Eğer test beklenmedik şekilde FAIL ederse, `installer.js`'i değiştirme — önce neden plana girdiğini araştır (bu spec'in §4.5 varsayımını çürütür).

- [ ] **Step 3: Commit**

```bash
git add plugin/test/installer.test.js
git commit -m "test(builtin): lock that planInstalls skips builtin (install:null) caps"
```

---

## Task 7: konsey reçetesi — builtin → doğrudan kullan

**Files:**
- Modify: `plugin/skills/capability-router/SKILL.md` (Step 2 Planner kuralları)

- [ ] **Step 1: Reçeteye builtin kuralını ekle**

`plugin/skills/capability-router/SKILL.md` içinde Step 2'deki "Rules for the Planner:" listesinin SONUNA bir madde ekle. Mevcut son madde:

```markdown
- `confidence` in [0,1] reflects how sure it is a listed capability genuinely helps.
```

bunun ALTINA ekle:

```markdown
- A candidate whose `trust` is `builtin` (kind `bang`/`builtin-tool`/`slash`/`builtin-agent`) is ALREADY available — it needs no install. Prefer such a candidate when it suffices, and never list it under `installs`. (E.g. for a quick search, prefer the builtin `Grep` over installing a search plugin.)
```

- [ ] **Step 2: Step 7'ye builtin notu ekle**

Step 7'de "Trusted capabilities install silently..." cümlesinden ÖNCE ekle:

```markdown
Builtin capabilities (`trust: builtin`) never appear in the install plan (their `install` is null), so
the installer simply skips them — use them directly, no prompt, no install.
```

- [ ] **Step 3: Doğrula (görsel inceleme)**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git diff plugin/skills/capability-router/SKILL.md`
Expected: Sadece iki ekleme; başka satır değişmemiş. Çelişkili ifade yok.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/capability-router/SKILL.md
git commit -m "docs(builtin): council prefers builtin caps and never installs them"
```

---

## Task 8: uçtan-uca doğrulama (tam scan + tüm testler)

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tüm indexer testlerini çalıştır**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Expected: tüm testler PASS (38 mevcut + ~9 yeni).

- [ ] **Step 2: Tüm plugin testlerini çalıştır**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: tüm testler PASS (72 mevcut + ~3 yeni).

- [ ] **Step 3: Gerçek scan çalıştır ve builtin'leri doğrula**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node src/cli.js scan && node src/cli.js status
```
Expected: `status` çıktısında `byKind` satırında `bang=1 builtin-tool=9 slash=4 builtin-agent=4`; `byTrust` satırında `builtin=18`; `bySource` satırında `builtin=18`.

- [ ] **Step 4: Eşit alakada builtin önceliğini canlı doğrula**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node lib/cli.js candidates "search the repo for a string"
```
Expected: çıktıda builtin `Grep` (id `builtin::core::builtin-tool::Grep`) aday listesinde ÜST sıralarda; kurulabilir bir arama plugin'i varsa eşit skorda onun önünde.

- [ ] **Step 5: Final commit (gerekiyorsa)**

Önceki task'lar zaten commit'li. Bu task yalnızca doğrulama; scan çıktısı (`capability-map.json`) repoda izleniyorsa:

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git add -A && git status
```
`capability-map.json` izlenen bir dosyaysa commit et:
```bash
git commit -m "chore(builtin): regenerate capability-map with builtin capabilities"
```
İzlenmiyorsa (gitignore'da) commit etme.

---

## Tamamlanma Kriteri (spec §7 ile eşleşir)

- [ ] `node src/cli.js status` builtin cap'leri gösteriyor (`byTrust: builtin=18`).
- [ ] `candidates` eşit alakada builtin'i önde döndürüyor.
- [ ] Konsey reçetesi builtin'i kurma diyor (use-directly).
- [ ] Tüm testler yeşil (indexer + plugin), teknik borç yok.
