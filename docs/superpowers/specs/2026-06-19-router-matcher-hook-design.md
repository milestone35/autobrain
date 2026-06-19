# cc-autopilot — Router + Matcher + Hook (Sub-project 2) — Tasarım Dokümanı

- **Tarih:** 2026-06-19
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`plugin/` alt-klasörü)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md` (genel mimari sözleşmesi, §3 ve §5.2)
- **Önceki alt-proje:** `docs/superpowers/plans/2026-06-19-indexer.md` (Indexer — `capability-map.json` üretici, TAMAMLANDI)

---

## 1. Amaç (Problem & Vizyon)

Indexer'ın ürettiği `capability-map.json` (canlı: 1029 yetenek) bugün **hiçbir şey tarafından
tüketilmiyor**. Bu alt-proje, haritayı tüketen **plugin katmanının walking-skeleton'unu** kurar:
her prompt'ta ucuz bir `UserPromptSubmit` hook çalışır, prompt'a göre haritadan aday yetenekleri
saf-lexical bir matcher ile bulur ve oturuma **pasif bir ipucu** olarak enjekte eder. Böylece
sistem ilk kez uçtan uca çalışır hale gelir ve `capability-map.json` sözleşmesi gerçek bir
tüketiciyle doğrulanır.

**Bu slice = walking skeleton.** Otonom karar (çok-ajanlı konsey) ve oto-kurulum bu alt-projede
**yok**; sonraki alt-projelere (SP3 konsey, SP4 installer) bırakılır. Bu paket onları öngörür
(manifest + config alanları yer açar) ama uygulamaz.

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, uzman düzeyi, user-friendly, %100 sağlam. Saf (LLM'siz) modüller deterministik
ve testli. Testsiz merge yok. "İdare eder" çözüm yok.

---

## 2. Mimari Seçim

**Yaklaşım 1 — Kendine-yeten plugin, saf-lexical matcher, durumsuz hook** seçildi.

- `plugin/` kendi Node paketidir (ESM, **sıfır runtime bağımlılığı**), indexer'ın yapısını aynalar
  (`lib/` + `cli.js` + `node --test`).
- Plugin, indexer'ı **yalnızca `capability-map.json` yolu/sözleşmesi** üzerinden tanır (üst spec §2
  sınırı). Indexer kaynaklarından **import yok**.
- Hook her prompt'ta **taze process** olarak doğar, haritayı yükler, skorlar, enjekte eder ve
  `exit 0` yapar. Durum/cache yok (gerek yok; 1029 cap taraması <50ms).

### Reddedilen alternatifler

- **Yaklaşım 2 — Paylaşılan çekirdek modül:** tokenizer/şema iki parça arasında ortak modüle
  çıkarılır. Tekrarı önler ama iki parçayı bağlar, "tek arayüz = JSON sözleşmesi" ilkesini bozar,
  Faz 2'de haritanın bağımsız dağıtımını zorlaştırır. Reddedildi.
- **Yaklaşım 3 — Önceden hesaplanmış ters indeks (`keyword → capability`):** indexer ek bir artifact
  üretir, hook O(eşleşen) arar. Erken optimizasyon (1029 tarama zaten <50ms), indexer kuplajı ve
  yeni artifact getirir. **Ertelendi** — harita devasa büyürse gelecekteki optimizasyon olarak
  yeniden değerlendirilir (§11).

---

## 3. Klasör Yapısı

```
plugin/                                  # cc-autopilot router (hafif, per-prompt)
├── .claude-plugin/plugin.json           # manifest: UserPromptSubmit hook + /route komutu
├── hooks/user-prompt-submit.js          # ince giriş: stdin→matcher→additionalContext; fail-open, exit 0
├── commands/route.md                    # /route <prompt> — preview CLI'yi çağıran ince sarmalayıcı
├── lib/
│   ├── config.js                        # autopilot.config.json yükle + varsayılanlar + validasyon
│   ├── map-loader.js                    # haritayı yükle (yol→Faz1; URL→Faz2 yeri hazır), schemaVersion guard, staleness
│   ├── matcher.js                       # tokenize + skorla + sırala + top-N (saf, deterministik)
│   └── cli.js                           # runPreview(prompt, opts) + main dispatch (indexer/cli.js paterni)
├── config/autopilot.config.json         # { enabled, mapSource, topN, scoreFloor, staleDays }
├── test/
│   ├── fixtures/capability-map.sample.json
│   ├── config.test.js
│   ├── map-loader.test.js
│   ├── matcher.test.js
│   ├── hook.test.js
│   └── preview.test.js
├── package.json                         # ESM, zero-dep, "test": "node --test"
└── README.md
```

**Sınır:** Hook = tespit + enjeksiyon + tetik (ucuz). Ağır mantık yok. Konsey (SP3) sonradan
`skills/capability-router/SKILL.md`, installer (SP4) `lib/installer.js` olarak eklenir; manifest +
config bunu öngörür ama bu slice'ta yok.

---

## 4. Veri Akışı

```
UserPromptSubmit (CC)
  → hook (hooks/user-prompt-submit.js)
      → config.js        (enabled? değilse sessiz exit 0)
      → map-loader.js    (yükle + schemaVersion guard + staleness;  hata → {error}, enjeksiyon yok)
      → matcher.js       (tokenize → skorla → sırala → top-N)
      → additionalContext enjekte  (aday varsa; stale ise tek satır not ekle)
  → exit 0   (her durumda; tüm mantık try/catch — fail-open)
```

`/route <prompt>` akışı (manuel, salt-okunur):
```
/route <prompt> (commands/route.md)
  → node lib/cli.js preview "<prompt>"  →  runPreview()  →  matcher  →  adaylar + skorlar (yazdır)
  (hiçbir şey kurmaz / karar vermez)
```

---

## 5. Matcher (saf, deterministik) — `lib/matcher.js`

**Tokenize (`tokenize(text) → string[]`):** `lowercase → [^a-z0-9]+ ile böl → len≥3 ve stopword
olmayan token → unique`. Indexer `deriveKeywords` mantığının **kasıtlı kopyası** (paylaşım değil;
sınır temiz kalsın). Stopword listesi indexer ile aynı tutulur.

**Skorlama (`scoreCapability(promptTokens, cap) → number`):** ağırlıklı token çakışması:

| Sinyal | Ağırlık |
|--------|---------|
| `name` token eşleşmesi | ×3 |
| `keywords[]` eşleşmesi | ×2 |
| `description` token eşleşmesi | ×1 |

`score = Σ (ağırlık × eşleşen-token-sayısı)`.

**Eşik & kapı (cömert):** `score > scoreFloor` (varsayılan `scoreFloor = 0`, yani ≥1 sinyal) olan
her aday uygundur. (Karar gerekçesi: kullanıcı cömert kapı istedi — keşfi maksimize et, gürültüyü
sıralama+top-N ile sınırla.)

**Sıralama & kesme (`rankCandidates(caps, opts) → cap[]`):** azalan `score` → eşitlikte azalan
`popularity.unique_installs` (yoksa 0) → eşitlikte artan `id`. **Tam deterministik.** İlk `topN`
(varsayılan 5) alınır. Hiç eşleşme yoksa boş dizi.

**Maliyet:** 1029 cap lineer skorlama <50ms. Defansif ~300ms tavan (`matchPrompt` zaman bütçesi);
aşılırsa eldekiyle döner. `cost` ve `trust` matcher'ı **etkilemez** (konsey/installer işi) —
yalnızca çıktıya bilgi olarak taşınır.

**Dış arayüz:** `matchPrompt(prompt, map, opts) → { candidates: cap[], promptTokens }`.

---

## 6. Map-loader & Staleness — `lib/map-loader.js`

`loadMap(opts) → { map, error, stale, ageDays }` (exception fırlatmaz; hata `error` alanında döner).

- **Kaynak çözümü:** `config.mapSource`. Varsayılan: plugin köküne göre
  `../indexer/data/capability-map.json` (sibling dizin). Mutlak yol da kabul. URL desteği (Faz 2)
  için arayüz hazır ama bu slice'ta yalnızca dosya yolu uygulanır.
- **Guard'lar:** dosya yok → `error`; bozuk JSON → `error`; `schemaVersion !== 1` → net `error`.
  Hiçbiri throw etmez; hook fail-open karar verir.
- **Staleness:** `now - generatedAt` → `ageDays`. `ageDays > staleDays` (varsayılan 14) ise
  `stale: true`. `now` test için enjekte edilebilir (deterministik).
- **Durumsuz:** her prompt'ta yükler; cross-prompt cache yok.

---

## 7. Hook & Enjeksiyon Formatı — `hooks/user-prompt-submit.js`

- `UserPromptSubmit` hook: stdin'den `{ prompt, ... }` JSON okur.
- `config.enabled === false` → anında sessiz `exit 0`.
- Aday yoksa → çıktı yok, `exit 0`.
- Aday varsa → CC sözleşmesi `hookSpecificOutput.additionalContext` ile **kompakt** ipucu enjekte:

```
[cc-autopilot] Bu istek için işe yarayabilecek yetenekler (harita: 1029 yetenek):
- 42crunch-scan   (skill·trusted)   — Automate API security in Claude Code.
    kur: claude plugin install api-security-testing@claude-plugins-official
- security-review (command·trusted) — …
(Alakasızsa yok say. Karar/kurulum sonraki sürümde otomatikleşecek.)
```

  - Her satır: `name (kind·trust) — tek-satır desc`; gerekiyorsa `kur:` satırı (install.command).
  - Harita `stale` ise başlığa tek satır not: `(harita N gün eski — 'npm run scan' önerilir)`.
    Yalnızca **zaten enjekte ederken** eklenir; sessiz prompt'larda dırdır yok.
- **Yumuşak ipucu dili** → Claude alakasızları ucuza eler.
- **Fail-open:** tüm mantık try/catch (ve stdin okuma + zaman bütçesi guard'ı); herhangi bir
  hata/timeout → çıktı yok, `exit 0`, prompt normal akar. Router prompt'u **asla bozmaz**.
- **Test edilebilirlik:** çekirdek `handleHook({ stdin, mapPath, config, now }) → { additionalContext } | null`
  saf fonksiyon olarak ayrılır; hook dosyası yalnızca stdin/stdout/exit kabuğudur.

---

## 8. `/route` Preview Komutu — `commands/route.md` + `lib/cli.js`

- `/route <prompt>` → matcher'ı **salt-okunur** çalıştırır, adayları + skorları yazdırır, hiçbir
  şey kurmaz/karar vermez.
- İnce sarmalayıcı: komut markdown'ı `node lib/cli.js preview "<prompt>"` çağırır ve çıktıyı
  gösterir.
- Çekirdek `runPreview(prompt, opts) → summary` lib'de — deterministik, testable birim.
  `cli.js` `main` dispatch'i `preview` komutunu çözer (indexer `cli.js` paterni:
  `runScan`/`runStatus` ↔ burada `runPreview`).
- SP3 bu komutu "konseyi tetikle" olacak şekilde yükseltir (arayüz korunur).

---

## 9. Config — `config/autopilot.config.json` + `lib/config.js`

```json
{ "enabled": true, "mapSource": "../indexer/data/capability-map.json",
  "topN": 5, "scoreFloor": 0, "staleDays": 14 }
```

`loadConfig(opts) → config`: dosyayı okur, varsayılanlarla birleştirir, tip-validasyonu yapar.
Bozuk/eksik config → ilgili alanlar varsayılana düşer (fail-open). `enabled` ile tüm router tek
anahtarla kapatılabilir.

---

## 10. Hata Yönetimi

**Ana ilke: router kullanıcının prompt'unu asla bozmaz.**

- **Hook fail-open** — tüm mantık try/catch; hata/timeout → `exit 0`, çıktı yok.
- **map-loader** — yok/bozuk/desteklenmeyen `schemaVersion` → `{error}`, enjeksiyon yok (net mesaj
  preview/log'da görünür).
- **config** — bozuk → varsayılanlar.
- **Salt-okuma** — plugin haritayı yalnızca okur; atomik-yazım/dosya-bozma riski yok.
- **Bayat harita** — `stale` ise enjekte edilen ipucuna tek satır not + `scan` önerisi.

---

## 11. Test Stratejisi

`node --test` (built-in), `node:assert/strict`, fixture map. Tümü deterministik (`now` enjekte).

- **matcher** — `tokenize` (lowercase/stopword/len≥3/unique); skor ağırlıkları (name×3,
  keyword×2, desc×1); sıralama/tie-break determinizmi (skor→popularity→id); `topN` kesme;
  boş-eşleşme → `[]`.
- **map-loader** — yok→error; bozuk JSON→error; `schemaVersion≠1`→error; geçerli→map;
  staleness hesabı (enjekte `now` ile `stale`/`ageDays`).
- **config** — varsayılan birleştirme; bozuk config→varsayılan; `enabled:false` taşınır.
- **hook** — fail-open (bozuk stdin→çıktısız, throw yok); `enabled:false`→sessiz; geçerli→
  `additionalContext` üretir; stale→not eklenir. `handleHook` saf fonksiyonu enjekte-bağımlılıkla
  çağrılır.
- **preview/runPreview** — verili prompt+fixture için deterministik özet çıktı.

Hedef: her saf modül deterministik + birim test kapsamında. Kalite çıtası gereği testsiz merge yok.

---

## 12. Kapsam

**Dahil (bu slice):** plugin manifesti + `UserPromptSubmit` hook (pasif ipucu enjeksiyonu) +
saf-lexical matcher + map-loader (yol, schemaVersion guard, staleness) + config + `/route` preview
komutu + testler + README.

**Hariç (sonraki alt-projeler):**
- Çok-ajanlı karar konseyi skill'i + otonom karar (SP3).
- Trusted-list oto-installer + kurulum-doğrulama + candidate/unknown onay akışı (SP4).
- Publish / remote harita tüketimi (Faz 2) — map-loader'da yalnızca arayüz yeri hazır.
- Web-keşif source'ları (indexer alt-projesi; ayrı).

---

## 13. Açık Konular / İleride Karar

- **Cömert kapı + 1029-cap harita** çoğu kodlama prompt'unda tetiklenebilir. Bu kasıtlı (keşif
  önceliği); gürültü artarsa `scoreFloor`/`topN` config'den sıkılır veya kapı tier'lı yapılır.
  İlk sürümde ölçüp gerekiyorsa ayarlanacak.
- **Ters indeks (Yaklaşım 3)** — harita çok büyürse (ör. web-keşif sonrası 10k+) skorlama maliyeti
  ölçülüp değerlendirilecek.
- **`/route` ↔ konsey** — SP3'te bu komutun konseyi tetikleyecek şekilde yükseltilmesi; arayüz
  (`runPreview`) korunarak.
