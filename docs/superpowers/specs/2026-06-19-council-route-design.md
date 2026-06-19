# cc-autopilot — Çok-Ajanlı Karar Konseyi + `/route` Yükseltme (Sub-project 3) — Tasarım Dokümanı

- **Tarih:** 2026-06-19
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`plugin/` alt-klasörü)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md` (§6 konsey, §5.2 tetikleme)
- **Önceki alt-projeler:** `2026-06-19-indexer.md` (SP1), `2026-06-19-router-matcher-hook-design.md` (SP2). İkisi de TAMAMLANDI (`feat/indexer`).

---

## 1. Amaç (Problem & Vizyon)

SP2 her prompt'ta aday yetenekleri **pasif ipucu** olarak enjekte ediyor ama hiçbir **karar**
vermiyor. Bu alt-proje, design §6'daki **özerk çok-ajanlı karar konseyini** kurar: kullanıcı
`/route <istek>` yazınca, matcher adayları toplanır, bir **Planner** ve bir **Critic** subagent'ı
(gerçek izole bağlam) en iyi yetenek setini ve yürütme yöntemini tartışarak **tek karar objesi**
üretir. Konsey **karar verir ama kurmaz** — kurulum SP4'e aittir.

**Bu slice = açık (explicit) otonom karar.** Konsey yalnızca `/route` ile tetiklenir; SP2 hook'u
pasif ipucu olarak **değişmeden** kalır. Hook→konsey otomatik tetikleme (design §5.2 nihai hali)
sonraki bir işe bırakılır.

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, uzman düzeyi, user-friendly, %100 sağlam. Deterministik kenarlar (aday toplama,
karar doğrulama) saf modüllerde + unit-testli. LLM kısmı (konsey) transkript-smoke ile doğrulanır.
Testsiz merge yok.

---

## 2. Mimari Seçim

**Yaklaşım 1 — SKILL.md orkestrasyonu + gerçek subagent'lar + deterministik I/O sözleşmesi** seçildi.

- Konsey, `skills/capability-router/SKILL.md` içindeki LLM tarifidir; ana oturumda **Planner** ve
  **Critic**'i ayrı subagent'lar (Task tool, izole bağlam) olarak dispatch eder → gerçek bağımsızlık.
- Deterministik kenarlar **kodda** ve testlidir: aday toplama (`cli.js candidates`, `matchPrompt`'ı
  yeniden kullanır) ve karar doğrulama (`lib/decision.js` + `cli.js decide`).
- `/route` komutu skill'i tetikler. Skill `cli.js` deterministik araçlarını çağırır.
- Plugin indexer'ı yalnızca `capability-map.json` üzerinden tanır (SP2 sınırı korunur).

### Reddedilen alternatifler

- **Workflow-tool ile deterministik orkestrasyon:** açık opt-in gerektirir, ağırdır, her oturumda
  garanti değil. SKILL+Task per-invocation native mekanizmadır. Reddedildi.
- **Saf SKILL.md (deterministik katman yok):** bozuk/uydurma karar objesi yakalanmaz; kalite
  çıtasıyla çelişir. Reddedildi (deterministik `lib/decision.js` tercih edildi).
- **Tek-bağlam rol-yapma (subagent yok):** ucuz ama "konsey" simüledir, bağımsız denetim zayıf,
  önyargı riski. Reddedildi (gerçek subagent'lar tercih edildi).
- **Konsey şekli:** Çok-perspektifli panel bu slice için aşırı; minimal tek-tur ise sağlamlık için
  yetersiz. **Planner + Critic, ≤2 tur** seçildi.

---

## 3. Klasör Yapısı (yeni/değişen)

```
plugin/
├── skills/capability-router/SKILL.md   # YENİ: konsey orkestrasyonu (LLM: Planner+Critic, ≤2 tur)
├── lib/decision.js                     # YENİ: validateDecision + normalizeDecision (deterministik, testli)
├── lib/cli.js                          # GENİŞLET: `candidates` (JSON) + `decide <file>` subcommand
├── commands/route.md                   # YÜKSELT: capability-router skill'ini tetikler
├── config/autopilot.config.json        # +confidenceThreshold (varsayılan 0.6)
├── lib/config.js                       # +confidenceThreshold validasyonu
└── test/
    ├── decision.test.js                # validate + normalize
    ├── candidates.test.js              # cli candidates JSON çıktısı
    └── decide.test.js                  # cli decide normalize/fail-soft
```

**Sınır:** `lib/*` deterministik + testli; `SKILL.md` LLM, smoke ile. Konsey karar üretir, kurmaz
(SP4). `commands/route.md` artık konseyi tetikler; salt-okunur skor önizlemesi `cli.js candidates`
(ve SP2'den `preview`) ile hâlâ erişilebilir.

---

## 4. Veri Akışı (`/route <istek>`)

```
/route <istek>  (commands/route.md → capability-router skill)
  1. Aday topla:   node lib/cli.js candidates "<istek>"   → JSON aday[]
                   (boşsa → no_capability_needed, konsey çağrılmaz, dur)
  2. Planner subagent (Task): istek + adaylar → öneri { capabilities[], method, rationale, confidence }
  3. Critic subagent (Task):  istek + adaylar + Planner önerisi → saldırı + düzeltme + verdict + confidence
  4. Yakınsama: Critic ciddi itiraz eder ve tur < 2 ise → Planner'ı Critic geri-bildirimiyle 1 kez
                revize et → (opsiyonel) Critic tekrar. Aksi halde yakınsa.
  5. Sentez: ana ajan tek karar objesi kurar (§5 şema) → scratch dosyaya yazar.
  6. Doğrula:  node lib/cli.js decide <scratchFile>  → validateDecision + normalizeDecision
               (config.confidenceThreshold) → normalize karar + insan-özeti.
  7. Sun: kullanıcıya karar + (install_then_use ise) install komut(lar)ı. KURULUM YOK.
```

---

## 5. Karar Objesi & `lib/decision.js` (deterministik, testli)

**Şema (design §6):**
```json
{ "decision": "use_existing | install_then_use | no_capability_needed",
  "capabilities": ["id…"], "installs": ["id…"],
  "method": "yürütme planı", "rationale": "gerekçe", "confidence": 0.0 }
```

**`validateDecision(obj) -> errors[]`:**
- `decision` üç enum'dan biri mi
- `capabilities` ve `installs` string dizisi mi
- `confidence` 0–1 aralığında sonlu sayı mı
- `rationale` string mi
- Boş `errors` = geçerli.

**`normalizeDecision(obj, { confidenceThreshold, knownIds }) -> decision`:**
- Geçersiz/eksik alanları güvenli default'a çeker (deterministik).
- `confidence < confidenceThreshold` → **`no_capability_needed`'e düşürür** (yanlış-pozitif
  kurulumu engeller, design §6).
- `capabilities`/`installs` içindeki, haritada olmayan (`knownIds` dışı) id'leri eler — uydurma
  yetenek reddi.
- `use_existing` ve `no_capability_needed` → `installs` boşaltılır.
- `install_then_use` ama `installs` boş → `no_capability_needed`.
- Saf, throw'suz, deterministik.

`knownIds` = haritadaki tüm capability id'lerinin Set'i (CLI tarafından haritadan üretilir).

---

## 6. `cli.js` Genişlemesi

- **`candidates "<prompt>"`** → `matchPrompt` sonucunu **JSON** basar: her aday için
  `{ id, kind, name, trust, install, score }`. Konseyin makine-okunur girişi. Harita yok/hatalı →
  `{ candidates: [], error }` (fail-soft). `runPreview` ile ortak yol-çözüm/yükleme kullanılır.
- **`decide <decisionFile>`** → dosyadan karar JSON'unu okur; haritayı yükleyip `knownIds` üretir;
  `validateDecision` + `normalizeDecision` (config'den `confidenceThreshold`) uygular; normalize
  kararı + insan-özetini basar. Bozuk/okunamayan dosya veya geçersiz JSON → `no_capability_needed` +
  sebep (fail-soft, throw yok).
- `main` dispatch'i `preview` (mevcut), `candidates`, `decide` komutlarını çözer.

---

## 7. `SKILL.md` — `capability-router`

Konsey orkestrasyonunun LLM tarifi (frontmatter: `disable-model-invocation` — yalnızca `/route`
üzerinden tetiklenir):

- Bölüm 4 adımlarını sırayla yürütür.
- **Planner prompt şablonu:** girdi (istek + JSON adaylar) → çıktı sözleşmesi
  (`{ capabilities[], method, rationale, confidence }`). Kural: **yalnızca verilen adaylardan seç;
  uydurma id yok**; en ucuz/en uygun seti tercih et.
- **Critic prompt şablonu:** Planner önerisine saldırır — gerçekten gerekli mi? daha ucuz/zaten
  kurulu alternatif? güven/risk? token maliyeti makul mü? → verdict + düzeltme + confidence.
- **Yakınsama kuralı:** ≤2 tur; Critic ciddi itiraz + tur<2 → Planner revizyonu.
- **Geri çekilme:** belirsizlik/düşük güven → `no_capability_needed` (en güvenli/en ucuz).
- Her deterministik adımda `cli.js candidates`/`decide` çağrılır; nihai karar `decide`'dan geçer.

---

## 8. `/route` Yükseltme & Config

- **`commands/route.md`:** salt-preview yerine → "capability-router skill'ini şu istek için
  çalıştır: `$ARGUMENTS`". Frontmatter `allowed-tools` skill'in ihtiyaç duyduğu araçları
  (Task, Bash(node *)) kapsar.
- **`config/autopilot.config.json`:** `+confidenceThreshold` (varsayılan `0.6`).
- **`lib/config.js`:** `confidenceThreshold` `0–1 sonlu sayı` validasyonu; dışı → default.

---

## 9. Hata Yönetimi

- **Açık tetikleme** — `/route` kullanıcı-tetikli; SP2 hook'unun per-prompt fail-open kritikliği
  burada yok. Yine de konsey LLM adımı patlarsa SKILL net mesaj verir + `no_capability_needed`'e
  düşer; kullanıcının asıl iş akışı bozulmaz.
- **`cli.js candidates/decide`** — her zaman geçerli JSON veya fail-soft çıktı; throw yok.
- **Subagent ölümü** — SKILL eldeki en iyi kararla veya `no_capability_needed` ile kapanır.
- **Aday yok** — konsey hiç çağrılmaz (1. adımda durur).
- **Uydurma id** — `normalizeDecision` haritada olmayan id'leri eler.

---

## 10. Test Stratejisi

- **decision.js** — `validateDecision`: eksik/yanlış-tip/enum/confidence-aralığı; `normalizeDecision`:
  eşik-altı→`no_capability_needed`, uydurma-id eleme, `installs` temizleme,
  `install_then_use`+boş-installs→`no_capability_needed`. Unit.
- **cli candidates** — fixture map ile deterministik JSON çıktı; boş-eşleşme; harita-yok fail-soft.
- **cli decide** — geçerli dosya→normalize; bozuk JSON/eksik dosya→`no_capability_needed`; eşik
  uygulanışı; uydurma-id eleme.
- **config** — `confidenceThreshold` default + validasyon (negatif/>1/non-number → default).
- **SKILL/konsey (LLM)** — otomatik test yok; planda **2-3 transkript smoke senaryosu** belgelenir
  ve elle koşulur:
  1. Eşleşen, gerçek yetenek gerektiren istek → `use_existing` (veya kuruluysa) doğru set.
  2. Alakasız/önemsiz istek → `no_capability_needed`.
  3. Aday var ama gereksiz/aşırı → Critic reddi → düşük güven → `no_capability_needed`.

Hedef: her saf modül deterministik + birim test kapsamında; testsiz merge yok.

---

## 11. Kapsam

**Dahil (bu slice):** `capability-router` SKILL.md (Planner+Critic, ≤2 tur, gerçek subagent) +
`lib/decision.js` + `cli.js` `candidates`/`decide` + `/route` yükseltme + `confidenceThreshold`
config + deterministik testler + transkript smoke senaryoları.

**Hariç (sonraki alt-projeler):**
- Trusted-list oto-installer + kurulum-doğrulama + candidate/unknown onay akışı (SP4). SP3 yalnızca
  karar + install komutu **gösterir**.
- Hook→konsey otomatik tetikleme (design §5.2 nihai hali) — bu slice'ta hook pasif kalır.
- Publish / remote harita (Faz 2); web-keşif source'ları (indexer).

---

## 12. Açık Konular / İleride Karar

- **`confidenceThreshold` değeri (0.6):** ilk sezgisel; transkript smoke'larda ölçülüp ayarlanır.
- **Karar objesi JSON aktarımı:** SKILL kararı scratch dosyaya yazıp `cli.js decide <file>` çağırır
  (bash echo quoting kırılganlığından kaçınmak için). Scratch konumu plan'da netleşir.
- **Hook→konsey tetikleme:** ölçülen maliyet/değer sonrası ayrı bir slice'ta değerlendirilecek.
