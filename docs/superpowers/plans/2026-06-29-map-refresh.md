# Manuel Harita Tazeleme + SHA-tabanlı Güncelleme (SP15) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tek komutla (`npm run refresh-map`) güvenli harita tazeleme + `version` kaldırılarak her push'un kullanıcılara güncelleme olarak ulaşması (commit-SHA tabanlı).

**Architecture:** İki task. (1) `indexer/scripts/bundle-map.js` — DI'lı `bundleMap` (scan çıktısını doğrular, geçerliyse `plugin/data`'ya kopyalar, kötü/boş map'i publish ETMEZ) + `refresh-map` npm script (scan + bundle). (2) `version` alanı `plugin.json` + `marketplace.json`'dan kaldırılır (SHA-tabanlı sürümleme) + README günlük akış dokümanı.

**Tech Stack:** Node.js ESM (zero-dep), `node --test`, git.

> **Ortam notu:** Node sistem PATH'inde DEĞİL. Test/CLI'dan önce:
> `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`

---

## File Structure

- **Create:** `indexer/scripts/bundle-map.js` — `bundleMap` (DI'lı doğrula+kopya) + CLI wrapper.
- **Create:** `indexer/test/bundle-map.test.js` — `bundleMap` testleri.
- **Modify:** `indexer/package.json` — `refresh-map` script.
- **Modify:** `plugin/.claude-plugin/plugin.json` — `version` alanını sil.
- **Modify:** `.claude-plugin/marketplace.json` — `plugins[0].version` alanını sil.
- **Modify:** `README.md` — "Refreshing the published map" bölümü.

Indexer scan/store mantığı ve plugin runtime'ı **değişmez**.

---

## Task 1: `bundle-map.js` + `refresh-map` script (kod + test)

**Files:**
- Create: `indexer/scripts/bundle-map.js`
- Test: `indexer/test/bundle-map.test.js`
- Modify: `indexer/package.json`

- [ ] **Step 1: Failing test yaz** `indexer/test/bundle-map.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleMap } from '../scripts/bundle-map.js';

const validMap = JSON.stringify({ schemaVersion: 1, capabilities: [{ id: 'a' }, { id: 'b' }] });

test('bundleMap: valid map is written byte-identical and count returned', async () => {
  let written = null;
  const res = await bundleMap({
    srcMap: '/src.json', destMap: '/dest.json',
    readFile: async () => validMap,
    writeFile: async (p, c) => { written = { p, c }; }
  });
  assert.deepEqual(res, { count: 2 });
  assert.equal(written.p, '/dest.json');
  assert.equal(written.c, validMap);
});

test('bundleMap: empty capabilities -> throws, no write', async () => {
  let wrote = false;
  await assert.rejects(
    bundleMap({ srcMap: '/s', destMap: '/d',
      readFile: async () => JSON.stringify({ schemaVersion: 1, capabilities: [] }),
      writeFile: async () => { wrote = true; } }),
    /yetenek yok|boş/);
  assert.equal(wrote, false);
});

test('bundleMap: invalid JSON -> throws, no write', async () => {
  let wrote = false;
  await assert.rejects(
    bundleMap({ srcMap: '/s', destMap: '/d',
      readFile: async () => 'not json{',
      writeFile: async () => { wrote = true; } }),
    /JSON/);
  assert.equal(wrote, false);
});

test('bundleMap: wrong schemaVersion -> throws, no write', async () => {
  let wrote = false;
  await assert.rejects(
    bundleMap({ srcMap: '/s', destMap: '/d',
      readFile: async () => JSON.stringify({ schemaVersion: 99, capabilities: [{ id: 'a' }] }),
      writeFile: async () => { wrote = true; } }),
    /schemaVersion/);
  assert.equal(wrote, false);
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/bundle-map.test.js
```
Expected: FAIL — `Cannot find module '../scripts/bundle-map.js'`.

- [ ] **Step 3: `bundle-map.js`'i yaz** `indexer/scripts/bundle-map.js`:

```javascript
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile as fsRead, writeFile as fsWrite } from 'node:fs/promises';

// Validate a freshly-scanned capability map and publish it to the plugin's embedded copy.
// fs is dependency-injected so this is testable without touching disk. Refuses to publish an
// invalid/empty map (throws) so a broken scan can never overwrite the good embedded map.
export async function bundleMap({ srcMap, destMap, readFile, writeFile }) {
  const raw = await readFile(srcMap, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`bundle-map: kaynak harita geçerli JSON değil: ${srcMap}`); }
  if (parsed.schemaVersion !== 1) {
    throw new Error(`bundle-map: beklenmeyen schemaVersion: ${parsed.schemaVersion}`);
  }
  if (!Array.isArray(parsed.capabilities) || parsed.capabilities.length === 0) {
    throw new Error('bundle-map: kaynak haritada yetenek yok (boş) — publish iptal');
  }
  await writeFile(destMap, raw);                 // byte-identical copy
  return { count: parsed.capabilities.length };
}

// CLI: real fs, paths resolved from this script's location
// (indexer/scripts -> indexer/data and ../../plugin/data).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'data', 'capability-map.json');
const DEST = path.join(HERE, '..', '..', 'plugin', 'data', 'capability-map.json');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bundleMap({ srcMap: SRC, destMap: DEST, readFile: fsRead, writeFile: fsWrite })
    .then(({ count }) => console.log(`bundled ${count} caps -> plugin/data/capability-map.json`))
    .catch((e) => { console.error(e.message); process.exitCode = 1; });
}
```

- [ ] **Step 4: Testi çalıştır, 4 PASS gör**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test test/bundle-map.test.js
```
Expected: PASS — 4 test.

- [ ] **Step 5: `refresh-map` script'ini ekle** `indexer/package.json` `scripts` bloğuna (mevcut `scan`/`status` yanına):

```json
    "refresh-map": "node src/cli.js scan && node scripts/bundle-map.js"
```
(Sonuç scripts bloğu: `test`, `scan`, `status`, `refresh-map`. JSON virgülleri doğru olmalı.)

- [ ] **Step 6: CLI wrapper canlı smoke (scan'siz — mevcut haritayla)**

`indexer/data/capability-map.json` zaten mevcut (1263 cap). Sadece bundle ucunu doğrula (scan çalıştırmadan):
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node scripts/bundle-map.js
grep -o '"id":' ../plugin/data/capability-map.json | wc -l
```
Expected: `bundled 1263 caps -> plugin/data/capability-map.json` ve cap sayısı `1263`. (plugin/data zaten aynı içerikteydi → git değişiklik göstermeyebilir; bu beklenen.)

- [ ] **Step 7: Tam indexer suite (regresyon)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test 2>&1 | grep -iE "tests |pass |fail "
```
Expected: `pass 113`, `fail 0` (önceki 109 + 4 yeni).

- [ ] **Step 8: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add indexer/scripts/bundle-map.js indexer/test/bundle-map.test.js indexer/package.json
git commit -m "feat(map-refresh): bundle-map.js (doğrula+kopya, DI) + refresh-map script"
```

---

## Task 2: version kaldır (SHA-tabanlı) + README dokümanı

**Files:**
- Modify: `plugin/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `README.md`

- [ ] **Step 1: `plugin.json`'dan version'ı sil.** `plugin/.claude-plugin/plugin.json` şu hale gelir (version satırı kaldırıldı):

```json
{
  "name": "autobrain",
  "description": "Routes each prompt to the best capabilities from the autobrain capability map (passive candidate hints).",
  "hooks": "./hooks/hooks.json"
}
```

- [ ] **Step 2: `marketplace.json`'dan plugins[0].version'ı sil.** `.claude-plugin/marketplace.json` şu hale gelir:

```json
{
  "name": "autobrain",
  "owner": { "name": "harun.hanbay" },
  "plugins": [
    {
      "name": "autobrain",
      "source": "./plugin",
      "description": "Routes each prompt to the best capabilities from the autobrain capability map; a multi-agent council decides, installs trusted capabilities, and executes — with Turkish progress narration. Also /autobrain-tune for project optimization checks."
    }
  ]
}
```

- [ ] **Step 3: JSON geçerliliği doğrula**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
node --input-type=commonjs -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('./plugin/.claude-plugin/plugin.json','utf8')); const m=JSON.parse(fs.readFileSync('./.claude-plugin/marketplace.json','utf8')); console.log('plugin.version:',p.version,'| mp.plugin.version:',m.plugins[0].version,'| names:',p.name,m.plugins[0].name)"
```
Expected: `plugin.version: undefined | mp.plugin.version: undefined | names: autobrain autobrain` (version alanları yok → undefined; JSON geçerli).

- [ ] **Step 4: README'ye "Refreshing the published map" bölümü ekle.** `README.md`'de "## Build the map" bölümünden SONRA (veya Configuration'dan önce uygun bir yere) ekle:

````markdown
## Refreshing the published map

The plugin ships with an embedded `plugin/data/capability-map.json`. To publish a fresh map so
installed users pick it up:

```bash
cd indexer
npm run refresh-map        # scans all sources, then validates + copies into plugin/data/
cd ..
git add plugin/data/capability-map.json
git commit -m "chore: refresh capability map"
git push origin master
```

`refresh-map` runs the scan and then `bundle-map.js`, which **validates** the scan output
(non-empty, correct schema) before overwriting the embedded map — a broken scan never publishes.
Set `GITHUB_TOKEN` first if you want the `github` source included.

**How users get the update:** this plugin has **no pinned `version`**, so Claude Code versions it
by git commit SHA — every push is a new version. Users run:

```bash
/plugin marketplace update autobrain
/plugin install autobrain@autobrain
```
````

- [ ] **Step 5: Tam suite (her iki paket) — doküman/manifest kodu kırmamalı**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test 2>&1 | grep -iE "pass |fail "
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "pass |fail "
```
Expected: indexer `pass 113 / fail 0`; plugin `pass 119 / fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/.claude-plugin/plugin.json .claude-plugin/marketplace.json README.md
git commit -m "feat(map-refresh): version kaldır (commit-SHA sürümleme) + README tazeleme akışı"
```

---

## Self-Review (planlama sonrası — yazar kontrolü)

**1. Spec coverage:**
- Spec §2 (version kaldır: plugin.json + marketplace; package.json dokunulmaz) → Task 2 Step 1-2. ✓
- Spec §3 (`bundleMap` DI doğrula+kopya, kötü map publish etmez; CLI wrapper paths; `refresh-map` script) → Task 1 Step 1-6. ✓
- Spec §4 (README günlük akış + kullanıcı update; memory build-setup) → Task 2 Step 4 (README). **Memory güncellemesi controller tarafından merge sonrası yapılır (repo dışı).** ✓
- Spec §5 (bundleMap testleri: geçerli→yaz; boş/bozuk/yanlış-schema→throw+no write) → Task 1 Step 1. ✓
- Spec "kapsam dışı" (CI yok; oto-git yok; runtime değişmez) → script git'e dokunmaz; sadece yeni script+manifest+doküman. ✓

**2. Placeholder scan:** TBD/TODO yok; her kod adımında tam kod, her komutta beklenen çıktı. ✓

**3. Tutarlılık:** `bundleMap({ srcMap, destMap, readFile, writeFile })` imzası test + implementasyon + CLI wrapper'da aynı; dönüş `{ count }` tutarlı. version kaldırma iki manifsette de aynı alan. Beklenen test: indexer 109→113, plugin 119 sabit. ✓

> **NOT (controller):** Memory `cc-autopilot-build-setup`'a `refresh-map` komutu eklemesi repo dışıdır; subagent task'ı değil — merge sonrası controller yapar.
