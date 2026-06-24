# cc-autopilot — Yerleşik Yetenek Taksonomisi (Sub-project 5) — Tasarım Dokümanı

- **Tarih:** 2026-06-24
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`indexer/` + `plugin/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-projeler:** SP1 (Indexer), SP2 (Router+matcher+hook), SP3 (Konsey + `/route`), SP4 (Oto-installer) — hepsi TAMAMLANDI (`feat/indexer`).
- **Sonraki alt-proje:** SP6 (yürütme katmanı — konseyin seçtiği yerleşik yeteneği fiilen çalıştırması). Bu spec SADECE öneri/taksonomi katmanını kapsar.

---

## 1. Amaç (Problem & Vizyon)

Bugün otopilotun yetenek haritası yalnızca marketplace'ten **kurulabilir** şeyleri tanıyor:
`kind ∈ {skill, agent, mcp, command, plugin}`. Oysa Claude Code'un en güçlü araçlarının çoğu
**zaten yerleşik** ve kurulum gerektirmiyor: `!` bang ile shell/ssh, yerleşik araçlar
(Read/Grep/Bash/WebSearch/Task…), yerleşik slash komutları (`/review`, `/security-review`…) ve
yerleşik subagent'lar (Explore, Plan…).

Bu alt-proje, yetenek taksonomisini bu **yerleşik** türleri kapsayacak şekilde genişletir; böylece
konsey "bu iş için `!` shell yeter, `Grep` yeter — plugin kurmaya gerek yok" diyebilir.
**Yerleşik öncelik ilkesi:** eşit alakada yerleşik yetenek kurulabilir plugin'e tercih edilir
(gereksiz kurulumdan kaçınma).

Somut motive eden kullanım: kullanıcı terminalde `! ssh root@10.10.15.141 echo ok` ile uzak komutu
ajana aktarıyor — `bang` yeteneği bu sınıf işleri temsil eder.

**Kapsam dışı (SP6):** Konseyin seçtiği yerleşik yeteneği FİİLEN çalıştırması. Bu spec öneri/sıralama
katmanını bitirir; sistem yine pasif öneri/yönlendirme katmanı kalır.

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, uzman düzeyi, %100 sağlam. Saf modüller deterministik + tam unit-testli. Katalog
sabit/küratörlü ve test edilebilir. Mevcut 110 test bozulmaz; yeni davranış TDD ile gelir.

---

## 2. Mimari & Veri Akışı

Mevcut iki-parça mimari korunur. **indexer'a tek yeni source** eklenir:

```
indexer/src/sources/builtin-catalog.js   ← YENİ: sabit küratörlü liste
        ↓ (mevcut) normalize → dedupe → store
   capability-map.json   ← builtin cap'ler kurulabilirlerle AYNI sözleşmede
        ↓ (mevcut) plugin: map-loader → matcher → konsey
```

Yerleşik cap'ler `capability-map.json` sözleşmesine tam uyar; ayırt edici işaretleri:

| Alan | Değer |
|------|-------|
| `kind` | `bang` \| `builtin-tool` \| `slash` \| `builtin-agent` |
| `install` | `null` (kurulacak şey yok → installer onları doğal olarak atlar) |
| `source.marketplace` | `"builtin"` |
| `source.discoveredVia` | `"builtin"` |
| `trust` | `"builtin"` |

**Tasarım gerekçesi:** Builtin'leri ayrı bir veri yoluna koymak yerine aynı sözleşmeye sokmak,
matcher/konsey/installer'ın tek tip cap işlemesini sağlar — minimum yeni kod, maksimum yeniden
kullanım.

---

## 3. Katalog İçeriği (`indexer/src/sources/builtin-catalog.js`)

Küçük, bakımlı bir seed liste (~25 giriş, YAGNI — CC sürümüyle nadiren değişir). Her giriş
normalize'a verilecek ham cap objesidir (`makeCapability` üzerinden `capability-map.json` formatına
dönüşür). `install` alanı verilmez (→ `null`).

- **bang (1):** `shell` — _"Run any shell command inline in the session (git, ls, ssh, curl, build tools…)."_ Keywords: `shell, command, ssh, remote, git, curl, terminal, run`.
- **builtin-tool (9):** `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch`, `Task` — her biri kısa açıklama + keyword.
- **slash (4):** `/init`, `/review`, `/security-review`, `/code-review`.
- **builtin-agent (4):** `Explore`, `Plan`, `general-purpose`, `code-reviewer`.

Liste deterministik (sabit sıra, sabit içerik); ad/keyword/açıklamalar matcher'ın alaka skoruna
hizmet eder.

---

## 4. Etkilenen Modüller & Değişiklikler

### 4.1 `indexer/src/normalize.js` — yeni kind'ler
`KINDS` set'ine eklenir: `bang`, `builtin-tool`, `slash`, `builtin-agent` (mevcut
`skill|agent|mcp|command|plugin` korunur). `validateCapability` ve `makeId` aynen çalışır.
`makeId` builtin için: `builtin::<plugin/grup>::<kind>::<component>` (örn. `builtin::core::bang::shell`).

### 4.2 `indexer/src/trust.js` — builtin tier
`classifyTrust`'a, diğer dallardan ÖNCE tek dal eklenir:

```
if (cap.source?.discoveredVia === 'builtin') return 'builtin';
```

Builtin tier semantiği: "kurulacak şey yok, zaten mevcut". Mevcut trusted/candidate/unknown
mantığı değişmez.

### 4.3 `indexer/src/sources/index.js` — source kaydı
Yeni `builtin-catalog` source'u mevcut official-catalog'la aynı şekilde toplanır; sonuç
`capability-map.json`'a `sources.builtin = { ok, count }` olarak yazılır.

### 4.4 `plugin/lib/matcher.js` — yerleşik öncelik (tie-break)
`scoreCapability` SAF-ALAKA kalır (skor formülü değişmez). `rankCandidates` beraberlik-bozumuna
yerleşik tercihi eklenir:

```
eşit skor →  builtin önce  →  sonra popularity.unique_installs  →  sonra id
```

`isBuiltin(cap)` = `cap.trust === 'builtin'` (veya `cap.source?.discoveredVia === 'builtin'`).
Böylece "eşit alakada plugin yerine Grep" deterministik olur; saf-alaka sıralaması bozulmaz.

### 4.5 `plugin/lib/installer.js` — değişiklik YOK (teyitli)
`planInstalls` zaten `install?.command` yoksa cap'i atlıyor (satır 9: `if (!command) continue;`).
Builtin'ler `install:null` olduğu için kurulum planına HİÇ girmez. Yeni kod gerekmez; bu davranış
testle kilitlenir (regresyon koruması).

### 4.6 `plugin/skills/capability-router/SKILL.md` — konsey reçetesi
Builtin cap seçildiğinde dispatch = **use-directly** (`install_then_use` değil). Reçeteye bir
cümle + örnek eklenir: "Aday `trust:builtin` ise zaten mevcuttur; kurulum önerme, doğrudan
kullanımı öner." Deterministik katman (`decision.js`) zaten `install:null` ile uyumlu; metin
açıklığı için güncellenir.

---

## 5. Test Stratejisi (TDD)

Mevcut 110 testin üzerine, her değişiklik kendi testiyle gelir (~8-10 yeni test):

1. **builtin-catalog:** liste şekli; her giriş `install:null`, `discoveredVia:'builtin'`, geçerli kind; `makeCapability`'den temiz geçiyor.
2. **normalize:** yeni 4 kind kabul ediliyor; geçersiz kind hâlâ reddediliyor.
3. **trust:** `discoveredVia:'builtin'` → `'builtin'`; mevcut official→trusted, repo→candidate, çıplak→unknown korunuyor.
4. **matcher:** eşit skorda builtin, kurulabilirin önünde sıralanıyor; farklı skorda alaka hâlâ baskın (öncelik skoru ezmiyor).
5. **installer (regresyon):** builtin cap içeren karar `planInstalls`'ta plana girmiyor (atlanıyor).
6. **sources/index:** map çıktısında `sources.builtin.count` doğru.

Test runner = Node built-in `node --test`. Hedef: tüm testler yeşil (110 + yeniler).

---

## 6. Riskler & Kararlar

- **Katalog güncelliği:** Sabit liste CC sürümüyle eskiyebilir. Karar: YAGNI — küçük tut, gerektiğinde elle güncelle; dinamik yerel keşif (alternatif) bilinçli olarak ertelendi.
- **Builtin'in fazla öne çıkması:** Öncelik yalnızca BERABERLİK-bozumunda devreye girer; alaka skorunu ezmez. Yani alakasız bir builtin, alakalı bir plugin'in önüne geçemez.
- **SP6 bağımlılığı:** Bu katman öneri verir; fiili yürütme SP6'da. Builtin cap'lerin `install:null` olması SP6'nın "kur değil, kullan" ayrımını şimdiden netleştirir.

---

## 7. Tamamlanma Kriteri

- `node indexer scan` çıktısı (`capability-map.json`) builtin cap'leri içeriyor; `sources.builtin.count > 0`.
- `/route` / `cli candidates` eşit alakada builtin'i önde döndürüyor.
- Konsey builtin seçince kurulum önermiyor (use-directly).
- Tüm testler yeşil; teknik borç yok.
