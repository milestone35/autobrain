# autobrain — Manuel Harita Tazeleme + SHA-tabanlı Güncelleme (SP15) — Tasarım Dokümanı

- **Tarih:** 2026-06-29
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (yerel klasör adı; proje adı **autobrain**)
- **Sahip:** harun.hanbay
- **Önceki alt-proje:** SP14 (rebrand autobrain) TAMAMLANDI, `master`'a merge + `milestone35/autobrain`'e push. Toplam 228 test (indexer 109 + plugin 119).

---

## 1. Amaç

Plugin gömülü bir harita (`plugin/data/capability-map.json`) ile yayınlandı ama: (a) harita
zamanla eskir; (b) `version: 0.1.0` sabit olduğundan kullanıcılar `/plugin marketplace update`
yapsa bile güncellemeyi **almaz**; (c) haritayı tazelemek elle `cp` gerektiriyor.

**Kullanıcı modeli (onaylı, 2026-06-29):** CI/otomatik tarama YOK. Kullanıcı haritayı **kendi
günlük güncelleyip** `milestone35/autobrain`'e push'lar; son kullanıcılar plugin güncellemesiyle
çeker. Bu yüzden: kolay tek-komut tazeleme + her push'un kullanıcılara güncelleme olarak ulaşması.

### Kapsam

- **SHA-tabanlı güncelleme:** `version` alanını kaldır → her commit = yeni version.
- **`refresh-map` komutu:** scan + (doğrulayarak) `plugin/data`'ya kopyala.
- **Doküman:** günlük tazeleme akışı + kullanıcı güncelleme adımı.

### KAPSAM DIŞI

- CI/GitHub Action (kullanıcı manuel push istedi).
- Otomatik `git commit/push` (kullanıcı yapar; `refresh-map` git'e dokunmaz).
- `GITHUB_TOKEN` yönetimi (mevcut; `[[cc-autopilot-build-setup]]` memory'de).
- Plugin/indexer çalışma-zamanı mantığı (değişmez).

---

## 2. SHA-tabanlı güncelleme (version kaldırma)

Claude Code version çözümü: `plugin.json.version` → marketplace entry `version` → git commit SHA.
İlk ikisi yoksa SHA kullanılır → **her push yeni version** → `/plugin marketplace update autobrain`
ile kullanıcı en güncel commit'i (dolayısıyla en güncel gömülü haritayı) alır.

- **`plugin/.claude-plugin/plugin.json`:** `version` alanı SİLİNİR (`name`, `description`,
  `hooks` kalır).
- **`.claude-plugin/marketplace.json`:** `plugins[0].version` alanı SİLİNİR (`name`, `source`,
  `description` kalır).
- **`package.json` version'ları:** DOKUNULMAZ (private; CC plugin çözümünde kullanılmaz).

---

## 3. `refresh-map` komutu

- **`indexer/scripts/bundle-map.js`** (YENİ): yayınlanan haritayı güvenli güncelleyen ince modül.
  - `bundleMap({ srcMap, destMap, readFile, writeFile })` — DI'lı, saf-ish, testlenebilir:
    1. `readFile(srcMap)` → JSON.parse.
    2. **Doğrula:** `schemaVersion === 1` (veya mevcut sürüm) **ve** `Array.isArray(capabilities)
       && capabilities.length > 0`. Aksi halde `throw` (anlamlı mesaj) — `destMap` YAZILMAZ.
    3. Geçerliyse `writeFile(destMap, <srcContent>)` (ham içerik birebir; byte-eşdeğer kopya).
    4. `{ count }` döndür (kopyalanan cap sayısı, log için).
  - İnce CLI wrapper: gerçek `node:fs/promises` ile, `srcMap` = `<indexer>/data/capability-map.json`,
    `destMap` = `<repo>/plugin/data/capability-map.json` (yolları script konumundan `import.meta.url`
    ile çözer); başarıda `bundled <count> caps -> plugin/data/capability-map.json` basar.
- **`indexer/package.json`** script: `"refresh-map": "node src/cli.js scan && node scripts/bundle-map.js"`.
  - `scan` `indexer/data/capability-map.json`'ı üretir (per-source fail-soft; fatal hata → non-zero
    exit → `&&` durur → bundle çalışmaz → yayınlanan harita korunur).
  - `bundle-map.js` doğrulayıp `plugin/data`'ya kopyalar.
- **Git:** Script git'e DOKUNMAZ. Kullanıcı: `git add plugin/data/capability-map.json && git commit
  && git push origin master`.

---

## 4. Doküman

- **Kök `README.md`:** "Refreshing the published map" bölümü:
  - Günlük akış: `cd indexer && npm run refresh-map` → `git add plugin/data/capability-map.json &&
    git commit -m "chore: refresh map" && git push origin master`.
  - Kullanıcı tarafı: `/plugin marketplace update autobrain` → `/plugin install autobrain@autobrain`
    (yeni commit SHA = yeni version → güncel harita iner).
  - Not: `version` kaldırıldı; sürümleme commit-SHA tabanlı.
- **Memory `cc-autopilot-build-setup`:** `npm run refresh-map` (token gerektiğinde
  `GITHUB_TOKEN=... npm run refresh-map`) eklenir.

---

## 5. Test Stratejisi (TDD — testsiz merge yok)

**`indexer/test/bundle-map.test.js` (yeni):** `bundleMap` saf testleri, enjekte `readFile`/`writeFile`:
- Geçerli map (schemaVersion 1, capabilities.length>0) → `writeFile` doğru içerikle çağrılır,
  `{ count }` doğru.
- Boş capabilities (`[]`) → `throw`, `writeFile` **çağrılmaz**.
- Bozuk JSON / yanlış schemaVersion → `throw`, `writeFile` çağrılmaz.

**Kapsam dışı (test):** `scan`'in kendisi (ağ; mevcut indexer testleriyle zaten kaplı) ve
`refresh-map` script zinciri canlı koşulmaz; `bundleMap` birim-testi yeterli güvence.

Tam suite (indexer + plugin) yeşil kalır.

---

## 6. Mimari & İzolasyon

`bundle-map.js` tek sorumluluklu, DI'lı, FS'i enjekte alır → testler diske çıkmaz. Mevcut
indexer `store.js`/`scan` akışı değişmez (bundle ondan SONRA, ayrı adım). Plugin runtime'ı
etkilenmez. version kaldırma saf manifest değişikliği.

---

## 7. Riskler / Açık Noktalar

- **Risk:** version kaldırılınca tüm commit'ler (sadece harita değil) yeni version sayılır →
  kullanıcı her küçük commit'te güncelleme görür. Kabul: kullanıcı modeli zaten sık push; harita
  güncelliği önceliği. (İstenirse ileride yalnız-harita branch/release stratejisi ayrı iş.)
- **Risk:** `refresh-map` token'sız scan'de `github` source 0 katkı verir (fail-soft) → harita
  github plugin'leri olmadan tazelenir. Azaltım: doküman token'ı hatırlatır; `bundleMap` yine de
  geçerli (capabilities.length>0) map'i publish eder.
- **Açık nokta yok:** version kaldırma (SHA) ve bundleMap'in geçersiz scan'i publish etmemesi
  kullanıcı tarafından onaylandı.

---

## 8. Kalite Çıtası

Teknik borçsuz, DI'lı + testli `bundleMap` (kötü map publish edilmez), saf manifest değişikliği,
net günlük akış dokümanı. İlgili: `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
