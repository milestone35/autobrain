# `/route` Türkçe İlerleyiş Anlatımı + Toplam Harita Boyutu (SP10) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/route` skill'i çalışırken kullanıcıya Türkçe adım-adım ilerleyiş + sonda toplu özet versin; her zaman skill'in devrede olduğunu, toplam yetenek haritası boyutunu ve gerçekten kurulu yetenek sayısını göstersin.

**Architecture:** Üç parça. (A) `runCandidates` çıktısına türetilmiş `mapTotal` (tam harita boyutu) alanı — saf veri eki. (B) Yeni `installed` CLI komutu: `claude plugin list` + `claude mcp list` çıktılarından gerçek kurulu sayıyı saf `countListed` ile sayar, fail-soft probe ile sarmalanır. (C) `SKILL.md`, ajana intro'da "skill devrede + toplam harita + kurulu", her adımda tek satır ilerleyiş, sonda toplu özet yazdıran anlatım kuralı içerir.

**Tech Stack:** Node.js ESM (zero-dep), `node --test` (built-in test runner), Markdown SKILL prompt.

> **Ortam notu (build-setup):** Node sistem PATH'inde DEĞİL. Test/CLI'dan önce Git Bash'te:
> `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`
> Testler: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`

---

## File Structure

- **Modify:** `plugin/lib/cli.js` — (1) `runCandidates` dönüş objesine `mapTotal` (başarı + hata yolu); (2) yeni saf `countListed(method, listText)` + `runInstalledCount({ env })` + `installed` CLI komutu (mevcut `probeList`/`verifyCmdFor` yeniden kullanılır).
- **Modify:** `plugin/test/candidates.test.js` — `mapTotal` doğrulaması (başarı yolunda tam harita boyutu, hata yolunda 0).
- **Create:** `plugin/test/installed-cli.test.js` — `countListed` (plugin/mcp, dolu + empty-state) ve `runInstalledCount` (enjekte probe, fail-soft) testleri.
- **Create:** `plugin/test/fixtures/plugin-list.sample.txt` + `plugin/test/fixtures/mcp-list.sample.txt` — gerçek `claude ... list` çıktısından yakalanan format örnekleri.
- **Modify:** `plugin/skills/capability-router/SKILL.md` — "Progress narration (Turkish)" bölümü + intro/adım anlatım talimatları.

`decide`/`install`/`execute` komutları ve `installer.js` **değişmez**.

---

## Task 1: `runCandidates` çıktısına `mapTotal` ekle (kod + test)

**Files:**
- Modify: `plugin/lib/cli.js:49-60` (`runCandidates`)
- Test: `plugin/test/candidates.test.js`

Fixture (`plugin/test/fixtures/capability-map.sample.json`) toplam **3** yetenek içerir; `'audit my api security'` prompt'u bunların **2'sini** eşler (`api-audit`, `api-fuzz`; `write-readme` eşleşmez). Yani `mapTotal === 3` iken `candidates.length === 2` — bu, `mapTotal`'ın aday sayısı değil **tam harita boyutu** olduğunu kanıtlar.

- [ ] **Step 1: Başarı yolu için failing test ekle**

`plugin/test/candidates.test.js` içindeki ilk testin (`runCandidates returns structured machine-readable candidates`) sonuna, son `assert`'tan hemen önce/sonra şu iki satırı ekle:

```javascript
  // mapTotal = tam harita boyutu (aday sayısı DEĞİL): fixture 3 cap, eşleşen 2
  assert.equal(res.mapTotal, 3);
  assert.equal(res.candidates.length, 2);
```

- [ ] **Step 2: Hata yolu için failing test ekle**

Aynı dosyadaki ikinci testin (`runCandidates returns empty + error when map missing (fail-soft)`) sonuna ekle:

```javascript
  assert.equal(res.mapTotal, 0);
```

- [ ] **Step 3: Testleri çalıştır, başarısız olduklarını gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/candidates.test.js
```
Expected: FAIL — `res.mapTotal` `undefined` (başarı testinde `3` beklenirken `undefined`; hata testinde `0` beklenirken `undefined`).

- [ ] **Step 4: `runCandidates`'i güncelle (minimal implementasyon)**

`plugin/lib/cli.js` içinde `runCandidates`'i şu hale getir (yalnızca iki dönüş noktasına `mapTotal` eklenir):

```javascript
export async function runCandidates({ prompt, mapFile, config, now }) {
  const { map, error } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  if (error || !map) return { candidates: [], mapTotal: 0, error: error || 'harita yok' };
  const promptTokens = tokenize(prompt);
  const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
  return {
    mapTotal: map.capabilities.length,
    candidates: candidates.map((c) => ({
      id: c.id, kind: c.kind, name: c.name, trust: c.trust,
      install: c.install?.command ?? null, score: scoreCapability(promptTokens, c)
    }))
  };
}
```

- [ ] **Step 5: Testleri çalıştır, geçtiklerini gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/candidates.test.js
```
Expected: PASS — iki test de yeşil.

- [ ] **Step 6: Tam plugin test setini çalıştır (regresyon)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test
```
Expected: PASS — 100 plugin testi (artı yeni assert'lar) yeşil; `pass 100+`, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add plugin/lib/cli.js plugin/test/candidates.test.js
git commit -m "feat(route): runCandidates çıktısına mapTotal (tam harita boyutu) ekle"
```

---

## Task 2: `installed` komutu — gerçek kurulu yetenek sayısı (kod + test)

**Files:**
- Modify: `plugin/lib/cli.js` (`countListed`, `runInstalledCount`, `installed` komutu)
- Create: `plugin/test/installed-cli.test.js`
- Create: `plugin/test/fixtures/plugin-list.sample.txt`, `plugin/test/fixtures/mcp-list.sample.txt`

Sayaç **gerçek `claude ... list` formatına** karşı çalışmalı. Fixture'lar bilinen örüntülere göre yazılır (plugin = `name@marketplace` satırları; mcp = `name: ...` satırları + bilinen empty-state metni), testler deterministik kalsın diye **commit'li**. Step 6'da gerçek komutla format doğrulanır; sapma varsa fixture+regex güncellenir.

- [ ] **Step 1: Fixture dosyalarını oluştur**

`plugin/test/fixtures/plugin-list.sample.txt` (kurulu 3 plugin — `name@marketplace` referansı):
```
Installed plugins:
api-security-testing@claude-plugins-official
docs-writer@claude-plugins-official
my-tool@community-marketplace
```

`plugin/test/fixtures/mcp-list.sample.txt` (kurulu 2 mcp server — `name: ...` satırı):
```
github: https://api.githubcopilot.com/mcp/ (HTTP) - ✓ Connected
filesystem: npx -y @modelcontextprotocol/server-filesystem - ✓ Connected
```

- [ ] **Step 2: Failing test dosyasını yaz**

`plugin/test/installed-cli.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countListed, runInstalledCount } from '../lib/cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

test('countListed counts plugins from `claude plugin list` output', () => {
  assert.equal(countListed('plugin', read('plugin-list.sample.txt')), 3);
});
test('countListed counts mcp servers from `claude mcp list` output', () => {
  assert.equal(countListed('mcp', read('mcp-list.sample.txt')), 2);
});
test('countListed returns 0 on mcp empty-state help text', () => {
  assert.equal(countListed('mcp', 'No MCP servers configured. Use `claude mcp add` to add a server.'), 0);
});
test('countListed returns 0 on empty plugin output', () => {
  assert.equal(countListed('plugin', ''), 0);
});
test('runInstalledCount sums plugin+mcp via injected probe', async () => {
  const probe = async (cmd) => ({
    ok: true,
    text: cmd.includes('plugin') ? read('plugin-list.sample.txt') : read('mcp-list.sample.txt')
  });
  assert.deepEqual(await runInstalledCount({ probe }), { plugins: 3, mcp: 2, total: 5 });
});
test('runInstalledCount fail-soft: probe failure => 0, no throw', async () => {
  const probe = async () => ({ ok: false, text: '' });
  assert.deepEqual(await runInstalledCount({ probe }), { plugins: 0, mcp: 0, total: 0 });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/installed-cli.test.js
```
Expected: FAIL — `countListed`/`runInstalledCount` export edilmemiş (`is not a function`).

- [ ] **Step 4: `cli.js`'e `countListed` + `runInstalledCount` ekle**

`plugin/lib/cli.js` içinde, `probeList` fonksiyonundan SONRA (probe'a referans verebilmek için) şunları ekle:
```javascript
// Count installed capabilities from `claude plugin list` / `claude mcp list` output.
// Robust to headers/decoration: every installed plugin shows a `name@marketplace` ref;
// every mcp server shows a `name: ...` line (the empty-state help text => 0).
export function countListed(method, listText) {
  const text = String(listText);
  if (method === 'mcp') {
    if (/no\s+mcp\s+servers/i.test(text)) return 0;        // empty-state help text
    return text.split('\n').filter((l) => /^\s*[\w.-]+:\s/.test(l)).length;
  }
  return text.split('\n').filter((l) => /[\w.-]+@[\w.-]+/.test(l)).length;
}

// Probe both lists and count. probe defaults to the real probeList; tests inject a fake.
// Fail-soft: an unavailable/failed list command yields 0 for that channel (never throws).
export async function runInstalledCount({ probe = probeList } = {}) {
  const count = async (method) => {
    const p = await probe(verifyCmdFor(method));
    return p && p.ok ? countListed(method, p.text) : 0;
  };
  const plugins = await count('plugin');
  const mcp = await count('mcp');
  return { plugins, mcp, total: plugins + mcp };
}
```

- [ ] **Step 5: `installed` CLI komutunu `main`'e ekle**

`plugin/lib/cli.js` `main` fonksiyonunda, `execute` dalından SONRA, `else` (Usage) dalından ÖNCE ekle:
```javascript
  } else if (cmd === 'installed') {
    const res = await runInstalledCount();
    console.log(JSON.stringify(res));
```

- [ ] **Step 6: Testi çalıştır + gerçek formatı doğrula**

Run (birim testleri):
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/installed-cli.test.js
```
Expected: PASS — 6 test yeşil.

Sonra gerçek format doğrulaması (kurulu durumun ne olursa olsun, sayı makul/çökme yok):
```bash
claude plugin list; echo '---'; claude mcp list; echo '==='; node lib/cli.js installed
```
Beklenen: son satır `{"plugins":P,"mcp":M,"total":T}` ve P/M, üstteki gerçek listelerle tutarlı. **Eğer gerçek format farklı dekorasyon kullanıyorsa** (ör. madde imi, renk kodu, farklı ayraç) ki sayım sapıyorsa: fixture'ları gerçek formata göre güncelle ve `countListed` regex'ini ona göre düzelt, sonra Step 2 testlerini tekrar geçir.

- [ ] **Step 7: Tam plugin test seti (regresyon)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test
```
Expected: PASS — `fail 0` (yeni testler dahil).

- [ ] **Step 8: Commit**

```bash
git add plugin/lib/cli.js plugin/test/installed-cli.test.js plugin/test/fixtures/plugin-list.sample.txt plugin/test/fixtures/mcp-list.sample.txt
git commit -m "feat(route): installed komutu — gerçek kurulu plugin/mcp sayısı (countListed, fail-soft)"
```

---

## Task 3: `SKILL.md`'ye Türkçe ilerleyiş anlatımı kuralı ekle

**Files:**
- Modify: `plugin/skills/capability-router/SKILL.md`

Prompt metni birim-testlenmez; doğrulama Task 1+2 testleri + spec şablonuyla yapılır. Adımlar tek aksiyon olacak şekilde ayrıldı.

- [ ] **Step 1: "İlerleyiş anlatımı (Türkçe)" bölümünü Inputs'tan sonra ekle**

`plugin/skills/capability-router/SKILL.md` içinde, `## Inputs` bloğunun bittiği satır (`- `PLUGIN_ROOT`: ...` satırı, mevcut dosyada satır 13) ile `## Step 1 — Gather candidates` başlığı arasına şu bölümü ekle:

```markdown

## Progress narration (Turkish — REQUIRED)
All user-facing progress and summaries MUST be written in **Turkish**. At the start emit ONE
intro line stating the skill is active plus the total map size and installed count; at each main
step below emit ONE short Turkish progress line; at the very end emit one consolidated summary
block. Do NOT dump raw CLI output — summarize it in your own words. (The CLI's own `lines`
output is already Turkish; this rule pins YOUR narration to Turkish too.) Narration templates
(wording need not be verbatim) are given inline at each step under "Anlat:".
```

- [ ] **Step 2: Step 1'e intro (skill devrede) + aday-sayısı anlatımı ekle**

`## Step 1 — Gather candidates (deterministic)` bölümünün sonuna (the "Parse the JSON. If `candidates` is empty..." satırından sonra) ekle:

```markdown

Parse `mapTotal` (the full capability-map size) and `candidates.length` from the JSON. Then run
the installed-inventory command once and parse its JSON `{ "plugins", "mcp", "total" }`:
\`\`\`bash
node "$PLUGIN_ROOT/lib/cli.js" installed
\`\`\`
**Anlat (intro — skill devrede):**
`🟢 cc-autopilot devrede — toplam harita: <mapTotal> yetenek, kurulu: <installed.total>.`
**Anlat (adaylar):** `🔎 <candidates.length> aday buldum.`
If `candidates` is empty: `🔎 Bu istek için uygun aday yok — varsayılan davranışla devam ediyorum.`
Remember `mapTotal`, `installed.total` and the candidate count — the final summary (Step 8) reuses them.
```

- [ ] **Step 3: Step 6'ya karar anlatımı ekle**

`## Step 6 — Validate (deterministic)` bölümünün sonuna ekle:

```markdown

**Anlat:** `🧠 Konsey kararı: <decision> — yetenek(ler): <id'ler> (gerekçe: <kısa>).`
For `no_capability_needed`: `🧠 Özel yetenek gerekmiyor — varsayılan davranışla devam ediyorum.`
```

- [ ] **Step 4: Step 7'ye kurulum anlatımı ekle**

`## Step 7 — Present and (if needed) install` bölümünde, `Report the final decision: the `decision`, chosen `capabilities`, `method`, and `rationale`.` satırını şununla değiştir:

```markdown
Report the final decision in Turkish: the `decision`, chosen `capabilities`, `method`, and `rationale`.

**Anlat (kurulumdan sonra):** `📦 <kurulan sayısı> kuruldu, <atlanan/zaten var sayısı> atlandı.`
If any are `needs-approval`: `⏳ <sayı> yetenek onay bekliyor.` and ask the approval question in Turkish.
If any `failed`: `⚠️ <sayı> yetenek kurulamadı — o yetenek olmadan devam ediyorum.`
```

- [ ] **Step 5: Step 8'e yürütme anlatımı + final özet ekle**

`## Step 8 — Execute (carry out the task)` bölümünde, `- Report what was executed, what was skipped, and any errors.` satırını şununla değiştir:

```markdown
- **Anlat (yürütmeye başlarken):** `▶️ Bunları kullanarak başlıyorum: <yöntem>.`
  For side-effecting steps, ask the approval question in Turkish (show the exact command).
- Report what was executed, what was skipped, and any errors — in Turkish.
- **Final toplu özet** (akışın en sonunda, tek blok; Step 1'deki sayıları, `mapTotal` ve `installed.total`'ı kullan):
  ```
  Özet: <aday sayısı> aday bulundu, <kurulan sayısı> kuruldu, toplam harita <mapTotal> yetenek, kurulu <installed.total>.
  <ne ile başlandığı / sonuç>.
  ```
```

- [ ] **Step 6: Tam plugin test setini çalıştır (regresyon — SKILL değişikliği kodu kırmamalı)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test
```
Expected: PASS — `fail 0` (SKILL.md değişikliği yalnızca prompt metni; kod etkilenmez).

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/capability-router/SKILL.md
git commit -m "feat(route): SKILL'e Türkçe adım-adım ilerleyiş + final özet anlatımı"
```

---

## Self-Review (planlama sonrası — yazar kontrolü)

**1. Spec coverage:**
- Spec §2 (Parça A `mapTotal`, başarı + hata yolu) → Task 1 (Step 1/2 testler, Step 4 implementasyon). ✓
- Spec §3 (Parça B `installed`/`countListed`/`runInstalledCount`, runtime, fail-soft, format yakalama) → Task 2 (Step 1–6). ✓
- Spec §4 (Parça C SKILL anlatımı; intro + Step 1/6/7/8 + final özet, kurulu sayısı dahil) → Task 3 (Step 1–5). ✓
- Spec §6 (test stratejisi: `mapTotal===length`/`===0`; `countListed` dolu+empty; `runInstalledCount` fail-soft) → Task 1 Step 1/2 + Task 2 Step 2. ✓
- Spec "Kapsam dışı" (CLI `lines` değişmez; decide/install/execute + installer.js dokunulmaz; `/init`→SP11, oto-`/new`→SP12) → Task'larda yalnızca `runCandidates` + yeni `installed` komutu + SKILL.md değişiyor. ✓

**2. Placeholder scan:** TBD/TODO yok; her kod adımında tam kod var; her komutta beklenen çıktı var. Format-belirsizliği Task 2 Step 6'da gerçek-komut doğrulamasıyla kapatılıyor (tahmin değil). ✓

**3. Type consistency:** `mapTotal` (number) Task 1'de tanımlı, Task 3 anlatımında aynı isimle kullanılıyor. `installed` JSON şekli `{plugins,mcp,total}` Task 2'de tanımlı (`runInstalledCount` dönüşü), Task 3 anlatımında `installed.total` olarak kullanılıyor — tutarlı. `countListed(method, listText)` imzası Task 2 test+implementasyonda aynı. `candidates.length` tüm task'larda tutarlı. ✓
