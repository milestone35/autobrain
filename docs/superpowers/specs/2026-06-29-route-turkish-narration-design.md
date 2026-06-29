# cc-autopilot — `/route` Türkçe İlerleyiş Anlatımı + Toplam Harita Boyutu (SP10) — Tasarım Dokümanı

- **Tarih:** 2026-06-29
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`plugin/`)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-proje:** SP9 (pypi-seeds) TAMAMLANDI, `master`'a merge edildi. Toplam 209 test (indexer 109 + plugin 100). Canlı scan (github token'lı): 1263 cap.

---

## 1. Amaç (Problem & Vizyon)

`/route` skill'i (capability-router council+executor) çalışırken kullanıcıya **ne yaptığını
Türkçe anlatmıyor**. CLI'nın deterministik `lines` çıktıları zaten Türkçe; ancak `SKILL.md`'deki
ajan yönergeleri İngilizce ("Report the final decision", "report them as-is") olduğundan ajanın
**kullanıcıya dönük anlatımı** Türkçe garanti değil ve adım-adım ilerleyiş özeti yok.

**Kullanıcı isteği:** Skill çalışırken özet ve ilerleyiş Türkçe olmalı; örn. *"bu task için 5
aday buldum, 2'sini kurdum, bunları kullanarak başlıyorum"*. Ayrıca her zaman **toplam yetenek
haritası boyutu** ("toplam map listemiz ne") anlatımda görünmeli.

### Kapsam

- **Parça A (kod):** `runCandidates` çıktısına `mapTotal` (toplam yetenek sayısı) eklenir.
- **Parça B (skill):** `SKILL.md`'ye, ajanın her adımda kısa Türkçe ilerleyiş + sonda toplu
  özet vereceği bir anlatım kuralı eklenir.

### KAPSAM DIŞI (açıkça)

- CLI'nın mevcut Türkçe `lines` çıktıları **değişmez** (zaten Türkçe).
- Yeni komut, yeni dil seçeneği veya İngilizce'ye geri-düşüş YOK (tek dil: Türkçe).
- Karar/kurulum/yürütme **mantığı** değişmez — yalnızca veri yüzeyi (`mapTotal`) ve anlatım.
- Hook (UserPromptSubmit) pasif kalır; bu iş yalnızca `/route` akışını etkiler.

---

## 2. Parça A — `mapTotal` (deterministik, testli)

**Dosya:** `plugin/lib/cli.js` → `runCandidates`.

Mevcut imza `{ candidates }` (hata yolunda `{ candidates: [], error }`) döndürüyor. Eklenir:

- **Başarı yolu:** `mapTotal: map.capabilities.length`.
- **Hata yolu** (`harita yok`/yükleme hatası): `mapTotal: 0` (mevcut `{ candidates: [], error }`
  yanına).

```jsonc
// node lib/cli.js candidates "<istek>"
{
  "mapTotal": 1263,
  "candidates": [ { "id": ..., "kind": ..., "name": ..., "trust": ..., "install": ..., "score": ... } ]
}
```

`candidates` CLI komutu zaten `runCandidates`'in tüm objesini `JSON.stringify` ile basıyor
(`cli.js` main), dolayısıyla `mapTotal` ek kod olmadan çıktıya yansır. Başka komut (`decide`/
`install`/`execute`) **dokunulmaz**.

**Neden burada:** Skill Step 1 zaten bu JSON'ı parse ediyor → ekstra komut/ayrıştırma gerekmez,
toplam tek kaynaktan (haritanın kendisi) gelir.

---

## 3. Parça B — `SKILL.md` Türkçe anlatım kuralı

`plugin/skills/capability-router/SKILL.md`'ye, Inputs'tan hemen sonra bir **"İlerleyiş anlatımı
(Türkçe)"** bölümü eklenir ve ilgili adımlara kısa anlatım talimatı serpilir. Kural:

> Tüm kullanıcıya dönük ilerleyiş ve özet **Türkçe** yazılır. Her ana adımda tek satırlık kısa
> bir ilerleme, en sonda toplu bir özet ver. CLI çıktısını ham basma — kendi cümlenle özetle.

**Adım eşlemesi (anlatım şablonu, kelime kelime zorunlu değil):**

- **Step 1 (aday toplama):** `🔎 <N> aday buldum (toplam harita: <mapTotal> yetenek).`
  — `N = candidates.length`, `mapTotal` Step 1 JSON'undan.
  Aday yoksa: `🔎 Bu istek için uygun aday yok — varsayılan davranışla devam ediyorum.`
- **Step 6 (karar):** `🧠 Konsey kararı: <decision> — yetenek(ler): <id'ler> (gerekçe: <kısa>).`
- **Step 7 (kurulum):** `📦 <X> kuruldu, <Y> atlandı/zaten var` ve onay bekleyen varsa
  `⏳ <Z> yetenek onay bekliyor.` (Onay istemi de Türkçe.)
- **Step 8 (yürütme):** `▶️ Bunları kullanarak başlıyorum: <yöntem>.` Yan-etkili adım onayı Türkçe.
- **Final toplu özet** (akışın sonunda, tek blok):
  ```
  Özet: <N> aday bulundu, <X> kuruldu, toplam harita <mapTotal> yetenek.
  <ne ile başlandığı / sonuç>.
  ```

`no_capability_needed` / fail-soft yollarında da Türkçe tek satır: `varsayılan davranışla devam
ediyorum`.

---

## 4. Mimari & İzolasyon

- **Parça A** saf veri ekidir: `runCandidates` zaten haritayı yüklüyor, `mapTotal` türetilmiş
  alan. Diğer modüller (matcher/decision/installer/execution) **etkilenmez**.
- **Parça B** salt prompt/dokümantasyon değişikliğidir; çalışma-zamanı mantığı yok. Anlatımın
  beslendiği veriler (aday sayısı, karar, kurulum sonucu, `mapTotal`) zaten ilgili adımların
  çıktısında mevcut.

---

## 5. Test Stratejisi (TDD — testsiz merge yok)

**Parça A (`plugin/test/`):**

- `runCandidates` başarı yolunda `mapTotal === map.capabilities.length` (sahte/küçük harita
  fixture'ıyla; `candidates` filtresinden bağımsız tam harita boyutu).
- `runCandidates` hata yolunda (`mapFile` yok/bozuk) `mapTotal === 0` ve `candidates === []`.
- (Regresyon) `candidates` alanının şekli/sıralaması değişmedi.

**Parça B:** Prompt metni birim-testlenmez. Doğrulama, `runCandidates`'in `mapTotal` sağladığını
gösteren Parça A testleriyle + spec'teki anlatım şablonunun gözden geçirilmesiyle yapılır.

---

## 6. Riskler / Açık Noktalar

- **Risk:** Anlatım fazla gürültülü olabilir. Azaltım: adım başına **tek satır**, sonda tek özet
  bloğu; ham CLI çıktısı tekrar basılmaz.
- **Açık nokta yok:** İki tasarım kararı (her-adım+final anlatım; `mapTotal`'ı `candidates`
  JSON'una ekleme) kullanıcı tarafından onaylandı.

---

## 7. Kalite Çıtası

Teknik borçsuz, deterministik saf ekleme + testler. `mapTotal` testsiz merge edilmez. Anlatım
tek dil (Türkçe), tutarlı şablon. İlgili: `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
