# cc-autopilot → autobrain Rebrand (SP14) — Tasarım Dokümanı

- **Tarih:** 2026-06-29
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (yerel klasör adı DEĞİŞMEZ)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-proje:** SP13 (yayın paketleme) TAMAMLANDI, `master`'a merge + GitHub'a push (`milestone35/autobrain`). Toplam 228 test (indexer 109 + plugin 119).

---

## 1. Amaç

Proje GitHub'da `milestone35/autobrain` olarak yayınlandı ama kod/manifest/doküman hâlâ
`cc-autopilot` (ve `autopilot`) adını taşıyor. Kullanıcı markayı **autobrain**'e taşımak istiyor —
her yerde (kullanıcı onaylı: tam rebrand).

**Karar (kullanıcı onaylı, 2026-06-29):** Tüm CANLI artıklarda `cc-autopilot` → `autobrain`;
ayrıca bare `autopilot` kalıntıları (komut + config dosya adı) da `autobrain`. Yerel klasör adı ve
tarihli `docs/` geçmiş kayıtları DEĞİŞMEZ. Rename sonrası remote'a push.

---

## 2. İsim eşlemesi

Sıra önemli: önce `cc-autopilot` → `autobrain`, sonra kalan bare `autopilot` → `autobrain`
(böylece `cc-autopilot-router` → `autobrain-router`, çift dönüşüm olmaz).

| Eski | Yeni | Yer |
|---|---|---|
| `cc-autopilot` (28 literal) | `autobrain` | her canlı dosya |
| `cc-autopilot-router` | `autobrain-router` | `plugin/package.json` name |
| `cc-autopilot-indexer` | `autobrain-indexer` | `indexer/package.json` name |
| `cc-autopilot` (bare) | `autobrain` | `plugin/.claude-plugin/plugin.json` name; marketplace `name`+`plugins[].name` |
| `[cc-autopilot]` | `[autobrain]` | `lib/cli.js` (7×), `lib/hook.js` (1×) |
| `cc-autopilot` (UA) | `autobrain` | `indexer/src/http.js` User-Agent |
| `/cc-autopilot:route` | `/autobrain:route` | READMEs |
| `autopilot-tune` | `autobrain-tune` | komut dosya adı + içerik + `optimizations.js` yorum + `project-tuner` SKILL |
| `autopilot.config.json` | `autobrain.config.json` | dosya adı + `lib/cli.js` `loadPluginConfig` yolu + READMEs + SMOKE.md |

Kurulum komutu sonuçta: `/plugin install autobrain@autobrain` (marketplace add zaten
`milestone35/autobrain`).

---

## 3. Dosya operasyonları

**git mv (yeniden adlandırma):**
- `plugin/config/autopilot.config.json` → `plugin/config/autobrain.config.json`
- `plugin/commands/autopilot-tune.md` → `plugin/commands/autobrain-tune.md`

**İçerik düzenlemesi (literal + bare replace):**
- **Plugin kod:** `lib/cli.js` (config yolu satır 27 + 7 log öneki), `lib/hook.js` (1 log öneki),
  `lib/optimizations.js` (satır 1 yorum: `autobrain's /autobrain-tune`).
- **Manifest:** `plugin/.claude-plugin/plugin.json`, `plugin/package.json`, `.claude-plugin/marketplace.json`,
  `indexer/package.json`.
- **Indexer:** `indexer/src/http.js` (UA), `indexer/README.md`.
- **Skill/komut/doküman:** `skills/capability-router/SKILL.md`, `skills/project-tuner/SKILL.md`,
  `commands/route.md`, `commands/autobrain-tune.md` (yeni ad), `plugin/README.md`, `SMOKE.md`,
  kök `README.md`.
- **Testler (assert güncellemesi):** `plugin/test/hook.test.js` (satır 18 `/cc-autopilot/` →
  `/autobrain/`), `indexer/test/http.test.js` (satır 30 UA `'cc-autopilot'` → `'autobrain'`).

**Kapsam dışı (dokunulmaz):** yerel klasör adı; `docs/superpowers/specs+plans` (SP14 hariç tarihli
kayıtlar); `capability-router`/`project-tuner` skill adları (tanımlayıcı, marka değil).

---

## 4. Doğrulama

- **Tam suite** (indexer + plugin, `node --test`): `fail 0` (228 test; assert'ler güncellendi).
- **Residual grep:** `plugin/`, `indexer/`, kök manifest+README'lerde `cc-autopilot` = **0**; bare
  `autopilot` = **0** (config/komut yeniden adlandırıldı). docs/ hariç.
- **Canlı smoke:** `node plugin/lib/cli.js candidates "audit api security"` → `mapTotal:1263`
  (yeni `autobrain.config.json` okunuyor); log öneki `[autobrain]`.
- **Manifest geçerliliği:** `plugin.json` name=`autobrain`; `marketplace.json` name=`autobrain`,
  `plugins[].name`=`autobrain`, `source`=`./plugin`.
- **Remote:** commit + `git push origin master` (`milestone35/autobrain`).

---

## 5. Mimari & İzolasyon

Saf yeniden adlandırma: yeni modül/mantık yok, davranış değişmez. Risk = bir geçişi kaçırmak veya
bir test assert'ini bozmak; azaltım = tam suite + residual grep + iki yeniden adlandırılan dosyanın
referanslarının (config yolu, komut) elle teyidi.

---

## 6. Riskler / Açık Noktalar

- **Risk:** `loadPluginConfig` config dosya yolunu güncellemezse config bulunamaz → DEFAULTS'a
  düşer (fail-soft çalışır ama özel ayarlar kaybolur). Azaltım: cli.js satır 27 değişimi + canlı
  smoke teyidi.
- **Risk:** Sıra hatası (`autopilot` önce) `cc-autopilot`'ı `cc-autobrain` yapar. Azaltım: plan
  önce `cc-autopilot`, sonra bare `autopilot` sırasını zorunlu kılar.
- **Risk:** Komut namespacing → `/autobrain:autobrain-tune` (çift). Kabul: dosya adı `autobrain-tune`
  kullanıcı isteğine uygun; namespacing CC görüntü detayı.
- **Açık nokta yok:** Üç kapsam kararı (klasör kalır; tam rebrand; geçmiş doc dokunulmaz) onaylandı.

---

## 7. Kalite Çıtası

Teknik borçsuz, tutarlı tek marka (autobrain), testli (suite yeşil + residual grep 0). İndiren
kullanıcı `autobrain@autobrain` ile kurar. İlgili: `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
