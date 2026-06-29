# cc-autopilot — `/autopilot-tune` Proje Optimizasyon Kontrolü (SP11) — Tasarım Dokümanı

- **Tarih:** 2026-06-29
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`plugin/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-proje:** SP10 (route Türkçe anlatımı + mapTotal + installed) TAMAMLANDI, `master`'a merge edildi. Toplam 216 test (indexer 109 + plugin 107).

---

## 1. Amaç (Problem & Vizyon)

cc-autopilot çalışılan projeyi otomatik en iyi şekilde yönetmeyi hedefliyor. Ama bir projenin
CC için **optimize** olup olmadığını (CLAUDE.md var mı, izin allowlist'i tanımlı mı, hook'lar
yapılandırılmış mı) kontrol eden bir mekanizma yok.

**Kullanıcı isteği:** Projede `/init` gibi optimizasyona ait ilerlemeler kontrol edilsin; yoksa
oluşturulsun.

**Karar (kullanıcı onaylı, 2026-06-29):** Yeni bir **ayrı komut** `/autopilot-tune` çalışılan
projeyi bir **optimizasyon kontrol listesine** karşı denetler, eksikleri **Türkçe** raporlar
(SP10 anlatım stili) ve her giderilebilir eksiği **tek onayla** giderir. `/route`'a entegre
DEĞİL (gürültü/maliyet eklemesin, net sorumluluk).

### Kontrol listesi (başlangıç)

| Kontrol | Tespit | Giderme | Tip |
|---|---|---|---|
| `claude-md` | Proje kökünde `CLAUDE.md` **veya** `CLAUDE.local.md` var mı? | `/init` çalıştır | **auto** (tek onay — dosya yazar) |
| `permissions-allowlist` | `.claude/settings.json` **veya** `settings.local.json`'da `permissions.allow` dizisi dolu mu? | `/fewer-permission-prompts` skill | **auto** (tek onay) |
| `hooks` | `.claude/settings.json` **veya** `settings.local.json`'da `hooks` bloğu (en az bir giriş) var mı? | Tek kanonik hook olmadığından **danışmanlık**: eksik olduğunu söyler + `update-config` skill'ine yönlendirir | **advisory** (yan-etki yok) |

**Kalite ilkesi:** Uydurma giderme yok. CLAUDE.md ve izinler için somut, deterministik giderme
var. `hooks` için tek doğru hook olmadığından otomatik üretmeyiz — tespit + danışmanlık.

### Kapsam

- **Hedef proje:** Kullanıcının çalıştığı dizin (`process.cwd()`); `--root <dir>` ile geçersiz
  kılınabilir.
- **Yapı:** Saf çekirdek (`lib/optimizations.js`) + CLI `checks` komutu + `project-tuner` skill +
  `/autopilot-tune` komutu.

### KAPSAM DIŞI (açıkça)

- `/route`'a entegrasyon YOK (ayrı komut).
- `hooks` için otomatik hook üretimi YOK (advisory).
- Başka optimizasyonlar (memory kurulumu, MCP yapılandırması, .gitignore vb.) bu fazda YOK —
  `CHECKS` registry'si yeni kontrol eklemeye açık (ileride ayrı follow-up).
- Sessiz oto-oluşturma YOK (yan-etkili giderme = tek onay; güven sınırı korunur).

---

## 2. Saf çekirdek — `plugin/lib/optimizations.js`

Yan etkisiz, deterministik, testlenebilir. İki parça:

- **`CHECKS`** — sabit registry dizisi. Her giriş:
  ```js
  { id, title, detect(state) -> boolean,           // true = optimizasyon mevcut (ok)
    remediation: { kind: 'slash'|'skill'|'advisory', target, risk } }
  ```
  - `claude-md`: `detect = (s) => s.hasClaudeMd`; `remediation = { kind:'slash', target:'/init', risk:'side-effect' }`.
  - `permissions-allowlist`: `detect = (s) => s.permissionsAllowCount > 0`; `remediation = { kind:'skill', target:'fewer-permission-prompts', risk:'side-effect' }`.
  - `hooks`: `detect = (s) => s.hasHooks`; `remediation = { kind:'advisory', target:'update-config', risk:'none' }`.
- **`evaluateChecks(state)`** — `CHECKS`'i `state`'e karşı çalıştırır →
  `[{ id, title, status: 'ok'|'missing', remediation }]`. Yan etkisiz; `state` alanı eksikse
  güvenli (eksik = `missing` veya `false` kabul edilir, throw etmez).

`state` şekli (gather katmanının ürettiği): `{ hasClaudeMd, permissionsAllowCount, hasHooks }`.

---

## 3. Durum toplama + CLI — `plugin/lib/cli.js`

- **`gatherProjectState({ root, exists, readJson })`** — DI'lı, fail-soft. Gerçek FS okumalarını
  enjekte edilen `exists(path)` ve `readJson(path)` ile yapar:
  - `hasClaudeMd` = `exists(root/CLAUDE.md) || exists(root/CLAUDE.local.md)`.
  - settings = `readJson(root/.claude/settings.json)` ∪ `readJson(root/.claude/settings.local.json)`
    (ikisi de denenir; bozuk/yok → `null`, fail-soft).
  - `permissionsAllowCount` = settings'lerdeki `permissions.allow` dizilerinin toplam uzunluğu.
  - `hasHooks` = herhangi bir settings'te `hooks` objesi en az bir anahtar içeriyor mu.
  - Dönüş: `{ hasClaudeMd, permissionsAllowCount, hasHooks }`.
- **`checks` CLI komutu** — `--root <dir>` (default `process.cwd()`). Gerçek `exists`
  (`fs.existsSync`) + `readJson` (oku+parse, hata→null) ile `gatherProjectState` çağırır,
  `evaluateChecks` uygular, **son satır JSON** basar:
  ```jsonc
  { "root": "<dir>", "checks": [ { "id", "title", "status", "remediation" } ] }
  ```
- Diğer komutlar (`candidates`/`decide`/`install`/`execute`/`installed`) ve `installer.js`
  **değişmez**.

---

## 4. Orkestratör skill — `plugin/skills/project-tuner/SKILL.md`

`/autopilot-tune` komutuyla tetiklenir. Adımlar (SP6 yürütme + SP10 anlatım desenleri):

1. `node "$PLUGIN_ROOT/lib/cli.js" checks` çalıştır, son-satır JSON'ı parse et.
2. **Anlat (Türkçe):** `🔧 <N> kontrol yapıldı, <M> eksik.` Eksik listesini kısaca özetle.
   Hepsi `ok` ise: `✅ Proje zaten optimize — yapılacak bir şey yok.`
3. Her `status:'missing'` kontrol için:
   - `remediation.kind === 'advisory'` → sadece bildir: `ℹ️ <title> eksik — `update-config` ile
     ekleyebilirsin.` (yan-etki yok, onay yok).
   - `remediation.kind === 'slash'|'skill'` (auto) → ne yapılacağını göster, **TEK onay** iste
     (Türkçe). Onaylanırsa giderme hedefini çalıştır (`/init` → slash komutu; skill → Skill
     tool). Reddedilirse atla. Fail-soft: bir gidermenin hatası diğerlerini durdurmaz.
4. **Final özet (Türkçe):** `Özet: <N> kontrol, <giderilen> giderildi, <atlanan/danışmanlık>
   atlandı.`

**Fail-soft:** `checks` hata verir/parse edilemezse kullanıcının işini kırma — durumu Türkçe
söyle ve çık.

`allowed-tools`: `Bash, Read, Skill` (komut çalıştırma + giderme skill/slash tetikleme).

---

## 5. Komut — `plugin/commands/autopilot-tune.md`

`route.md` kardeşi. `/autopilot-tune` → `project-tuner` skill'ini tetikler. Frontmatter
`description` + `allowed-tools: Bash, Read, Skill`. Argüman almaz (veya opsiyonel `--root`).

---

## 6. Test Stratejisi (TDD — testsiz merge yok)

**`plugin/test/optimizations.test.js` (yeni):**
- `evaluateChecks` her kontrol için: tüm `ok` → hepsi `status:'ok'`; her biri tek tek `missing`
  → doğru `status` + doğru `remediation` (claude-md→/init slash; permissions→skill; hooks→advisory).
- `evaluateChecks` eksik/bozuk `state` (alan yok) → güvenli `missing`, throw yok.

**`plugin/test/checks-cli.test.js` (yeni):**
- `gatherProjectState` enjekte `exists`/`readJson` ile: CLAUDE.local.md varyasyonu; iki settings
  dosyasının `permissions.allow` birleşimi; `hooks` tespiti; bozuk JSON → null (fail-soft).
- `checks` komut çıktısının son-satır JSON şekli (`{root, checks}`).

**Skill/komut prose'u** birim-testlenmez (SP10 gibi); doğrulama yukarıdaki testler + şablon
gözden geçirmesi.

---

## 7. Mimari & İzolasyon

- `optimizations.js` saf, tek sorumluluk (kontrol tanımı + değerlendirme); FS/komut bilmiyor.
- `gatherProjectState` FS okumalarını DI ile soyutlar → testler ağa/diske çıkmaz.
- Skill orkestrasyonu mevcut SP6 (yürütme: read-only oto / yan-etki onay) + SP10 (Türkçe anlatım)
  desenlerini izler. `installer.js`/diğer komutlar etkilenmez.

---

## 8. Riskler / Açık Noktalar

- **Risk:** `process.cwd()` skill çalışırken doğru proje kökü olmayabilir. Azaltım: `--root`
  override + (opsiyonel) git-toplevel; plan netleştirir.
- **Risk:** `/init` veya `/fewer-permission-prompts` ortamda yoksa giderme başarısız. Azaltım:
  fail-soft + Türkçe "elle çalıştırabilirsin" mesajı.
- **Açık nokta yok:** Üç tasarım kararı (geniş kontrol listesi; ayrı komut; tespit+tek onayla
  oluştur) ve hooks=advisory kullanıcı tarafından onaylandı.

---

## 9. Kalite Çıtası

Teknik borçsuz, deterministik saf çekirdek + DI + fail-soft + testler. Uydurma giderme yok
(hooks=advisory). Tek dil (Türkçe) anlatım, SP10 ile tutarlı. İlgili:
`docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
