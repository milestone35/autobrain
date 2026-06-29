# `/autopilot-tune` Proje Optimizasyon Kontrolü (SP11) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni bir `/autopilot-tune` komutu, çalışılan projeyi bir optimizasyon kontrol listesine (CLAUDE.md, izin allowlist, hooks) karşı denetlesin ve eksikleri Türkçe raporlayıp her birini tek onayla gidersin.

**Architecture:** Saf çekirdek `plugin/lib/optimizations.js` (CHECKS registry + `evaluateChecks`) deterministik ve testlenebilir. `plugin/lib/cli.js`'e DI'lı `gatherProjectState` + `runChecks` + `checks` komutu eklenir (gerçek FS okumaları enjekte edilir → testler diske çıkmaz). `plugin/skills/project-tuner/SKILL.md` orkestrasyonu yapar (SP6 yürütme + SP10 Türkçe anlatım); `plugin/commands/autopilot-tune.md` komutu tetikler.

**Tech Stack:** Node.js ESM (zero-dep), `node --test` (built-in), Markdown skill/command prompts.

> **Ortam notu:** Node sistem PATH'inde DEĞİL. Test/CLI'dan önce Git Bash'te:
> `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`
> Testler: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`

---

## File Structure

- **Create:** `plugin/lib/optimizations.js` — `CHECKS` registry + pure `evaluateChecks(state)`. Tek sorumluluk: kontrol tanımı + değerlendirme. FS/komut bilmez.
- **Create:** `plugin/test/optimizations.test.js` — `evaluateChecks`/`CHECKS` testleri.
- **Modify:** `plugin/lib/cli.js` — `import { existsSync }`, yeni `gatherProjectState` + `runChecks` + `parseRoot`, `checks` CLI komutu, usage string güncellemesi. Diğer komutlar/`installer.js` dokunulmaz.
- **Create:** `plugin/test/checks-cli.test.js` — `gatherProjectState` (DI) + `runChecks` testleri.
- **Create:** `plugin/skills/project-tuner/SKILL.md` — orkestratör skill.
- **Create:** `plugin/commands/autopilot-tune.md` — `/autopilot-tune` komutu.

---

## Task 1: `optimizations.js` — CHECKS registry + evaluateChecks (kod + test)

**Files:**
- Create: `plugin/lib/optimizations.js`
- Test: `plugin/test/optimizations.test.js`

- [ ] **Step 1: Failing test dosyasını yaz** `plugin/test/optimizations.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecks, CHECKS } from '../lib/optimizations.js';

test('CHECKS has the three expected ids in order', () => {
  assert.deepEqual(CHECKS.map((c) => c.id), ['claude-md', 'permissions-allowlist', 'hooks']);
});

test('evaluateChecks: all present => all ok', () => {
  const res = evaluateChecks({ hasClaudeMd: true, permissionsAllowCount: 3, hasHooks: true });
  assert.deepEqual(res.map((c) => c.status), ['ok', 'ok', 'ok']);
});

test('evaluateChecks: claude-md missing => /init slash remediation', () => {
  const res = evaluateChecks({ hasClaudeMd: false, permissionsAllowCount: 3, hasHooks: true });
  const cm = res.find((c) => c.id === 'claude-md');
  assert.equal(cm.status, 'missing');
  assert.deepEqual(cm.remediation, { kind: 'slash', target: '/init', risk: 'side-effect' });
});

test('evaluateChecks: permissions empty => fewer-permission-prompts skill remediation', () => {
  const res = evaluateChecks({ hasClaudeMd: true, permissionsAllowCount: 0, hasHooks: true });
  const p = res.find((c) => c.id === 'permissions-allowlist');
  assert.equal(p.status, 'missing');
  assert.equal(p.remediation.kind, 'skill');
  assert.equal(p.remediation.target, 'fewer-permission-prompts');
});

test('evaluateChecks: hooks missing => advisory remediation (no side-effect)', () => {
  const res = evaluateChecks({ hasClaudeMd: true, permissionsAllowCount: 3, hasHooks: false });
  const h = res.find((c) => c.id === 'hooks');
  assert.equal(h.status, 'missing');
  assert.equal(h.remediation.kind, 'advisory');
  assert.equal(h.remediation.risk, 'none');
});

test('evaluateChecks: undefined state => all missing, no throw', () => {
  const res = evaluateChecks(undefined);
  assert.deepEqual(res.map((c) => c.status), ['missing', 'missing', 'missing']);
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/optimizations.test.js
```
Expected: FAIL — `Cannot find module '../lib/optimizations.js'`.

- [ ] **Step 3: `optimizations.js`'i yaz** `plugin/lib/optimizations.js`:

```javascript
// Project optimization checklist for cc-autopilot's /autopilot-tune.
// Pure + side-effect-free: each check detects a signal in a pre-gathered `state`
// object and declares how to remediate it. Detection I/O lives in cli.js (DI'd).
// `remediation.kind`: 'slash' (run a slash command), 'skill' (invoke a skill),
// or 'advisory' (just inform — no canonical auto-fix). `risk`: 'side-effect' | 'none'.
export const CHECKS = [
  {
    id: 'claude-md',
    title: 'CLAUDE.md (proje yönergeleri)',
    detect: (s) => Boolean(s.hasClaudeMd),
    remediation: { kind: 'slash', target: '/init', risk: 'side-effect' }
  },
  {
    id: 'permissions-allowlist',
    title: 'İzin allowlist (.claude/settings.json)',
    detect: (s) => (s.permissionsAllowCount || 0) > 0,
    remediation: { kind: 'skill', target: 'fewer-permission-prompts', risk: 'side-effect' }
  },
  {
    id: 'hooks',
    title: 'Hook yapılandırması',
    detect: (s) => Boolean(s.hasHooks),
    remediation: { kind: 'advisory', target: 'update-config', risk: 'none' }
  }
];

// Evaluate every check against the gathered state. Safe on a missing/partial state
// (a missing field reads as falsy => 'missing'); never throws.
export function evaluateChecks(state) {
  const s = state || {};
  return CHECKS.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.detect(s) ? 'ok' : 'missing',
    remediation: c.remediation
  }));
}
```

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/optimizations.test.js
```
Expected: PASS — 6 test yeşil.

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/optimizations.js plugin/test/optimizations.test.js
git commit -m "feat(tune): optimizations.js — CHECKS registry + evaluateChecks (saf)"
```

---

## Task 2: `gatherProjectState` + `runChecks` + `checks` komutu (kod + test)

**Files:**
- Modify: `plugin/lib/cli.js`
- Test: `plugin/test/checks-cli.test.js`

- [ ] **Step 1: Failing test dosyasını yaz** `plugin/test/checks-cli.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { gatherProjectState, runChecks } from '../lib/cli.js';

const ROOT = '/proj';
const j = (...p) => path.join(ROOT, ...p);

test('gatherProjectState: detects CLAUDE.local.md variant', async () => {
  const exists = (p) => p === j('CLAUDE.local.md');
  const readJson = async () => null;
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.equal(s.hasClaudeMd, true);
});

test('gatherProjectState: sums permissions.allow across both settings files', async () => {
  const exists = () => false;
  const readJson = async (p) => {
    if (p === j('.claude', 'settings.json')) return { permissions: { allow: ['a', 'b'] } };
    if (p === j('.claude', 'settings.local.json')) return { permissions: { allow: ['c'] } };
    return null;
  };
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.equal(s.permissionsAllowCount, 3);
  assert.equal(s.hasClaudeMd, false);
});

test('gatherProjectState: detects hooks block', async () => {
  const exists = () => false;
  const readJson = async (p) =>
    p === j('.claude', 'settings.json') ? { hooks: { Stop: [{ hooks: [] }] } } : null;
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.equal(s.hasHooks, true);
});

test('gatherProjectState: fail-soft when settings missing/broken (readJson null)', async () => {
  const exists = () => false;
  const readJson = async () => null;     // missing file or broken JSON both surface as null
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.deepEqual(s, { hasClaudeMd: false, permissionsAllowCount: 0, hasHooks: false });
});

test('runChecks returns { root, checks } with evaluated statuses', async () => {
  const exists = (p) => p === j('CLAUDE.md');
  const readJson = async () => null;
  const res = await runChecks({ root: ROOT, exists, readJson });
  assert.equal(res.root, ROOT);
  assert.equal(res.checks.find((c) => c.id === 'claude-md').status, 'ok');
  assert.equal(res.checks.find((c) => c.id === 'permissions-allowlist').status, 'missing');
  assert.equal(res.checks.find((c) => c.id === 'hooks').status, 'missing');
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/checks-cli.test.js
```
Expected: FAIL — `gatherProjectState`/`runChecks` export edilmemiş (`is not a function`).

- [ ] **Step 3: Import ekle.** `plugin/lib/cli.js`'in en üstündeki importlara ekle (mevcut `import { readFile } from 'node:fs/promises';` satırının hemen ardına):

```javascript
import { existsSync } from 'node:fs';
```

Ve dosyanın import bloğunda `optimizations.js`'i içe aktar (mevcut `import { planExecution } from './execution.js';` satırının ardına):

```javascript
import { evaluateChecks } from './optimizations.js';
```

- [ ] **Step 4: `gatherProjectState` + `runChecks` fonksiyonlarını ekle.** `plugin/lib/cli.js`'te, `runExecute` fonksiyonundan SONRA, `async function main(argv)`'dan ÖNCE ekle:

```javascript
// Gather optimization signals for the project at `root`. I/O is injected: `exists(path)`
// -> boolean, `readJson(path)` -> parsed object or null (missing/broken => null). Fail-soft:
// any unreadable settings file is simply skipped. Pure-ish: no direct fs, fully testable.
export async function gatherProjectState({ root, exists, readJson }) {
  const hasClaudeMd = exists(path.join(root, 'CLAUDE.md')) || exists(path.join(root, 'CLAUDE.local.md'));
  const settingsFiles = [
    path.join(root, '.claude', 'settings.json'),
    path.join(root, '.claude', 'settings.local.json')
  ];
  let permissionsAllowCount = 0;
  let hasHooks = false;
  for (const f of settingsFiles) {
    const s = await readJson(f);
    if (!s) continue;
    if (Array.isArray(s.permissions?.allow)) permissionsAllowCount += s.permissions.allow.length;
    if (s.hooks && typeof s.hooks === 'object' && Object.keys(s.hooks).length > 0) hasHooks = true;
  }
  return { hasClaudeMd, permissionsAllowCount, hasHooks };
}

// Gather state then evaluate the checklist. Returns { root, checks }.
export async function runChecks({ root, exists, readJson }) {
  const state = await gatherProjectState({ root, exists, readJson });
  return { root, checks: evaluateChecks(state) };
}
```

- [ ] **Step 5: `parseRoot` yardımcısını ekle.** `plugin/lib/cli.js`'te, mevcut `parseApprovedIds` fonksiyonunun hemen ardına ekle:

```javascript
function parseRoot(argv) {
  const i = argv.indexOf('--root');
  return i !== -1 && argv[i + 1] ? argv[i + 1] : process.cwd();
}
```

- [ ] **Step 6: `checks` komutunu `main`'e ekle.** `main` fonksiyonunda, `installed` dalından SONRA, son `else` (Usage) dalından ÖNCE ekle:

```javascript
  } else if (cmd === 'checks') {
    const root = parseRoot(argv);
    const res = await runChecks({
      root,
      exists: (p) => existsSync(p),
      readJson: async (p) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
    });
    console.log(JSON.stringify(res));
```

- [ ] **Step 7: Usage string'ini güncelle.** Son `else` dalındaki Usage satırını şu hale getir (yeni `checks` komutunu ekle):

```javascript
    console.error('Usage: cli.js <preview|candidates|decide|install|execute|installed|checks> ...');
```

- [ ] **Step 8: Testi çalıştır, PASS gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/checks-cli.test.js
```
Expected: PASS — 5 test yeşil.

- [ ] **Step 9: Canlı CLI dumanı (smoke).** Gerçek bir kontrol çıktısı al:

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node lib/cli.js checks --root /c/Users/harun.hanbay/Desktop/cc-autopilot
```
Expected: son satır JSON `{"root":"...","checks":[{"id":"claude-md",...},{"id":"permissions-allowlist",...},{"id":"hooks",...}]}`. (cc-autopilot kökünde README.md var ama CLAUDE.md yok → claude-md muhtemelen `missing`.)

- [ ] **Step 10: Tam plugin test seti (regresyon)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test
```
Expected: PASS — `fail 0` (önceki 107 + yeni 6 + 5 = 118 test).

- [ ] **Step 11: Commit**

```bash
git add plugin/lib/cli.js plugin/test/checks-cli.test.js
git commit -m "feat(tune): checks komutu — gatherProjectState (DI, fail-soft) + runChecks"
```

---

## Task 3: `project-tuner` skill + `/autopilot-tune` komutu

**Files:**
- Create: `plugin/skills/project-tuner/SKILL.md`
- Create: `plugin/commands/autopilot-tune.md`

Prose; birim-testlenmez. Doğrulama Task 1+2 testleri + tam suite regresyonu + şablon gözden geçirme.

- [ ] **Step 1: `SKILL.md`'i oluştur** `plugin/skills/project-tuner/SKILL.md`:

```markdown
---
name: project-tuner
description: Check the current project against the cc-autopilot optimization checklist (CLAUDE.md, permission allowlist, hooks) and offer to fix missing items with one approval each. Invoked by the /autopilot-tune command.
allowed-tools: Bash, Read, Skill
---

# Project Tuner — optimization checklist

Check the current project for optimization gaps and, with the user's approval, fix them. All user-facing narration MUST be in **Turkish** (consistent with /route). Follow these steps exactly.

## Inputs
- `PLUGIN_ROOT`: the plugin directory (`${CLAUDE_PLUGIN_ROOT}` when run as an installed plugin; otherwise the `plugin/` dir of this repo).

## Step 1 — Gather checks (deterministic)
Run (the command defaults `--root` to the current working directory):
```bash
node "$PLUGIN_ROOT/lib/cli.js" checks
```
Parse the **last non-empty line** as JSON `{ "root", "checks": [ { "id", "title", "status", "remediation" } ] }`. If the command errors or the output is unparseable, tell the user in Turkish (`⚠️ Kontroller çalıştırılamadı.`) and STOP — fail-soft, never break anything.

## Step 2 — Report (Turkish)
Count `missing` checks. **Anlat:** `🔧 <toplam> kontrol yapıldı, <eksik> eksik.` then list each missing check's `title`. If none are missing: `✅ Proje zaten optimize — yapılacak bir şey yok.` and STOP.

## Step 3 — Remediate each missing check
For each check with `status: "missing"`, act by `remediation.kind`:
- `"advisory"` → do NOT run anything; just inform: `ℹ️ <title> eksik — `update-config` skill ile ekleyebilirsin.`
- `"slash"` → show what will run (`remediation.target`, e.g. `/init`) and ask for ONE approval in Turkish. If approved, invoke that command via the Skill tool (e.g. the `init` skill). If declined, skip and say so in Turkish.
- `"skill"` → show the skill (`remediation.target`, e.g. `fewer-permission-prompts`) and ask for ONE approval in Turkish. If approved, invoke it via the Skill tool. If declined, skip and say so.

**Fail-soft:** if a remediation target is unavailable or errors, do NOT abort the rest — report it in Turkish (`⚠️ <title> giderilemedi — elle çalıştırabilirsin: <target>`) and continue to the next check.

## Step 4 — Final summary (Turkish)
Emit one consolidated line:
```
Özet: <toplam> kontrol, <giderilen> giderildi, <atlanan/danışmanlık> atlandı.
```
```

- [ ] **Step 2: `/autopilot-tune` komutunu oluştur** `plugin/commands/autopilot-tune.md`:

```markdown
---
description: Check the current project against the cc-autopilot optimization checklist (CLAUDE.md, permission allowlist, hooks) and fix missing items with one approval each
allowed-tools: Bash, Read, Skill
---

# /autopilot-tune — project optimization check

Use the **project-tuner** skill to check the current project against the cc-autopilot optimization checklist and, with a single approval per item, fix what is missing. Follow the skill's steps exactly. All user-facing narration is in Turkish. Fail-soft: never break the user's environment — the read-only check runs automatically, and each fix (which writes files) asks for one approval first. Advisory items (no canonical auto-fix) are only reported.
```

- [ ] **Step 3: Markdown'ı doğrula.** Her iki dosyayı Read ile aç; frontmatter geçerli, kod çitleri kapalı, metin tam. `git status` SADECE iki yeni dosyayı göstermeli (`plugin/skills/project-tuner/SKILL.md`, `plugin/commands/autopilot-tune.md`).

- [ ] **Step 4: Tam plugin test seti (regresyon — prose kodu kırmamalı)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test
```
Expected: PASS — `fail 0` (118 test).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/project-tuner/SKILL.md plugin/commands/autopilot-tune.md
git commit -m "feat(tune): /autopilot-tune komutu + project-tuner skill (Türkçe, fail-soft)"
```

---

## Self-Review (planlama sonrası — yazar kontrolü)

**1. Spec coverage:**
- Spec §2 (`optimizations.js`: CHECKS + evaluateChecks; 3 kontrol; advisory hooks) → Task 1. ✓
- Spec §3 (`gatherProjectState` DI fail-soft + `checks` komutu + `--root`/cwd) → Task 2 (Step 3–7). ✓
- Spec §4 (`project-tuner` skill: gather → Türkçe rapor → tek onayla giderme/advisory → özet, fail-soft) → Task 3 Step 1. ✓
- Spec §5 (`/autopilot-tune` komutu) → Task 3 Step 2. ✓
- Spec §6 (testler: evaluateChecks ok/missing/undefined; gatherProjectState DI + fail-soft; checks çıktı şekli) → Task 1 Step 1 + Task 2 Step 1. ✓
- Spec "Kapsam dışı" (/route entegrasyonu yok; hooks oto-üretimi yok; installer/diğer komutlar dokunulmaz) → Task'larda yalnızca yeni dosyalar + cli.js'e additive ekleme. ✓

**2. Placeholder scan:** TBD/TODO yok; her kod adımında tam kod; her komutta beklenen çıktı. ✓

**3. Type consistency:** `state` şekli `{ hasClaudeMd, permissionsAllowCount, hasHooks }` Task 1 testleri + Task 2 `gatherProjectState` dönüşü arasında birebir. `evaluateChecks` çıktısı `{ id, title, status, remediation }` Task 1'de tanımlı, `runChecks`/skill'de aynı isimlerle kullanılıyor. `remediation.{kind,target,risk}` Task 1 ve skill Step 3'te tutarlı. `runChecks({ root, exists, readJson })` imzası Task 2 test + implementasyonda aynı. ✓
