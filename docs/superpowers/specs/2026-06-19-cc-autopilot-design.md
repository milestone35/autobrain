# cc-autopilot — Tasarım Dokümanı (Design Spec)

- **Tarih:** 2026-06-19
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `~/cc-autopilot/`
- **Sahip:** harun.hanbay

---

## 1. Amaç (Problem & Vizyon)

Claude Code kullanırken, yazılan prompt'a göre **o işi yapmanın en iyi yolunu** (hangi
skill / agent / MCP / yetenek / yöntem) otomatik tespit eden; gerekli yetenekleri
**kullanıcıya soru sormadan** seçen, gerekiyorsa **otomatik kuran** ve çalıştıran;
bunun için Claude resmi + topluluk marketlerini **sürekli tarayıp/scrape ederek** uçtan
uca bir **yetenek haritası** kuran ve güncel tutan bir sistem.

Sistem iki yaşam evresine sahiptir:

- **Faz 1 (bu spec):** Harita **lokalde** üretilir ve **kullanıcı tetikledikçe** güncellenir.
- **Faz 2 (sonraki):** Harita bir **adrese publish** edilir; başka kullanıcılar doğrudan
  oradan tüketir (dağıtılabilir).

### Kalite çıtası (NON-NEGOTIABLE)

Bu sistem **teknik borç içermeyecek**, **uzman düzeyinde** ve **user-friendly** olacaktır.
Her bileşen: tek sorumluluk, net arayüz, izole test edilebilirlik, açık hata yönetimi.
"İdare eder" çözüm yok; her karar gerekçeli ve dokümante.

---

## 2. Mimari Seçim

**Yaklaşım A — İki-parçalı tek klasör (`indexer/` + `plugin/`)** seçildi.

- Sistem bir **Claude Code-native plugin katmanı**dır (harici SDK orkestratörü DEĞİL).
- Tek runtime: **Node.js** (hem indexer hem plugin hook'ları — CC ekosistemiyle uyumlu,
  ekstra runtime gerektirmez).
- İki parça birbirini **yalnızca `capability-map.json` sözleşmesi** üzerinden tanır.
  Bu ayrım sayesinde harita bağımsız üretilir/dağıtılır ve Faz 1→Faz 2 geçişi sadece
  "dosya yolu → URL" değişimidir.

### Reddedilen alternatifler
- **Standalone harici orkestratör (Agent SDK):** CC slash-command/skill akışıyla doğrudan
  entegre değil; kullanıcı CC-native istedi.
- **Her şey tek plugin içinde:** ağır scraping ile per-prompt routing iç içe geçer;
  haritayı ayrı publish etmeyi ve başka kullanıcıların remote tüketimini zorlaştırır
  (Faz 2 planına ters).

---

## 3. Klasör Yapısı

```
~/cc-autopilot/
├── README.md
├── indexer/                         # AĞIR: scraping + harita üretimi (manuel-tetik → publish)
│   ├── package.json
│   ├── src/
│   │   ├── cli.js                   # komutlar: scan | status | publish
│   │   ├── sources/                 # her kaynak ayrı, izole modül
│   │   │   ├── official-catalog.js  #   ~/.claude/plugins/plugin-catalog-cache.json (resmi)
│   │   │   ├── known-marketplaces.js#   known_marketplaces.json + git pull
│   │   │   ├── github-discovery.js  #   GitHub arama API: yeni market/plugin keşfi
│   │   │   ├── mcp-registry.js      #   MCP registry
│   │   │   └── package-registries.js#   npm + PyPI MCP paketleri
│   │   ├── normalize.js             # kaynak kayıtları → ortak Capability şeması
│   │   ├── dedupe.js                # aynı yeteneği birden çok kaynaktan birleştir
│   │   ├── trust.js                 # trust tier hesabı (trusted/candidate/unknown)
│   │   ├── store.js                 # capability-map.json + scan-state atomik yazım
│   │   └── publish.js               # Faz 2: haritayı remote'a it
│   ├── config/
│   │   └── trusted-sources.json     # kullanıcı-küratörlü güvenilir kaynak listesi
│   └── data/
│       ├── capability-map.json      # ⭐ SÖZLEŞME (çıktı)
│       └── scan-state.json          # etag/cursor cache, kaynak-bazlı son-tarama
└── plugin/                          # HAFİF: her prompt'ta tüketim
    ├── .claude-plugin/plugin.json   # plugin manifesti
    ├── hooks/
    │   └── user-prompt-submit.js    # router girişi (ucuz, fail-open)
    ├── commands/
    │   └── route.md                 # /route <istek>
    ├── skills/
    │   └── capability-router/SKILL.md  # çok-ajanlı karar konseyi
    ├── lib/
    │   ├── map-loader.js            # haritayı lokal dosya VEYA remote URL'den yükle
    │   ├── matcher.js               # prompt → aday yetenekler (ucuz, LLM'siz ön-filtre)
    │   └── installer.js             # trusted-list oto-kurulum
    └── config/
        └── autopilot.config.json    # harita kaynağı (yol/URL), güven politikası, eşikler
```

---

## 4. Sözleşme: `capability-map.json`

İki parçanın tek ortak arayüzü. **Tek yetenek (Capability) şeması:**

```json
{
  "id": "marketplace::plugin::component",
  "kind": "skill | agent | mcp | command | plugin",
  "name": "string",
  "description": "string",
  "keywords": ["string", "..."],
  "source": {
    "marketplace": "string",
    "repo": "github:owner/repo",
    "discoveredVia": "official | known | github | mcp-registry | npm | pypi"
  },
  "install": {
    "method": "plugin | mcp",
    "command": "claude plugin install … | claude mcp add …",
    "package": "string|null"
  },
  "trust": "trusted | candidate | unknown",
  "cost": { "always_on": 979, "on_invoke": 16250 },
  "popularity": { "unique_installs": 441, "stars": 1234 },
  "lastSeen": "2026-06-19T00:00:00Z"
}
```

**Harita dosyası kökü:**

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-19T00:00:00Z",
  "sources": { "official": { "count": 0, "ok": true }, "...": {} },
  "capabilities": [ /* Capability[] */ ]
}
```

`schemaVersion` ile ileriye dönük uyumluluk korunur; `map-loader` desteklemediği sürümü
reddedip net hata verir.

---

## 5. Veri Akışları

### 5.1 İndeksleme (Faz 1 — kullanıcı tetikler)

```
node indexer scan
  → her source modülü fetch (etag/cursor cache; rate-limit + backoff)
  → normalize  (ortak şemaya çevir)
  → dedupe     (aynı yeteneği kaynaklar arası birleştir)
  → trust      (tier ata)
  → store      (atomik yazım: temp → rename)
node indexer status   → tier/kaynak bazlı özet
node indexer publish  → (Faz 2) haritayı remote'a it
```

Arka plan çalıştırma: Faz 1'de manuel; ileride zamanlanmış görev (Windows Task Scheduler
veya CC `/schedule`) ile periyodik tetiklenebilir — ama bu Faz 1 kapsamı dışında, opsiyonel.

### 5.2 Yönlendirme (her prompt'ta — otomatik)

1. `UserPromptSubmit` hook prompt metnini alır.
2. **Ucuz ön-filtre (`matcher.js`, LLM YOK):**
   - **Kapı:** "bu mesaj özel yetenek gerektiriyor mu?" — önemsiz prompt'larda maliyet sıfır.
   - **Skorlama:** haritaya karşı lexical eşleştirme ile top-N aday yetenek.
   - **Zaman bütçesi (~300ms):** aşılırsa o tur sessizce atlanır (fail-open).
3. Aday varsa hook, oturuma `additionalContext` enjekte eder:
   *"Bu iş için aday yetenekler: […]. Kararı `capability-router` skill'i ile ver."*
   - **Teknik kısıt:** hook subagent çağıramaz. Bu yüzden **ağır karar (çok-ajanlı konsey)
     oturum İÇİNDE skill olarak** çalışır. Hook = tespit + aday enjeksiyonu + tetikleme.
4. `capability-router` skill'i **özerk konseyi** çalıştırır (§6) → karar objesi üretir.
5. Karar kurulum içeriyorsa **installer**: `trusted` → sessiz oto-kur; `candidate/unknown`
   → tek onay (§7).
6. Seçilen yeteneğe iş devredilir.

---

## 6. Çok-Ajanlı Karar Konseyi (`capability-router` skill)

"Agentların kendi içinde konuşarak kullanıcıya sormadan karar vermesi." Skill, **Workflow/Agent**
araçlarıyla küçük bir konsey kurar:

- **Planner ajan** — prompt + aday yetenekler → en iyi yetenek setini ve yürütme yöntemini önerir.
- **Critic/Verifier ajan** — saldırır: gerçekten gerekli mi? daha ucuz/zaten kurulu alternatif?
  güven/risk? token maliyeti makul mü?
- **Yakınsama (≤1–2 tur)** → tek karar objesi:

```json
{
  "decision": "use_existing | install_then_use | no_capability_needed",
  "capabilities": ["id…"],
  "installs": ["id…"],
  "method": "yürütme sırası/plan",
  "rationale": "gerekçe",
  "confidence": 0.0
}
```

- `confidence` eşiğin altındaysa konsey **en güvenli/en ucuz** seçeneğe düşer
  (genelde `no_capability_needed` — sistemi varsayılan davranışa bırakır). Yanlış-pozitif
  kurulumları engeller.
- Konsey tamamen özerk karar verir; **tek insan dokunuşu** = `candidate/unknown` kurulum onayı.

---

## 7. Güven Tier'ları ve Özerklik Sınırı

| Tier | Kaynak | Davranış |
|------|--------|----------|
| **trusted** | Resmi Claude marketplace + `trusted-sources.json` | **Sessiz oto-kur** |
| **candidate** | Web keşfiyle bulunmuş, henüz güvenilmemiş | **Tek onay** sonra kur |
| **unknown** | Yetersiz metadata | Tek onay + uyarı |

- Tier hesabı (`trust.js`): güvenilir-liste eşleşmesi + sinyaller (yıldız, install sayısı,
  manifest geçerliliği).
- Kullanıcı `trusted-sources.json`'a ekledikçe `candidate→trusted` terfi eder; sonraki scan'de yansır.
- **Özerklik sınırı (net):** yetenek seçimi, yürütme sırası, trusted kurulum, "gerek yok"
  kararı → hepsi otomatik. **Sadece** güvenilmeyen kaynak kurulumu → tek onay.

---

## 8. Hata Yönetimi

**Ana ilke: router asla kullanıcının prompt'unu bozmaz.**

- **Hook fail-open** — tüm router mantığı try/catch; hata/timeout → `exit 0`, prompt normal akar.
- **Indexer kaynak izolasyonu** — bir kaynak patlarsa loglar + devam; kısmi harita geçerli.
- **Atomik yazım** — temp → rename; yarım dosya riski yok. Ağ hatası → eski harita korunur.
- **Rate-limit/etag** — `scan-state.json` cursor/etag; GitHub vb. için exponential backoff.
- **Installer** — başarısızlıkta raporla + "o yetenek olmadan devam et" + manuel komut öner;
  kurulum başarısını **doğrulamadan** ona güvenme.
- **Bayat harita** — N günden eskiyse router not düşer + `indexer scan` önerir.
- **map-loader** — desteklenmeyen `schemaVersion` / bozuk JSON → net hata, fail-open.

---

## 9. Test Stratejisi

- **Indexer** — `normalize/dedupe/trust` için fixture (canned JSON) unit testleri;
  `--fixtures` modu canlı ağ yerine sabit veri (deterministik); `capability-map.json`
  için golden-file testi.
- **Matcher** — örnek prompt → beklenen aday set eşlemeleri.
- **Hook** — fail-open (bozuk girdi → exit 0, çökme yok) + timeout davranışı.
- **Installer** — `--dry-run` komut üretimi; trusted=sessiz / non-trusted=onay yolu testleri.
- **Konsey skill'i** — LLM olduğu için manuel/transkript düzeyi smoke senaryoları.

Hedef: her saf (LLM'siz) modül deterministik ve birim test kapsamında. Kalite çıtası gereği
yeni modül testsiz merge edilmez.

---

## 10. İnşa Sırası (Alt-projeler)

Sistem tek spec'e sığmayacak kadar büyük; her alt-proje **kendi spec→plan→implementasyon**
döngüsünü alır. Sıra:

1. **Capability Map / Indexer** ← TEMEL, ilk detaylı spec + implementasyon bu.
   (kaynaklar: önce official+known, sonra web keşfi; schema, normalize/dedupe/trust, store, status)
2. **Router + matcher + hook** (haritayı tüketir).
3. **Çok-ajanlı karar konseyi skill'i + `/route` komutu.**
4. **Trusted-list oto-installer.**
5. **Publish (Faz 2) + remote tüketim + dağıtım.**

**Bu doküman = genel mimari sözleşmesi.** Bir sonraki adım: Alt-proje 1 (Indexer) için
detaylı implementasyon planı (writing-plans).

---

## 11. Açık Konular / İleride Karar

- Faz 2 publish hedefi (statik URL? küçük servis? CDN?) — Faz 2 spec'inde netleşecek.
- Periyodik arka-plan tetikleme mekanizması (Task Scheduler vs `/schedule`) — opsiyonel, Faz 1 dışı.
- Matcher skorlama yöntemi (saf lexical vs hafif gömme) — Indexer/Router spec'inde ölçülecek;
  başlangıç: saf lexical (bağımlılıksız, deterministik, test edilebilir).
