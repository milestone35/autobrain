# cc-autopilot — mcp-registry Keşif Source'u (Sub-project 8) — Tasarım Dokümanı

- **Tarih:** 2026-06-26
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`indexer/` + `plugin/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-proje:** SP7 (web-keşif: github + npm) TAMAMLANDI, `master`'a merge edildi. Repo tamamen YEREL (remote yok). Toplam 171 test (indexer 73 + plugin 98).

---

## 1. Amaç (Problem & Vizyon)

SP7 ile `candidate` tier'ı iki web source ile canlandı: `github` (CC marketplace plugin'leri) ve
`npm` (`keywords:mcp` araması → MCP server paketleri). npm source'u açık ama **gürültülü** bir
arama üzerine kurulu (`isLikelyMcpServer` filtresiyle sınırlanıyor) ve yalnızca npm'de yayınlanmış
paketleri görür.

Bu alt-proje **resmî MCP Registry**'yi (`registry.modelcontextprotocol.io`) bir keşif source'u
olarak ekler. Registry, MCP server'ları için **kürateli, otoriter** bir kaynaktır: her giriş gerçek
bir MCP server'dır (gürültü filtresine gerek yok), hem **paket-tabanlı** (npm/pypi) hem
**remote/hosted** (http/sse) server'ları içerir ve `dedupe.js`'te zaten `npm`'den daha yüksek
önceliğe sahiptir (`VIA_PRIORITY: 'mcp-registry': 3` vs `npm: 4`). Böylece aynı server hem registry
hem npm'den geldiğinde, registry'nin daha zengin/otoriter kaydı kazanır.

### Kapsam

- **Registry:** Resmî MCP Registry, `GET https://registry.modelcontextprotocol.io/v0/servers`
  (kimlik gerektirmez, açık).
- **Kurulum hedefleri:** `packages` (npm → `npx`, pypi → `uvx`) **VE** `remotes` (streamable-http,
  sse). `oci`/docker paketleri ve hiç-installable-olmayan girişler **atlanır** (KAPSAM DIŞI).
- **Sayfalama:** Tek sayfa, `limit=100`, per-source cap 100 (github 30 / npm 50 ile tutarlı; harita
  şişmesini önler). Cursor takibi KAPSAM DIŞI (gelecek faz).
- **Faz:** Faz 1 (yerel, kullanıcı tetikledikçe `node src/cli.js scan`). Publish/Faz 2 kapsam dışı.
- **Kurulum yürütme:** keşif + tip-farkındalı doğrulama. Gerçek canlı kurulum ortam/ağ bağımlıdır →
  unit-test mock'lanır, gerçeği manuel smoke.

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, %100 sağlam. Saf `parse*`/yardımcı fonksiyonlar deterministik + fixture'larla tam
testli. **Testler ASLA ağa çıkmaz** (fetch enjekte edilir). Ağ/rate-limit hataları fail-soft:
source `ok:false` ile boş döner, scan asla bozulmaz. Kurulum komutlarına enjekte edilen tüm değerler
(identifier, url, name) shell-injection'a karşı doğrulanır. Testsiz merge yok.

---

## 2. Mimari & Veri Akışı

Mevcut `{ name, collect(ctx) }` source sözleşmesi ve SP7'nin DI'lı fetch deseni korunur. Yaklaşım:
**SP7'deki npm/github source deseninin birebir aynısı** — saf `parse*(json)` + ince `collect(ctx)`.

```
runScan → ctx.fetchJson = makeFetchJson(globalThis.fetch)
  sources: [official, known, builtin, github, npm, mcp-registry]
    mcp-registry.collect(ctx):
      fetchJson(REGISTRY_URL) → parseRegistry(json, {now}) → candidate mcp cap'ler
        ↓ (dedupe-to-latest → installable filtre → injection guard → makeCapability)
  capability-map.json → dedupe (mcp-registry, npm'i ezer) → matcher → konsey → installer(method-aware)
```

**Yeni dosyalar:**
- `indexer/src/sources/mcp-registry.js`
- `indexer/test/mcp-registry.test.js` + `indexer/test/fixtures/mcp-registry.sample.json`

**Değişen dosyalar:**
- `indexer/src/sources/index.js` — `mcp-registry` kaydı (registry'nin sonuna).
- `indexer/test/sources-index.test.js` — registry listesi `[…,'github','npm','mcp-registry']`.
- `indexer/test/run-scan.test.js` — entegrasyon: enjekte `fetchJson` ile mcp-registry candidate cap.
- `plugin/lib/cli.js` — `mcpListed` sertleştirmesi (flag-önekli `mcp add` komutları).
- `plugin/test/install-cli.test.js` — remote-form `mcpListed` regresyon testi.

---

## 3. Registry Yanıt Şekli (gerçek API'den doğrulandı)

```jsonc
{
  "servers": [
    {
      "server": {
        "name": "ai.adeu/adeu",                 // namespaced (reverse-DNS-ish)
        "description": "Automated DOCX Redlining Engine",
        "title": "...",                          // opsiyonel
        "version": "1.5.2",
        "repository": { "url": "https://github.com/dealfluence/adeu", "source": "github" }, // ops.
        "packages": [                            // ops. — npm | pypi | oci
          { "registryType": "pypi", "identifier": "adeu", "version": "1.5.2",
            "transport": { "type": "stdio" } }
        ],
        "remotes": [                             // ops. — streamable-http | sse
          { "type": "streamable-http", "url": "https://api.example.com/mcp" }
        ]
      },
      "_meta": {
        "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true }
      }
    }
  ],
  "metadata": { "nextCursor": "...", "count": 100 }
}
```

**Önemli:** API her server'ın **tüm versiyonlarını** döndürür (aynı `name` birden çok kez).
`_meta["io.modelcontextprotocol.registry/official"].isLatest === true` olanı tutarız.
İlk 100 girişin dağılımı (örnek): ~69 remote-only, ~20 package-only, ~6 ikisi de, ~5 hiçbiri.

---

## 4. mcp-registry Source (`indexer/src/sources/mcp-registry.js`)

`name: 'mcp-registry'`.

**Sabitler:**
```
REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers?limit=100'
SERVER_CAP   = 100
SAFE_IDENT   = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._][A-Za-z0-9._-]*$/   // npm SAFE_PKG ile aynı (paket id; baştaki '-' reddedilir → arg-injection savunması)
SAFE_URL     = /^https:\/\/[^\s`'"&|;<>$()]+$/             // remote url; shell-meta yok, sadece https
```

**Saf fonksiyonlar (deterministik + fixture'larla test):**

- `serverName(name)` → `claude mcp add <name>`'deki ad. Tüm namespaced ad'ı çakışma-güvenli tek
  token'a katlar (SP7 npm-fix dersi: asla jenerik bare token üretme):
  `ai.adeu/adeu` → `ai-adeu-adeu`, `ac.inference.sh/mcp` → `ac-inference-sh-mcp`.
  Uygulama: `String(name).replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'mcp'`.

- `installFor(server)` → `{ method:'mcp', command, package } | null`. Öncelik sırası:
  1. `packages` içinde `registryType==='npm'` ve `SAFE_IDENT` geçen ilk paket →
     `claude mcp add <serverName> -- npx -y <identifier>`, `package: identifier`.
  2. `registryType==='pypi'` ve `SAFE_IDENT` geçen ilk paket →
     `claude mcp add <serverName> -- uvx <identifier>`, `package: identifier`.
  3. `remotes` içinde `type==='streamable-http'` ve `SAFE_URL` geçen ilk remote →
     `claude mcp add --transport http <serverName> <url>`, `package: null`.
  4. `type==='sse'` ve `SAFE_URL` geçen ilk remote →
     `claude mcp add --transport sse <serverName> <url>`, `package: null`.
  5. Hiçbiri yok (yalnız `oci`, geçersiz id/url, ya da hiç hedef) → `null` (server atlanır).

- `extractRepo(server)` → `server.repository?.url`'den `github:owner/repo` (SP7 npm
  `extractRepo`'sundaki github regex'i + `normalizeRepo`); github değilse `null`.

- `parseRegistry(json, { now, cap = SERVER_CAP })` → cap dizisi:
  1. `json.servers` dizi değilse `[]`.
  2. **Dedupe-to-latest:** her `server.name` için, `isLatest===true` olan girişi seç; o ad için
     hiç `isLatest` yoksa ilk görüleni tut (defensive). Map ile, ilk-görülme sırası korunur.
  3. Her benzersiz server için `installFor` çağır; `null` → atla.
  4. `makeCapability({ kind:'mcp', name: server.name, description: server.description||'',
     keywords: deriveKeywords([name, title, description]), marketplace:'mcp-registry',
     plugin: server.name, install, source:{ repo: extractRepo(server), discoveredVia:'mcp-registry' },
     cost:null, popularity:{}, now })`.
  5. `cap`'e ulaşınca dur.

**`collect(ctx)`:**
```js
const { fetchJson, now } = ctx;
if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
const json = await fetchJson(REGISTRY_URL);
if (!json) return { capabilities: [], ok: false, error: 'mcp registry search failed' };
return { capabilities: parseRegistry(json, { now }), ok: true };
```

**Hata yönetimi:** fetch non-2xx/ağ → `ok:false`, boş. Tek server parse/guard hatası → atla, devam
(`parseRegistry` her server'ı try/guard ile işler).

---

## 5. `mcpListed` Sertleştirmesi (`plugin/lib/cli.js`)

SP7'de `mcpListed`, kurulan server adını `mcp add` komutundan `/(mcp add)\s+(\S+)/` ile çıkarıyordu.
Bu, **flag-önekli** remote komutlarında yanlış token yakalar:
`claude mcp add --transport http my-srv https://...` → `--transport` yakalanır (HATA).

**Düzeltme:** ad çıkarımını `mcp add`'den sonraki **ilk flag-olmayan token**'ı bulacak şekilde
değiştir. `--transport http` gibi flag+değer çiftlerini ve tek `--flag`'leri atla:

```js
// 'mcp add' sonrası tokenları gez; '-' ile başlayanları (ve --transport gibi flag'in
// değerini) atla; ilk düz token = server adı.
export function mcpAddName(command) {
  const after = String(command).split(/mcp add\s+/)[1];
  if (!after) return '';
  const toks = after.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '--') break;                       // '--' sonrası komut/arglar; ad bundan önce gelmeli
    if (t.startsWith('-')) {
      if (t === '--transport') i++;              // flag değeri (http/sse) atla
      continue;
    }
    return t;                                     // ilk düz token = ad
  }
  return '';
}
```

`mcpListed` bunu kullanır; empty-state guard (`/no mcp servers/i`) ve kelime-sınırı eşleşmesi korunur:
```js
export function mcpListed(listText, item) {
  const text = String(listText);
  if (/no\s+mcp\s+servers/i.test(text)) return false;
  const nameTok = mcpAddName(item?.command || '');
  if (!nameTok) return false;
  return new RegExp(`(^|[^\\w-])${escapeRegex(nameTok)}([^\\w-]|$)`).test(text);
}
```

Mevcut paket-tabanlı form (`mcp add <name> -- npx ...`) ad-ilk olduğundan davranışı değişmez
(ilk flag-olmayan token = ad). SP7 testleri yeşil kalır; remote-form için yeni regresyon eklenir.

---

## 6. Uçtan Uca Akış (mcp-registry candidate)

```
prompt → matcher: mcp-registry candidate cap "kur: claude mcp add ..." satırıyla aday listesinde
  → konsey: install_then_use, capabilities + installs
  → installer: cap.trust = candidate → mode 'approval' → status 'needs-approval'
  → kullanıcı tek onay (--approved <id>)
  → run(command): 'claude mcp add <name> -- npx/uvx ...'  |  'claude mcp add --transport http/sse <name> <url>'
  → method-aware verify: 'claude mcp list' + mcpListed (flag-önekli komutları da doğru okur)
  → SP6 Step 8: yürütme
```

Aynı server hem npm hem mcp-registry'den gelirse, `dedupe.js` mcp-registry'yi (rank 3 < npm rank 4)
otorite olarak seçer; keyword'ler birleşir.

---

## 7. Test Stratejisi (TDD)

Mevcut 171 testin üzerine ~12–15 yeni test:

1. **mcp-registry (saf):**
   - `serverName`: namespaced ad'ı katlar (`ai.adeu/adeu`→`ai-adeu-adeu`, `ac.inference.sh/mcp`→
     `ac-inference-sh-mcp`); boş/garip ad → `'mcp'`.
   - `installFor`: npm→npx komutu+package; pypi→uvx komutu+package; streamable-http→`--transport http`;
     sse→`--transport sse`; oci-only→`null`; hiç hedef→`null`; güvensiz identifier/url→o hedef atlanır.
   - `extractRepo`: github url→`github:owner/repo`; github-dışı/eksik→`null`.
   - `parseRegistry`: aynı ad çoklu versiyon → yalnız `isLatest` tutulur; `isLatest` yoksa ilk;
     installable-olmayan atlanır; cap uygulanır; kind/marketplace/discoveredVia/trust-girdisi doğru.
2. **mcp-registry (collect):** sahte `fetchJson` ile başarı (cap'ler döner); `fetchJson` `null` →
   `ok:false` boş; `fetchJson` fonksiyon değil → `ok:false`.
3. **sources/index:** registry `['official','known','builtin','github','npm','mcp-registry']`.
4. **run-scan (entegrasyon):** enjekte `fetchJson` (registry URL'sine fixture döndürür) → scan
   çıktısında `discoveredVia==='mcp-registry'` candidate cap; `map.sources['mcp-registry'].count` doğru.
5. **install-cli (mcpListed sertleştirme):** `mcpAddName` flag-önekli komuttan adı doğru çıkarır
   (`--transport http my-srv url`→`my-srv`); paket-form (`mcp add name -- npx`)→`name`; `mcpListed`
   remote-form için doğru eşleşir; empty-state ve collision-safe davranış korunur.

Test runner = Node built-in `node --test`. Hedef: tüm testler yeşil.

---

## 8. Riskler & Kararlar

- **Canlı ağ kırılganlığı:** registry down/rate-limit → fail-soft (boş, scan başarılı). Kabul edilen.
- **Versiyon gürültüsü:** API tüm versiyonları döndürür → `isLatest` ile dedupe; flag yoksa ilk-görülen
  (defensive, deterministik).
- **Remote komut formatı:** `claude mcp add --transport http <name> <url>` flag-önekli; `mcpListed`
  sertleştirildi (`mcpAddName`). Bu, doğrulama için kritik (aksi halde yanlış token → yanlış sonuç).
- **oci/docker:** kurulum komutu karmaşık ve değişken → KAPSAM DIŞI (atlanır, `installFor` null).
- **uvx varsayımı:** pypi server'ları için `uvx <id>` modern MCP konvansiyonu kabul edildi
  (pipx yerine). Ortamda `uv` yoksa kurulum başarısız → fail-soft (candidate zaten onay ister).
- **Harita boyutu:** `limit=100` + cap 100 ile sınırlı; cursor takibi yapılmaz.
- **npm ile çakışma:** aynı npm paketi her iki source'ta görünebilir → `dedupe.js` mcp-registry'yi
  otorite seçer (rank 3 < 4); kayıp yok, zenginleşme var.
- **Injection:** identifier `SAFE_IDENT`, url `SAFE_URL` ile doğrulanır; geçmeyen hedef atlanır
  (SP7 github/npm guard deseni).

---

## 9. Tamamlanma Kriteri

- `node src/cli.js scan` (ağ varsa) → `status` çıktısında `bySource: mcp-registry>0`,
  `byTrust: candidate>0`; ağ yok → fail-soft (boş, scan başarılı).
- mcp-registry candidate cap'leri matcher'da görünür, konsey seçebilir, installer onay yolu tetiklenir.
- Installer method-aware doğrulama, hem paket-form hem remote-form `claude mcp add` komutlarını
  `claude mcp list` ile doğru okur (`mcpAddName`/`mcpListed`).
- Testler ağa çıkmadan tüm yolları kapsar; tüm testler yeşil; teknik borç yok.
