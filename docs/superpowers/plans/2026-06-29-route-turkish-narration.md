# `/route` Türkçe İlerleyiş Anlatımı + Toplam Harita Boyutu (SP10) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/route` skill'i çalışırken kullanıcıya Türkçe adım-adım ilerleyiş + sonda toplu özet versin ve her zaman toplam yetenek haritası boyutunu göstersin.

**Architecture:** İki parça. (A) `plugin/lib/cli.js` içindeki `runCandidates`, çıktısına türetilmiş `mapTotal` (tam harita boyutu) alanını ekler — saf veri eki, başka modül etkilenmez. (B) `plugin/skills/capability-router/SKILL.md`, ajana her ana adımda tek satırlık Türkçe ilerleyiş + sonda toplu özet yazdıran bir anlatım kuralı içerir.

**Tech Stack:** Node.js ESM (zero-dep), `node --test` (built-in test runner), Markdown SKILL prompt.

> **Ortam notu (build-setup):** Node sistem PATH'inde DEĞİL. Test/CLI'dan önce Git Bash'te:
> `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`
> Testler: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`

---

## File Structure

- **Modify:** `plugin/lib/cli.js` — `runCandidates` dönüş objesine `mapTotal` eklenir (başarı + hata yolu). Başka fonksiyon dokunulmaz.
- **Modify:** `plugin/test/candidates.test.js` — `mapTotal` doğrulaması (başarı yolunda tam harita boyutu, hata yolunda 0).
- **Modify:** `plugin/skills/capability-router/SKILL.md` — "İlerleyiş anlatımı (Türkçe)" bölümü + adım anlatım talimatları.

`decide`/`install`/`execute` komutları ve diğer lib modülleri **değişmez**.

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

## Task 2: `SKILL.md`'ye Türkçe ilerleyiş anlatımı kuralı ekle

**Files:**
- Modify: `plugin/skills/capability-router/SKILL.md`

Prompt metni birim-testlenmez; doğrulama Task 1'in `mapTotal` testi + spec şablonuyla yapılır. Adımlar tek aksiyon olacak şekilde ayrıldı.

- [ ] **Step 1: "İlerleyiş anlatımı (Türkçe)" bölümünü Inputs'tan sonra ekle**

`plugin/skills/capability-router/SKILL.md` içinde, `## Inputs` bloğunun bittiği satır (`- `PLUGIN_ROOT`: ...` satırı, mevcut dosyada satır 13) ile `## Step 1 — Gather candidates` başlığı arasına şu bölümü ekle:

```markdown

## Progress narration (Turkish — REQUIRED)
All user-facing progress and summaries MUST be written in **Turkish**. At each main step
below, emit ONE short Turkish progress line; at the very end, emit one consolidated summary
block. Do NOT dump raw CLI output — summarize it in your own words. (The CLI's own `lines`
output is already Turkish; this rule pins YOUR narration to Turkish too.) Narration templates
(wording need not be verbatim) are given inline at each step under "Anlat:".
```

- [ ] **Step 2: Step 1'e aday-sayısı + toplam-harita anlatımı ekle**

`## Step 1 — Gather candidates (deterministic)` bölümünün sonuna (the "Parse the JSON. If `candidates` is empty..." satırından sonra) ekle:

```markdown

Parse `mapTotal` (the full capability-map size) and `candidates.length` from the JSON.
**Anlat:** `🔎 <candidates.length> aday buldum (toplam harita: <mapTotal> yetenek).`
If `candidates` is empty: `🔎 Bu istek için uygun aday yok — varsayılan davranışla devam ediyorum.`
Remember `mapTotal` and the candidate count — the final summary (Step 8) reuses them.
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
- **Final toplu özet** (akışın en sonunda, tek blok; Step 1'deki sayıları ve `mapTotal`'ı kullan):
  ```
  Özet: <aday sayısı> aday bulundu, <kurulan sayısı> kuruldu, toplam harita <mapTotal> yetenek.
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
- Spec §3 (Parça B SKILL anlatımı; Step 1/6/7/8 + final özet) → Task 2 (Step 1–5). ✓
- Spec §5 (test stratejisi: başarı `mapTotal===length`, hata `mapTotal===0`, regresyon) → Task 1 Step 1/2/6. ✓
- Spec "Kapsam dışı" (CLI `lines` değişmez, yeni komut yok, decide/install/execute dokunulmaz) → Task'larda yalnızca `runCandidates` + SKILL.md değişiyor. ✓

**2. Placeholder scan:** TBD/TODO yok; her kod adımında tam kod var; her komutta beklenen çıktı var. ✓

**3. Type consistency:** Tek yeni alan `mapTotal` (number) — Task 1'de tanımlandı, Task 2'de aynı isimle (`<mapTotal>`) anlatımda kullanıldı. `candidates.length` her iki task'ta tutarlı. ✓
