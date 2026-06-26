# cc-autopilot — PyPI Seed-List Keşif Source'u (Sub-project 9) — Tasarım Dokümanı

- **Tarih:** 2026-06-26
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`indexer/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-proje:** SP8 (mcp-registry) TAMAMLANDI, `master`'a merge edildi. Toplam 193 test (indexer 93 + plugin 100). Canlı scan (github token'lı): 1258 cap.

---

## 1. Amaç (Problem & Vizyon)

SP7 (github+npm) ve SP8 (mcp-registry) ile `candidate` tier canlı. Geriye yerleşik
taksonomide adı geçen son web ekosistemi kaldı: **PyPI** (Python MCP server paketleri).

**Kritik kısıt (araştırmayla doğrulandı, 2026-06-26):** PyPI'nin **temiz bir anahtar-kelime
arama JSON API'si YOK.** XML-RPC `search` 2020'de kapatıldı; `pypi.org/search?q=...`
yalnızca HTML döndürür ve bot-koruması/JS-render nedeniyle programatik istemciye **0 sonuç**
verir (kabuk istemcisiyle ~3 KB boş sayfa). Bu yüzden SP7'de PyPI ertelenmişti.

**Ne VAR:** Resmî, temiz, kararlı **per-package JSON API'si**:
`https://pypi.org/pypi/<ad>/json` → `info.name`, `info.summary`, `info.keywords`,
`info.project_urls` (Repository/Homepage). Ama paket adını **bilmeyi** gerektirir.

**Karar (kullanıcı onaylı):** Gerçek "keyword keşfi" imkânsız olduğundan, bu alt-proje
**kürateli bir seed-list** yaklaşımı kullanır: `config/pypi-seeds.json`'daki MCP PyPI paket
adlarını resmî per-package JSON API ile **canlı zenginleştirip** `candidate` `mcp` cap'leri
üretir (`claude mcp add <ad> -- uvx <ad>`). Bu, anahtar-kelime keşfi DEĞİL; kürateli liste
takibi/zenginleştirmesidir — ama temiz API, sağlam, fail-soft ve listeye eklendikçe büyür.

### Kapsam

- **Kaynak:** Resmî PyPI JSON API (`https://pypi.org/pypi/<ad>/json`), kimliksiz/açık.
- **Seed:** `indexer/config/pypi-seeds.json` (commit'li, kürateli paket adı listesi).
- **Kurulum:** `uvx <ad>` (modern MCP konvansiyonu; mcp-registry pypi ile tutarlı). `pipx` KAPSAM DIŞI.
- **Faz:** Faz 1 (yerel, `node src/cli.js scan`). Publish/Faz 2 kapsam dışı.

### KAPSAM DIŞI (açıkça)

- Anahtar-kelime keşfi (PyPI'de temiz API yok).
- HTML scraping (kırılgan, 0 sonuç, temiz-API çıtasına aykırı).
- Seed listesini otomatik büyütme (manuel kürasyon).

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, %100 sağlam. Saf `parse*`/`build*` fonksiyonları deterministik + fixture'larla
tam testli. **Testler ASLA ağa çıkmaz** (fetch enjekte edilir). Ağ/404 hataları fail-soft:
paket başına hata → o paket atlanır; seed dosyası yoksa source `ok:false` boş döner; scan asla
bozulmaz. Paket adları kuruluma enjekte edilmeden önce shell-injection'a karşı doğrulanır
(SP8 `SAFE_IDENT` ile aynı). Testsiz merge yok.

---

## 2. Mimari & Veri Akışı

Mevcut `{ name, collect(ctx) }` source sözleşmesi + SP7/SP8'in DI'lı fetch deseni korunur.
PyPI source'u **iki girdi** kullanır: yerel seed dosyası (`ctx.sourcePaths.pypiSeeds`) +
ağ (`ctx.fetchJson`). Her ikisi de `ctx`'te zaten mevcut.

```
runScan → ctx.fetchJson + ctx.sourcePaths (resolvePaths)
  sources: [official, known, builtin, github, npm, mcp-registry, pypi]
    pypi.collect(ctx):
      readJson(sourcePaths.pypiSeeds) → parsePypiSeeds(json) → [adlar]
        her ad: fetchJson('https://pypi.org/pypi/<ad>/json') → buildCap(pkgJson) → candidate mcp cap
          (404/ağ → o paket atla; fail-soft)
  capability-map.json → dedupe (Pass-2: pypi+registry aynı paket → registry kazanır) → ...
```

Her source ikiye ayrılır: **saf `parse*`/`build*`** (fixture'larla test) + **ince `collect`**
(seed oku + fetch + build + fail-soft).

**Yeni dosyalar:**
- `indexer/src/sources/pypi.js`
- `indexer/config/pypi-seeds.json` (seed listesi, commit'li)
- `indexer/test/pypi.test.js` + `indexer/test/fixtures/pypi-*.json` (fixture'lar)

**Değişen dosyalar:**
- `indexer/src/store.js` — `resolvePaths` `sourcePaths.pypiSeeds` ekler.
- `indexer/src/sources/index.js` — `pypi` kaydı (registry sonuna).
- `indexer/test/sources-index.test.js` — registry listesi `[...,'mcp-registry','pypi']`.
- `indexer/test/run-scan.test.js` — entegrasyon testi.
- `indexer/test/dedupe.test.js` — pypi+registry aynı-paket merge testi (registry kazanır).

---

## 3. PyPI per-package JSON şekli (gerçek API'den doğrulandı)

```jsonc
{
  "info": {
    "name": "mcp-server-git",
    "summary": "A Model Context Protocol server providing tools to read/search/manipulate Git",
    "keywords": "automation, git, llm, mcp",        // virgülle ayrık STRING (dizi değil!)
    "home_page": null,                              // genellikle null
    "project_urls": {                               // repo burada olabilir (anahtar adı değişken)
      "Homepage": "https://modelcontextprotocol.io",
      "Repository": "https://github.com/awslabs/mcp.git"   // veya "Source", "Source Code", yok
    }
  }
}
```

**Önemli:** `info.keywords` bir DİZİ değil, virgülle ayrık bir STRING'tir (ya da boş/null).
`extractRepo`, `project_urls`'in TÜM değerlerini + `home_page`'i github regex'iyle tarar
(sabit bir anahtar adına güvenmez); eşleşme yoksa `null`.

---

## 4. pypi Source (`indexer/src/sources/pypi.js`)

`name: 'pypi'`.

**Sabitler:**
```
PKG_URL = (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
SEED_CAP = 200                                          // güvenlik tavanı
SAFE_IDENT = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._][A-Za-z0-9._-]*$/   // SP8 ile aynı; baştaki '-' reddedilir
```
(Not: `@scope/` dalı npm içindi; PyPI adları scope'suz, ama aynı regex'i paylaşmak zararsız —
PyPI adları ikinci dalı karşılar.)

**Saf fonksiyonlar (deterministik + fixture'larla test):**

- `serverName(name)` → `claude mcp add <name>`'deki ad; SP8 mcp-registry `serverName` ile aynı
  fold (çakışma-güvenli): `String(name).replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'mcp'`.
  (PyPI adları zaten sade; `mcp-server-git` → `mcp-server-git`.)

- `parsePypiSeeds(json)` → `string[]`: `json.packages` dizi değilse `[]`; her eleman string
  ve `SAFE_IDENT` geçerse alınır (aksi atlanır); `SEED_CAP`'e kadar.

- `extractRepo(info)` → `github:owner/repo` | `null`: `info.project_urls`'in tüm değerleri +
  `info.home_page`'i sırayla `/github\.com[/:]([^/]+)\/([^/.]+)/i` ile tarar; ilk eşleşmeyi
  `normalizeRepo` ile döndürür; yoksa `null`. (SP7/SP8 extractRepo regex'iyle tutarlı.)

- `pypiKeywords(info)` → `string[]`: `info.keywords` (virgüllü string) parçalanır +
  `deriveKeywords([name, summary].join(' '))` birleşir, set'lenir.

- `buildCap(pkgJson, { now })` → cap | `null`: `const info = pkgJson?.info; const name = info?.name;`
  `name` yok veya `!SAFE_IDENT.test(name)` → `null`. Aksi:
  `makeCapability({ kind:'mcp', name, description: info.summary || '',
    keywords: pypiKeywords(info), marketplace:'pypi', plugin: name,
    install: { method:'mcp', command:`claude mcp add ${serverName(name)} -- uvx ${name}`, package: name },
    cost:null, popularity:{}, source:{ repo: extractRepo(info), discoveredVia:'pypi' }, now })`.

**`collect(ctx)`:**
```js
const { sourcePaths, fetchJson, now, log = () => {} } = ctx;
if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
const seeds = await readJson(sourcePaths.pypiSeeds, null);
if (!seeds) return { capabilities: [], ok: false, error: 'pypi-seeds.json not found' };
const names = parsePypiSeeds(seeds);
const capabilities = [];
for (const name of names) {
  try {
    const pkg = await fetchJson(PKG_URL(name));
    if (!pkg) { log(`pypi: no metadata for ${name}`); continue; }   // 404/ağ → atla
    const cap = buildCap(pkg, { now });
    if (cap) capabilities.push(cap);
  } catch (e) { log(`pypi: skipping ${name}: ${e.message}`); }
}
return { capabilities, ok: true };
```

**Hata yönetimi:** `fetchJson` yok → `ok:false`. seed dosyası yok → `ok:false` (official/known ile
tutarlı). seed boş/hepsi başarısız → `ok:true`, boş dizi (hata değil). Tek paket 404/parse →
atla, devam.

---

## 5. Seed Config (`indexer/config/pypi-seeds.json`)

`trusted-sources.json` ile aynı stil; commit'li, kürateli. Başlangıç (gerçek, doğrulanmış paketler):
```json
{
  "packages": [
    "mcp-server-git",
    "mcp-server-fetch",
    "mcp-server-time",
    "mcp-server-sqlite",
    "awslabs.core-mcp-server"
  ]
}
```
Kullanıcı yeni MCP PyPI paketi ekledikçe liste büyür; sonraki `scan` onları cap olarak çeker.

---

## 6. Wiring & Dedupe Etkileşimi

- `store.js resolvePaths`: `sourcePaths.pypiSeeds = opts.pypiSeeds || path.join(INDEXER_ROOT, 'config', 'pypi-seeds.json')`.
- `sources/index.js`: `[official, known, builtin, github, npm, mcpRegistry, pypi]`.
- **dedupe (SP8 Pass-2 zaten mevcut, değişiklik yok):** pypi cap komutu `uvx` içerir →
  ecosystem key `pypi:<paket>`. mcp-registry pypi cap'i de `uvx` → `pypi:<paket>`. Aynı paket →
  birleşir; `VIA_PRIORITY` mcp-registry=3 < pypi=5, registry otorite kazanır (keyword union).
  npm `npm:<paket>` ile asla çakışmaz. **dedupe.js'e kod değişikliği gerekmez** — sadece test.
- **trust (değişiklik yok):** `discoveredVia:'pypi'` + repo|install.command → `candidate`
  (trust.js mevcut mantık; SP7/SP8 ile aynı). Test eklenir.
- **installer (değişiklik yok):** pypi komutu ad-ilk (`claude mcp add <ad> -- uvx <ad>`);
  SP8 `mcpAddName`/`mcpListed` bunu zaten doğru okur. Method `mcp` → `claude mcp list` ile doğrulanır.

---

## 7. Test Stratejisi (TDD)

Mevcut 193 testin üzerine ~12–14 yeni test:

1. **pypi (saf):**
   - `serverName`: fold + fallback.
   - `parsePypiSeeds`: `packages` dizisi; string-olmayan/güvensiz adlar elenir; SEED_CAP.
   - `extractRepo`: github project_urls/home_page → `github:owner/repo`; github-dışı/yok → `null`.
   - `pypiKeywords`: virgüllü `info.keywords` string'i + summary'den türetilen birleşir.
   - `buildCap`: shape (kind/marketplace/discoveredVia/uvx komut/package), güvensiz ad → `null`.
2. **pypi (collect):** sahte `fetchJson` + seed fixture → başarı (cap'ler); tek paket `null` → atla;
   seed dosyası yok → `ok:false`; `fetchJson` fonksiyon değil → `ok:false`; boş seed → `ok:true` boş.
3. **store:** `resolvePaths` `sourcePaths.pypiSeeds` doğru türetir (default + override).
4. **sources/index:** registry `[...,'mcp-registry','pypi']`.
5. **run-scan (entegrasyon):** enjekte `fetchJson` (pypi URL'sine fixture) + seed → scan çıktısında
   `discoveredVia:'pypi'` candidate cap; `map.sources.pypi.count` doğru.
6. **dedupe:** pypi cap + aynı-paket mcp-registry cap → tek cap, registry id/komut kazanır,
   keyword union (SP8 Pass-2 ecosystem-key'i `pypi:<x>` doğruluyor).

Test runner = Node built-in `node --test`. Hedef: tüm testler yeşil.

---

## 8. Riskler & Kararlar

- **Keyword keşfi yok:** kabul edilen; seed-list zenginleştirme (kürateli). Açıkça belgelendi.
- **Seed bakımı manuel:** kasıtlı; otomatik büyütme kapsam dışı (YAGNI).
- **Ağ kırılganlığı:** per-package 404/ağ → fail-soft atla; seed yok → ok:false; scan bozulmaz.
- **uvx varsayımı:** pypi için `uvx` (mcp-registry ile tutarlı); ortamda `uv` yoksa kurulum
  başarısız → fail-soft (candidate zaten onay ister).
- **mcp-registry ile örtüşme:** registry pypi cap'leri zaten var (şu an 2); dedupe Pass-2 aynı
  paketi birleştirir (registry kazanır) → çift kayıt yok, zenginleşme var.
- **Injection:** seed adları config'ten gelir ama yine de `SAFE_IDENT` ile doğrulanır (savunma).

---

## 9. Tamamlanma Kriteri

- `node src/cli.js scan` (ağ varsa) → seed paketlerinden `bySource: pypi>0`, `byTrust: candidate>0`;
  ağ yok → fail-soft (boş, scan başarılı).
- pypi candidate cap'leri matcher'da görünür, konsey seçebilir, installer onay yolu tetiklenir;
  method-aware doğrulama `uvx` komutunu `claude mcp list` ile okur.
- pypi + mcp-registry aynı paket → dedupe tek cap'e indirger (registry otorite).
- Testler ağa çıkmadan tüm yolları kapsar; tüm testler yeşil; teknik borç yok.
