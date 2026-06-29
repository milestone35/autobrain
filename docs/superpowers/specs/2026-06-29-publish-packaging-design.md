# cc-autopilot — Yayın Paketleme: Marketplace Manifest + Gömülü Harita (SP13) — Tasarım Dokümanı

- **Tarih:** 2026-06-29
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (kök + `plugin/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-proje:** SP11 (`/autopilot-tune`) TAMAMLANDI, `master`'a merge edildi. Toplam 228 test (indexer 109 + plugin 119).

---

## 1. Amaç (Problem & Vizyon)

cc-autopilot çalışır durumda ama **kimse indirip kullanamıyor**: (a) bir Claude Code
**marketplace** manifest'i yok, (b) plugin'in yetenek haritası config'i `../indexer/data/...`'ı
yani **plugin dizininin dışını** gösteriyor — sadece `plugin/` kurulduğunda harita bulunamaz ve
`/route` boş çalışır (fail-open), (c) repo tamamen yereldir (remote yok) ve yayın artığı dosyalar
(`*.stackdump`, `test.txt`) izlenmiyor.

**Kullanıcı isteği (2026-06-29):** Marketplace manifest'ini kur, GitHub'a publish'e hazırla,
yetenek haritasını da göm.

**Karar (kullanıcı onaylı):** Plugin'i **self-contained** yap (haritayı içine göm), repo köküne
**aynı-repo marketplace** manifest'i ekle, repo'yu temizle. GitHub push + community marketplace
başvurusu kullanıcıya bırakılır (kimlik gerektirir).

### Kapsam

- Gömülü harita + config repoint (plugin self-contained).
- Repo kökünde `.claude-plugin/marketplace.json` (aynı repo, source `./plugin`).
- `.gitignore` + stray dosya temizliği + `README.md` commit.
- Doğrulama (regresyon + canlı gömülü-harita kontrolü).

### KAPSAM DIŞI (açıkça)

- **GitHub'a push + remote ekleme** → kullanıcı yapar (kimlik). Plan komutları hazır verir.
- **Community marketplace başvurusu** (`platform.claude.com/plugins/submit`) → kullanıcı.
- **Harita oto-tazeleme / CI** → yok. Tazeleme manuel kopya (README'de dokümante).
- Plugin/skill mantığında değişiklik yok (yalnızca config repoint + paketleme dosyaları).

---

## 2. Gömülü harita (self-contained plugin)

- **`plugin/data/capability-map.json`** (YENİ, commit'li) = mevcut
  `indexer/data/capability-map.json` snapshot'ının kopyası (1263 cap, `generatedAt`
  2026-06-26, kaynaklar: builtin+known+official+github+npm+mcp-registry+pypi). ~1.6 MB.
- **`plugin/config/autopilot.config.json`** → `mapSource`:
  `"../indexer/data/capability-map.json"` → **`"./data/capability-map.json"`**. staleDays 14 kalır.
- **`plugin/lib/config.js`** → `DEFAULTS.mapSource`: `'../indexer/data/capability-map.json'` →
  **`'./data/capability-map.json'`**. Böylece config eksik/bozuk olsa bile fallback gömülü
  haritayı bulur (tam self-contained).
- **Çözümleme:** `cli.js resolveMapFile` mapSource'u `PLUGIN_ROOT` (= `plugin/`) köküne göre
  `path.resolve` ediyor → `./data/capability-map.json` = `plugin/data/capability-map.json`. Doğru.
- **Regresyon-güvenliği:** `plugin/test/config.test.js` mapSource'u **sembolik** olarak
  `DEFAULTS.mapSource`'a karşı doğruluyor (literal string değil) → DEFAULTS değişince testler
  yeşil kalır. (Plan yine de tam suite çalıştırır.)
- **Tazeleme (dokümante, kod yok):** indexer haritayı üretmeye devam eder
  (`indexer/data/capability-map.json`); bundle'ı güncellemek için
  `cp indexer/data/capability-map.json plugin/data/capability-map.json` (README'de yazılır).

---

## 3. Marketplace manifest (aynı repo)

- **`.claude-plugin/marketplace.json`** (YENİ, repo KÖKÜNDE):
  ```json
  {
    "name": "cc-autopilot",
    "owner": { "name": "harun.hanbay" },
    "plugins": [
      {
        "name": "cc-autopilot",
        "source": "./plugin",
        "description": "Routes each prompt to the best capabilities from the cc-autopilot capability map; council decides, installs trusted capabilities, executes — with Turkish narration.",
        "version": "0.1.0"
      }
    ]
  }
  ```
- Kök'te **yalnızca** `marketplace.json` (plugin.json yok) → kök = marketplace, plugin = `./plugin`
  (mevcut `plugin/.claude-plugin/plugin.json` değişmez).
- `owner.email` opsiyonel — gizlilik için **dahil edilmez** (kullanıcı isterse ekler).
- Kurulum akışı (kullanıcılar):
  `/plugin marketplace add <gh-kullanıcı>/cc-autopilot` → `/plugin install cc-autopilot@cc-autopilot`.

---

## 4. Publish hazırlığı (temizlik)

- **`.gitignore`** (YENİ, repo kökü): en az `*.stackdump`, `node_modules/`. Geçici/scratch artıkları.
- **Stray dosyalar:** `bash.exe.stackdump`, `indexer/bash.exe.stackdump`, `test.txt` → repodan
  temizlenir (untracked; silinir) ve `.gitignore` ile tekrar sızması engellenir.
- **`README.md`** (şu an untracked) → commit edilir (marketplace listing + plugin tanıtımı).
  Plan, README'nin kurulum talimatını (`/plugin marketplace add ...`) içerdiğini doğrular/ekler.

---

## 5. Test / doğrulama

- **Tam plugin suite** (`node --test`): config repoint sonrası `fail 0` (mapSource resolve
  regresyon; config.test.js sembolik olduğundan geçer).
- **Canlı gömülü-harita kontrolü:** `node plugin/lib/cli.js candidates "audit api security"`
  (veya benzeri) → çıktının `mapTotal` alanı **1263** (gömülü snapshot boyutu); `../indexer`
  yokken bile çalışır. (Doğrulama için geçici olarak indexer/data'ya bakılmadan plugin/data'dan
  okunduğu teyit edilir.)
- **JSON geçerliliği:** `marketplace.json` ve `plugin.json` parse edilir; `source: "./plugin"`
  diskte mevcut.

---

## 6. Mimari & İzolasyon

- Değişiklik **paketleme yüzeyinde**: yeni veri dosyası (gömülü harita), iki config repoint,
  yeni marketplace manifest, .gitignore + README. Çalışma-zamanı **mantığı** (matcher/decision/
  installer/execution/checks) etkilenmez.
- Plugin artık tek-dizin (`plugin/`) olarak kendi kendine yeter; `indexer/` yalnızca geliştirici
  tarafı harita üreticisi olarak kalır (yayınlanan plugin'in çalışma-zamanı bağımlılığı değil).

---

## 7. Riskler / Açık Noktalar

- **Risk:** Gömülü harita zamanla eskir (staleDays=14 → 2 hafta sonra preview/hook'ta "Ng eski"
  notu). Kabul edildi (kullanıcı 14'te bırakmayı seçti); harita yine çalışır, sadece bilgilendirir.
- **Risk:** 1.6 MB JSON repoya girer. Kabul edilebilir (git için sorun değil).
- **Risk:** mapSource repoint config.test.js'i kırabilir — düşük; test sembolik. Plan tam suite
  ile teyit eder.
- **Açık nokta yok:** İki tasarım kararı (mevcut tam snapshot gömme; staleDays=14) ve self-contained
  repoint + aynı-repo marketplace + temizlik kullanıcı tarafından onaylandı. Push + başvuru kullanıcıda.

---

## 8. Kalite Çıtası

Teknik borçsuz, self-contained plugin, deterministik repoint + testli regresyon, temiz repo.
İndiren kullanıcıda `/route` gömülü haritayla gerçekten çalışır. İlgili:
`docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
