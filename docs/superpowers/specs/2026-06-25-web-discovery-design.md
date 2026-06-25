# cc-autopilot — Web-Keşif Source'ları (Sub-project 7) — Tasarım Dokümanı

- **Tarih:** 2026-06-25
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`indexer/` + `plugin/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-projeler:** SP1–SP6 TAMAMLANDI, hepsi `master`'da. Repo tamamen YEREL (remote yok). Toplam 141 test (indexer 48 + plugin 93).

---

## 1. Amaç (Problem & Vizyon)

Bugün indexer yalnızca yerel/cache source'lardan besleniyor (`official`, `known`, `builtin`) ve
bunların hepsi `trusted` ya da `builtin`. Sonuç: trust sınıflandırmasının **`candidate`/`unknown`**
dalları ve SP4 installer'ının **onay yolu** kodda var, testli, ama CANLI değil — onları uyandıracak
veri kaynağı yok.

Bu alt-proje iki **web-keşif source'u** ekler — **GitHub** (gerçek CC plugin/marketplace repoları)
ve **npm** (MCP sunucu paketleri) — bunlar repo/kurulum bilgisiyle gelen yetenekler üretir, böylece
`candidate` tier'ı canlanır. Ayrıca installer **install yöntemine göre** doğru kurulum/doğrulama
yapacak şekilde sertleştirilir, böylece zincir uçtan uca tamamlanır:

```
prompt → matcher (candidate cap'ler görünür) → konsey install_then_use
  → installer: untrusted → tek onay → kur (marketplace add+install / mcp add)
  → method-aware doğrulama → SP6 Step 8 yürütme
```

### Kapsam

- **Registry'ler:** GitHub + npm. (PyPI'nin temiz arama JSON API'si olmadığından KAPSAM DIŞI — gelecek faz.)
- **Auth:** opsiyonel `GITHUB_TOKEN` env (yoksa kimliksiz best-effort).
- **Faz:** Faz 1 (yerel, kullanıcı tetikledikçe `node src/cli.js scan`). Publish/Faz 2 kapsam dışı.
- **Kurulum:** keşif + tip-farkındalı kurulum/doğrulama. Gerçek canlı kurulum ortam/ağ bağımlıdır →
  unit-test mock'lanır, gerçeği manuel smoke.

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, %100 sağlam. Saf `parse*`/yardımcı fonksiyonlar deterministik + fixture'larla tam
testli. **Testler ASLA ağa çıkmaz** (fetch enjekte edilir). Ağ/rate-limit hataları fail-soft:
source `ok:false` ile boş döner, scan asla bozulmaz. Testsiz merge yok.

---

## 2. Mimari & Veri Akışı

Mevcut `{ name, collect(ctx) }` source sözleşmesi korunur. Ağ erişimi `ctx.fetchJson` ile
**enjekte edilir** (SP4 installer DI deseni):

```
runScan → ctx.fetchJson = makeFetchJson(globalThis.fetch)   ← üretim
  sources: [official, known, builtin, github, npm]
    github.collect(ctx): code-search → her repo'nun marketplace.json'ı → plugin'ler
    npm.collect(ctx):    registry search (keywords:mcp) → MCP paketleri
        ↓ makeCapability  (repo/install var → trust: candidate)
  capability-map.json → matcher → konsey → installer(method-aware) → SP6 yürütme
```

Her source ikiye ayrılır: **saf `parse*(json)`** (fixture'larla tam test) + **ince `collect(ctx)`**
(fetch + parse + fail-soft). Testler `ctx.fetchJson` yerine fixture döndüren sahte fonksiyon geçirir.

**Yeni dosyalar:**
- `indexer/src/http.js` — `makeFetchJson(fetchImpl)` sarmalayıcı (2xx→JSON, aksi→null/throw).
- `indexer/src/sources/github.js`, `indexer/src/sources/npm.js`.
- `indexer/test/http.test.js`, `github.test.js`, `npm.test.js` + fixture'lar.

**Değişen dosyalar:**
- `indexer/src/sources/index.js` — github+npm kaydı.
- `indexer/src/cli.js` (runScan) — `ctx.fetchJson` enjeksiyonu.
- `indexer/src/trust.js` testleri — discoveredVia github/npm + repo → candidate.
- `plugin/lib/installer.js` — `planInstalls` plana `method` ekler.
- `plugin/lib/cli.js` — method-aware `verifyCmdFor`/`mcpListed`/`listed` + `realEnv` dallanması.

---

## 3. GitHub Source (`indexer/src/sources/github.js`)

`name: 'github'`.

**Keşif:** GitHub **code search API**:
```
GET https://api.github.com/search/code?q=filename:marketplace.json+path:.claude-plugin&per_page=30
Headers: Accept: application/vnd.github+json  (+ Authorization: Bearer $GITHUB_TOKEN varsa)
```

**Her bulunan repo için:**
1. `marketplace.json`'ı raw çek:
   `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/.claude-plugin/marketplace.json`
   (search sonucundaki `item.repository.full_name` + `item.path`'ten üretilir).
2. Manifest'i parse et — **`known-marketplaces` ile AYNI şekil** (`manifest.plugins[]`, `name`/`description`).
   DRY: ortak `parseMarketplaceManifest(manifest, { marketplaceName, repo, now, discoveredVia })`
   yardımcısı `normalize.js` veya paylaşılan bir modülde tanımlanır; hem `github` hem `known` kullanır.
3. Her plugin için `makeCapability`:
   - `kind: 'plugin'`, `marketplace: manifest.name || '<owner>-<repo>'`, `plugin: p.name`
   - `source: { repo: 'github:owner/repo', discoveredVia: 'github' }` → trust **candidate**
     (repo trusted-sources'ta ise trusted)
   - `install: { method: 'plugin', command: 'claude plugin marketplace add owner/repo && claude plugin install <p.name>@<mp>', package: null }`

**Saf fonksiyonlar (testli):**
- `parseCodeSearch(json)` → `[{ owner, repo, fullName, path }]` (en fazla per-source cap = 30).
- `parseMarketplaceManifest(manifest, meta)` → cap dizisi.
- `rawManifestUrl(fullName, path)` → raw URL.

**Hata yönetimi:** search non-2xx (403/rate-limit) → `{ capabilities: [], ok: false, error }`. Tek
repo'nun manifest fetch/parse'ı başarısız → o repo atlanır (`log`), diğerleri devam.

---

## 4. npm Source (`indexer/src/sources/npm.js`)

`name: 'npm'`.

**Keşif:** npm registry **search API** (kimliksiz, açık):
```
GET https://registry.npmjs.org/-/v1/search?text=keywords:mcp&size=50
```
Yanıt: `objects[].package` → `name`, `description`, `keywords`, `links.repository`/`repository`.

**Gürültü filtresi:** `keywords:mcp` geniş; yalnızca MCP **server** sinyali taşıyanlar alınır —
`isLikelyMcpServer(pkg)`: keyword'lerde `mcp` VE (`server` | `model-context-protocol`), VEYA ad
`/(^|[-_/])mcp([-_/]|$)/` ile eşleşir VEYA ad `server-`/`-server` içerir. Deterministik + testli.

**Her uygun paket için `makeCapability`:**
- `kind: 'mcp'`, `marketplace: 'npm'`, `plugin: pkg.name`
- `keywords`: pkg.keywords + ad/açıklamadan türetilen (`deriveKeywords`)
- `source: { repo: extractRepo(pkg), discoveredVia: 'npm' }` → repo varsa candidate; repo yoksa da
  install.command olduğu için candidate
- `install: { method: 'mcp', command: 'claude mcp add <shortName> -- npx -y <pkg.name>', package: pkg.name }`
  (`shortName` = pkg.name'in son segmenti, alfasayısal'a sadeleştirilmiş)

**Saf fonksiyonlar (testli):**
- `parseNpmSearch(json)` → cap dizisi (cap = 50).
- `isLikelyMcpServer(pkg)` → boolean.
- `extractRepo(pkg)` → `github:owner/repo` | `null` (`git+https://github.com/owner/repo.git` vb.
  formatları ayıklar, `normalizeRepo`'dan geçirir).

**Hata yönetimi:** search non-2xx/ağ → `ok:false`, boş. Tek paket parse hatası → atla, devam.

---

## 5. Method-Aware Installer (SP4 sertleştirmesi)

Web cap'leri farklı kurulum/doğrulama mekaniği ister. Değişiklikler:

- `plugin/lib/installer.js` `planInstalls`: plan adımına `method` ekle (`cap.install?.method ?? 'plugin'`).
  Mevcut alanlar (`id`, `command`, `trust`, `mode`) korunur.
- `plugin/lib/cli.js`'e saf yardımcılar (deterministik + testli):
  - `verifyCmdFor(method)`: `'plugin'`→`'claude plugin list'`, `'mcp'`→`'claude mcp list'`, diğer→`null`.
  - `mcpListed(listText, item)`: `pluginListed` muadili — `item.package` (veya id'den ad) kelime-sınırında,
    collision-safe (substring çakışması yok).
  - `listed(method, listText, item)`: `'mcp'`→`mcpListed`, diğer→`pluginListed`.
- `realEnv.isInstalled`/`verify`: `item.method`'a göre `verifyCmdFor` ile doğru list komutunu probe eder,
  `listed` ile kontrol eder. `verifyCmdFor` `null` ise (bilinmeyen method) → exit-code'a güven (mevcut
  zarif geri-düşüş). `run()` değişmez (compound `&&` komutları zaten koşar).

Böylece: github plugin → `claude plugin list` ile doğrulanır; npm MCP → `claude mcp list` ile.

---

## 6. Uçtan Uca Akış (candidate tier canlı)

```
prompt → matcher: candidate cap'ler "kur: <command>" satırıyla aday listesinde
  → konsey: install_then_use, capabilities + installs
  → installer: cap.trust = candidate → mode 'approval' → status 'needs-approval'
  → kullanıcı tek onay (--approved <id>)
  → run(command): 'claude plugin marketplace add ... && claude plugin install ...'  |  'claude mcp add ...'
  → method-aware verify
  → SP6 Step 8: yürütme (plugin→use; mcp→call_mcp; vb.)
```

Bu, SP1–SP6'da uykuda olan **candidate/unknown onay yolunu** nihayet uçtan uca uyandırır.

---

## 7. Test Stratejisi (TDD)

Mevcut 141 testin üzerine ~25–30 yeni test:

1. **http:** `makeFetchJson` enjekte `fetchImpl` ile — 2xx→parse; non-2xx→null; ağ throw→null/throw (tanımlı davranış).
2. **github:** `parseCodeSearch`, `parseMarketplaceManifest`, `rawManifestUrl`; `collect` sahte-fetch ile
   (başarı çoklu repo / search 403→ok:false / tek bozuk manifest atla, diğeri devam).
3. **npm:** `parseNpmSearch`, `isLikelyMcpServer` (pozitif+negatif), `extractRepo` (çeşitli URL formatları);
   `collect` sahte-fetch ile (başarı / hata→ok:false / non-server paket elenir).
4. **trust:** `discoveredVia: 'github'`/`'npm'` + repo → candidate; repo trusted-sources'ta → trusted.
5. **sources/index:** registry `['official','known','builtin','github','npm']` içerir.
6. **run-scan (entegrasyon):** ctx'e sahte `fetchJson` enjekte → scan çıktısı github/npm candidate
   cap'leri içerir; `sources.github`/`sources.npm` sayıları doğru.
7. **installer:** `planInstalls` plana `method` taşır; `verifyCmdFor` doğru komut; `mcpListed`
   collision-safe; `listed` dispatch doğru.
8. **Manuel smoke (SMOKE.md / README):** gerçek bir candidate'ı (github plugin / npm MCP) canlı kurma
   senaryosu (ortam bağımlı, otomatik runner yok).

Test runner = Node built-in `node --test`. Hedef: tüm testler yeşil.

---

## 8. Riskler & Kararlar

- **Canlı ağ kırılganlığı:** rate-limit/down → fail-soft (source boş, scan başarılı). Kabul edilen tasarım.
- **GitHub code search izni:** code search API auth GEREKTİREBİLİR; token yoksa 403 → fail-soft boş.
  `GITHUB_TOKEN` varsa tam çalışır. Belgelenir (README).
- **Gerçek kurulum test edilemez:** canlı kurulum ortam bağımlı; unit-test mock'lu, gerçeği manuel smoke.
- **npm gürültüsü:** `keywords:mcp` geniş; `isLikelyMcpServer` filtresi + per-source cap ile sınırlanır.
  Bazı yanlış pozitif/negatif kabul edilir (candidate tier zaten onay ister).
- **PyPI:** temiz arama API'si yok → kapsam dışı (gelecek faz).
- **Harita boyutu:** per-source cap (github 30, npm 50) ile şişme önlenir.

---

## 9. Tamamlanma Kriteri

- `node src/cli.js scan` (ağ + token varsa) → `status` çıktısında `bySource: github>0 npm>0`,
  `byTrust: candidate>0`; ağ yok/rate-limit → fail-soft (boş, scan başarılı).
- candidate cap'ler matcher'da görünür, konsey seçebilir, installer onay yolu tetiklenir.
- Installer method-aware: github→plugin list, npm→mcp list ile doğrular.
- Testler ağa çıkmadan tüm yolları kapsar; tüm testler yeşil; teknik borç yok.
