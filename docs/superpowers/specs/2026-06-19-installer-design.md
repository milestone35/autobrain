# cc-autopilot — Trusted-List Oto-Installer (Sub-project 4) — Tasarım Dokümanı

- **Tarih:** 2026-06-19
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`plugin/` alt-klasörü)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md` (§7 güven tier'ları + özerklik sınırı, §5.2 adım 5-6, §8 installer hata yönetimi)
- **Önceki alt-projeler:** SP1 (Indexer), SP2 (Router+matcher+hook), SP3 (Konsey + `/route`) — hepsi TAMAMLANDI (`feat/indexer`).

---

## 1. Amaç (Problem & Vizyon)

SP3 konseyi `install_then_use` kararı verip kurulacak yeteneğin **install komutunu gösteriyor** ama
kurmuyordu. Bu alt-proje, design §7'deki **özerklik sınırını** hayata geçirir: konsey
`install_then_use` derse, **trusted** yetenekler **kullanıcıya sormadan sessizce kurulur**
(`claude plugin install …`), kurulum **doğrulanır**, sonra işe devredilir. **candidate/unknown**
yetenekler tek onay gerektirir. Böylece `/route` akışı uçtan uca otonom hale gelir:
istek → karar → (trusted) oto-kurulum → kullanıma hazır.

**Mevcut gerçek:** Harita şu an yalnızca official source'tan beslendiği için tüm yetenekler
`trusted`. Yani **canlı yol = trusted sessiz oto-kur**; candidate/unknown onay yolu kodda kurulur
ve test edilir ama web-keşif source'ları (gelecek iş) gelene dek **uykuda** kalır.

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, uzman düzeyi, user-friendly, %100 sağlam. Özerklik-sınırı mantığı (trusted=sessiz
vs untrusted=onay) deterministik + **bağımlılık-enjeksiyonuyla tam unit-testli**. Gerçek kurulum
exec'i yalnızca enjekte edilen `run`'da; test gerçek kurulum yapmaz. Testsiz merge yok.

---

## 2. Mimari Seçim

**Yaklaşım 1 — Deterministik `planInstalls` + DI `executeInstalls` + CLI `install` + konsey
entegrasyonu** seçildi.

- `lib/installer.js`: `planInstalls` (saf planlama) + `executeInstalls` (bağımlılık-enjeksiyonlu
  yürütme: `run`/`isInstalled`/`approve` fonksiyonları enjekte edilir → fake'lerle tam test).
- `cli.js install <decisionFile> [--approved ids]` gerçek implementasyonları bağlar. **CLI,
  untrusted bir yeteneği `--approved` listesinde olmadan ASLA kurmaz** — onay sınırı kodda zorunlu.
- Konsey skill'i (`capability-router`) Step 7'de `install_then_use` ise installer akışını çağırır:
  trusted → CLI sessiz kurar; candidate/unknown → skill tek onay sorar → `--approved` ile yeniden
  çağırır.

### Reddedilen alternatifler

- **Ajan-güdümlü yürütme** (skill komutları `planInstalls` rehberliğinde kendi çalıştırır,
  `executeInstalls` yok): DI-test edilen özerklik mantığı runtime'da kullanılmaz, kodda zorlanmaz.
  Reddedildi.
- **Tümüyle otonom CLI (onay prompt'u dahil):** CLI interaktif onayı temiz alamaz; onay
  skill/ajan katmanına ait. Reddedildi.
- **Yürütme modu:** "her zaman tek onay" özerkliği iptal eder; "varsayılan dry-run" §7'ye sadık
  değil. **Trusted = sessiz oto-kur (§7)** seçildi (config `autoInstall` kill-switch ile).
- **Doğrulama:** sadece exit-code "sessizce başarısız" kurulumları kaçırır. **Exit-code + varlık
  kontrolü** seçildi (varlık-kontrol mekanizması yoksa zarif geri-düşüş, §8).

---

## 3. Klasör Yapısı (yeni/değişen)

```
plugin/
├── lib/installer.js                    # YENİ: planInstalls (saf) + executeInstalls (DI)
├── lib/cli.js                          # GENİŞLET: `install <decisionFile> [--approved ids]`
├── skills/capability-router/SKILL.md   # GÜNCELLE: Step 7 → install_then_use installer akışı
├── skills/capability-router/SMOKE.md   # GÜNCELLE: kurulum senaryoları
├── config/autopilot.config.json        # +autoInstall (varsayılan true)
├── lib/config.js                       # +autoInstall validasyonu
├── README.md                           # GÜNCELLE: install komutu + autoInstall
└── test/
    └── installer.test.js               # planInstalls + executeInstalls (DI fake'ler)
```

**Sınır:** `lib/installer.js` deterministik + DI ile testli; gerçek `claude plugin install` exec
yalnızca CLI'nin enjekte ettiği `run`'da (smoke). Onay sınırı kodda zorunlu.

---

## 4. Veri Akışı (konsey `install_then_use` verince)

```
SKILL Step 7 (decision === install_then_use):
  1. node lib/cli.js install <decisionFile>
       planInstalls(decision, map, { autoInstall }):
         her decision.installs id → haritadan capability → { id, command, trust, mode }
           trusted && autoInstall   -> mode 'auto'
           trusted && !autoInstall  -> mode 'skip'
           candidate | unknown      -> mode 'approval'
           haritada yok             -> atla
       executeInstalls(plan, { run, isInstalled, approve, log }):
           isInstalled(item)        -> 'already-installed'
           'auto'    -> run(command) -> isInstalled? 'installed' : 'failed'
           'approval'-> approve(item)? run+verify : 'needs-approval'  (CLI'de --approved'sız false)
           'skip'    -> 'skipped' (komutu raporla)
           hata      -> 'failed' + mesaj, DEVAM (throw yok)
       -> results JSON + insan-özeti
  2. 'needs-approval' varsa -> skill kullanıcıya TEK onay sorar
       onay -> node lib/cli.js install <decisionFile> --approved <ids>   (o id'ler artık kurulur)
  3. Sonuçları sun + kurulan yeteneğe işi devret.
     Başarısız -> raporla + "o yetenek olmadan devam" + manuel komut öner.
```

---

## 5. `lib/installer.js` (deterministik + DI)

**`planInstalls(decision, map, { autoInstall }) → item[]`** (saf):
- `decision.installs` boşsa → `[]`.
- Her id için haritada capability'yi bul (yoksa atla — SP3'te uydurma-id zaten elenmiş, çifte güvenlik).
- Item: `{ id, command, trust, mode }` — `command` = capability'nin `install.command`'i.
- `mode`:
  - `trust === 'trusted' && autoInstall` → `'auto'`
  - `trust === 'trusted' && !autoInstall` → `'skip'`
  - `trust === 'candidate' || trust === 'unknown'` → `'approval'`

**`executeInstalls(plan, { run, isInstalled, approve, log }) → result[]`** (DI, asla throw etmez):
- Her item için sırayla:
  - `await isInstalled(item)` true → `{ id, status: 'already-installed' }`.
  - `mode === 'auto'`: `await run(item.command)`; sonra `await isInstalled(item)` →
    true `{ status: 'installed' }`, false `{ status: 'failed', error: 'doğrulama başarısız' }`.
  - `mode === 'approval'`: `await approve(item)` true → run + verify (auto ile aynı);
    false → `{ status: 'needs-approval' }` (run çağrılmaz).
  - `mode === 'skip'`: `{ status: 'skipped', command }`.
  - `run`/`isInstalled` exception fırlatırsa → yakala, `{ status: 'failed', error }`, **sonraki
    item'a devam**.
- `run`/`isInstalled`/`approve` async; bağımsız test için fake'lenebilir.

Bağımlılık sözleşmesi: `run(command) -> Promise<void>` (başarısızlıkta throw), `isInstalled(item)
-> Promise<bool>`, `approve(item) -> Promise<bool>`, `log(msg)`.

---

## 6. `cli.js install` + Config

**`install <decisionFile> [--approved id1,id2]`:**
- Kararı dosyadan oku (yoksa/bozuksa fail-soft → boş plan + uyarı), haritayı yükle, `planInstalls`.
- `executeInstalls` ile **gerçek** bağlamalar:
  - `run(command)` = komutu shell'de çalıştır (`claude plugin install …` / `claude mcp add …`);
    non-zero exit → throw.
  - `isInstalled(item)` = `claude plugin list` (veya catalog cache) çıktısında plugin adı var mı;
    mekanizma yoksa **zarif geri-düşüş**: exit-code'a güven + uyarı logla.
  - `approve(item)` = `(item) => approvedIds.has(item.id)` — `--approved` flag'inden gelen set.
    Yani CLI, `--approved`'da olmayan untrusted'ı kurmaz.
- Sonuç: results JSON + insan-özeti (kurulan / atlanan / onay-bekleyen / başarısız + manuel komut).

**Config:** `+autoInstall` (varsayılan **true**, design §7). `loadConfig`'de boolean validasyonu;
dışı → default.

---

## 7. Güven Tier'ları & Özerklik Sınırı (design §7 hatırlatma)

| Tier | Davranış (SP4) |
|------|----------------|
| **trusted** | `autoInstall` açıksa **sessiz oto-kur**; kapalıysa komutu raporla (`skip`) |
| **candidate** | **Tek onay** sonra kur (CLI `--approved` şartı) |
| **unknown** | **Tek onay** + uyarı sonra kur |

Özerklik sınırı (net): yetenek seçimi/sırası, **trusted kurulum**, "gerek yok" → otomatik.
**Sadece** untrusted (candidate/unknown) kurulum → tek onay. Bu sınır CLI'de kodla zorlanır.

---

## 8. Hata Yönetimi (design §8)

- **Ana ilke:** installer kullanıcının asıl işini bozmaz; bir kurulum patlarsa raporla, **diğerlerine
  devam et**, "o yetenek olmadan devam" + manuel komut öner. `executeInstalls` asla throw etmez.
- **Doğrulamadan güvenme:** exit 0 ama yetenek görünmüyorsa → `failed` (sessiz başarısızlığı yakala).
- **`isInstalled` mekanizması yoksa:** zarif geri-düşüş (exit-code'a güven + uyarı logu).
- **Onay sınırı:** CLI untrusted'ı `--approved` olmadan kurmaz.
- **Bozuk/eksik karar dosyası:** fail-soft → boş plan, hiçbir şey kurulmaz.

---

## 9. Test Stratejisi

- **planInstalls** — trusted→`auto`; trusted+autoInstall:false→`skip`; candidate→`approval`;
  unknown→`approval`; haritada-yok→atlanır; boş installs→`[]`. Unit.
- **executeInstalls (DI fake'ler, GERÇEK KURULUM YOK)** — auto→`run` çağrıldı+verify→`installed`;
  verify-fail→`failed` (`run` çağrıldı ama isInstalled false); candidate onaysız→`needs-approval`
  (`run` ÇAĞRILMADI — fake run spy ile doğrula); candidate onaylı→`run` çağrıldı→`installed`;
  already-installed→`skipped`/`already-installed` (`run` çağrılmadı); `run` throw→`failed` +
  sonraki item işlendi. Unit.
- **cli install** — no-exec yolları: `autoInstall:false`→`skip`; needs-approval (untrusted,
  `--approved`'sız) → kurmaz; bozuk decisionFile → fail-soft. JSON çıktı doğrulanır. Gerçek-exec
  smoke.
- **config** — `autoInstall` default true + boolean validasyon.
- **SKILL/akış (LLM)** — SMOKE.md'ye senaryo(lar): trusted→sessiz kuruldu+doğrulandı;
  `autoInstall:false`→komut gösterildi, kurulmadı. Elle.

Hedef: özerklik-sınırı yürütmesi (riskli kısım) DI ile tam otomatik test; gerçek exec smoke.

---

## 10. Kapsam

**Dahil (bu slice):** `lib/installer.js` (`planInstalls` + `executeInstalls`), `cli.js install`,
`autoInstall` config, konsey skill Step 7 entegrasyonu (install_then_use → installer), DI testleri,
SMOKE senaryoları.

**Hariç (sonraki/diğer):**
- Web-keşif source'ları (indexer) — candidate/unknown tier'larını canlı yapacak olan; ayrı iş.
- `trusted-sources.json`'a kullanıcı ekleme UI/akışı (candidate→trusted terfi) — indexer/trust
  zaten destekliyor; ayrı küçük iş.
- Kurulan yeteneğin fiili çalıştırılması/iş devri konseyin/ana ajanın doğal akışında (yeni kod yok).
- Publish (Faz 2).

---

## 11. Açık Konular / İleride Karar

- **`isInstalled` mekanizması:** `claude plugin list` çıktı formatı ortama bağlı; plan'da kesin
  komut + parse netleşir, yoksa exit-code geri-düşüşü. (Smoke'da doğrulanacak.)
- **`run` exec güvenliği:** komut haritadan gelir (indexer üretir), kullanıcı girdisi değil; yine de
  CLI komutu olduğu gibi çalıştırır (shell-injection yüzeyi yok — sabit `claude plugin install
  <plugin>@<marketplace>` formatı).
- **candidate/unknown canlı testi:** harita tümü trusted olduğundan onay yolu yalnızca fixture/DI
  ile test edilir; gerçek untrusted kurulum web-keşif sonrası.
