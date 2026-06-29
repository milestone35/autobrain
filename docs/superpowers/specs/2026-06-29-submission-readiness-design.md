# autobrain — Plugin Directory Başvuru Hazırlığı (SP16) — Tasarım Dokümanı

- **Tarih:** 2026-06-29
- **Durum:** Onaylandı (brainstorming Q&A; kararlar kilitli) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (proje: **autobrain**)
- **Sahip:** harun.hanbay
- **Önceki alt-proje:** SP15 (harita tazeleme + SHA sürümleme) TAMAMLANDI, push edildi. 232 test (indexer 113 + plugin 119).

---

## 1. Amaç

`claude plugin validate` (Anthropic inceleme hattının çalıştırdığı komut) ile yapılan readiness
kontrolü bir **HATA** ortaya çıkardı: `plugin validate ./plugin` **FAIL**. Plugin Directory'ye
başvuru için bu giderilmeli + listeleme metadata'sı zenginleştirilmeli.

**Bulgular:**
- 🔴 **Hata (blocker + bug):** `plugin/skills/capability-router/SKILL.md` frontmatter geçerli YAML
  değil → runtime'da skill metadata'sı (name/description/`allowed-tools`) **sessizce düşüyor**.
  Sebep: `description` satırındaki `...(Step 8): read-only...` — YAML `: ` (iki nokta+boşluk)'yu
  iç mapping sanıyor.
- 🟡 **Uyarılar:** `version` yok (kasıtlı — SHA), `author` yok, marketplace `description` yok,
  **LICENSE dosyası + `license` alanı yok**.

**Kararlar (kullanıcı, 2026-06-29):** Lisans **MIT**; author **email YOK** (sadece isim);
**version SABİTLENMEZ** — SHA-tabanlı günlük akış korunur, version uyarısı kabul edilir (bloklamaz).

---

## 2. Kapsam

### A. Frontmatter bug fix (gerçek düzeltme)
`plugin/skills/capability-router/SKILL.md` `description` değeri **çift tırnağa** alınır (içinde
çift tırnak yok → güvenli). Böylece gömülü `: ` artık YAML'ı bozmaz; metadata doğru yüklenir.
Diğer skill/komut frontmatter'ları zaten temiz (project-tuner, route.md, autobrain-tune.md'de
`: ` yok) — dokunulmaz, ama `validate ./plugin` ile teyit edilir.

### B. plugin.json metadata (`plugin/.claude-plugin/plugin.json`)
Eklenir (mevcut `name`/`description`/`hooks` korunur; `version` EKLENMEZ — SHA):
- `author`: `{ "name": "harun.hanbay" }` (email yok)
- `license`: `"MIT"`
- `homepage`: `"https://github.com/milestone35/autobrain"`
- `repository`: `"https://github.com/milestone35/autobrain"`
- `keywords`: `["claude-code","plugin","capability-router","automation","mcp","router"]`

### C. marketplace.json (`.claude-plugin/marketplace.json`)
Üst düzeye `description` eklenir (marketplace uyarısını giderir):
`"autobrain — routes each prompt to the best capability; council decides, installs, executes."`
(`plugins[0]` `version` EKLENMEZ; mevcut alanlar korunur.)

### D. LICENSE dosyası
Repo köküne standart **MIT** LICENSE metni, telif: `Copyright (c) 2026 harun.hanbay` (email yok).

### KAPSAM DIŞI
- `version` pinleme (kullanıcı SHA'da kalmayı seçti; uyarı bloklamıyor).
- Asıl başvuru formunun doldurulması (platform.claude.com/plugins/submit → kullanıcı; kimlik).
- Plugin yetenekleri/mantığı değişmez (shell/ssh/oto-kurulum safety-review'ı bloklamıyor —
  dokümante: güven kullanıcıda).

---

## 3. Doğrulama (gate)

- **`claude plugin validate ./plugin`** → **error YOK** (yalnızca version uyarısı kabul edilebilir;
  frontmatter error gitmiş olmalı).
- **`claude plugin validate .`** (marketplace) → marketplace description uyarısı gitmiş; author/
  version uyarıları (kabul) kalabilir; hata yok.
- **Tam test suite** (indexer 113 + plugin 119) `fail 0` (frontmatter/metadata kodu etkilemez).
- LICENSE dosyası mevcut + `license: MIT` ile tutarlı.

---

## 4. Mimari & İzolasyon

Saf metadata/doküman + tek frontmatter düzeltmesi. Çalışma-zamanı mantığı değişmez. Frontmatter
fix aslında bir davranış **düzeltmesi** (metadata'nın artık yüklenmesi) — ama API/akış aynı;
mevcut testler yeşil kalır.

---

## 5. Riskler / Açık Noktalar

- **Risk:** Çift tırnak description'da gözden kaçan bir karakteri bozabilir. Azaltım: `validate`
  gate'i parse'ı doğrular; içerikte çift tırnak/backslash yok.
- **Risk:** `version` uyarısı başvuruda gözden geçirenleri rahatsız edebilir. Kabul: kullanıcı
  SHA akışını bilinçli seçti; uyarı non-blocking (dokümante).
- **Açık nokta yok:** lisans (MIT), email (yok), version (SHA) kullanıcı tarafından kilitlendi.

---

## 6. Kalite Çıtası

Teknik borçsuz; `claude plugin validate ./plugin` hatasız; gerçek frontmatter bug'ı giderildi
(metadata artık yükleniyor); başvuru-kalite metadata + LICENSE. İlgili:
`docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
