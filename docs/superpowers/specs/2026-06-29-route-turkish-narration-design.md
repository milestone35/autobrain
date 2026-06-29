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
aday buldum, 2'sini kurdum, bunları kullanarak başlıyorum"*. Ayrıca uygun bir yerde **skill'in
açık (devrede) olduğu**, **toplam yetenek haritası boyutu** ("toplam map listemiz ne") ve
**gerçekten kurulu yetenek sayısı** anlatımda görünmeli.

### Kapsam

- **Parça A (kod):** `runCandidates` çıktısına `mapTotal` (toplam yetenek sayısı) eklenir.
- **Parça B (kod):** Yeni `installed` CLI komutu — `claude plugin list` + `claude mcp list`
  çıktılarından **gerçek kurulu** plugin/mcp sayısını probe edip sayar (fail-soft). Saf sayaç
  fonksiyonu, gerçek çıktı formatından yakalanan fixture'a karşı testlenir.
- **Parça C (skill):** `SKILL.md`'ye, ajanın her adımda kısa Türkçe ilerleyiş + intro'da
  "skill devrede + toplam harita + kurulu sayısı" + sonda toplu özet vereceği anlatım kuralı.

### KAPSAM DIŞI (açıkça — ayrı alt-projelere devredildi)

- CLI'nın mevcut Türkçe `lines` çıktıları **değişmez** (zaten Türkçe).
- İngilizce'ye geri-düşüş / dil seçeneği YOK (tek dil: Türkçe).
- Karar/kurulum/yürütme **mantığı** değişmez — yalnızca veri yüzeyi (`mapTotal` + `installed`
  sayacı) ve anlatım eklenir.
- Hook (UserPromptSubmit) pasif kalır; bu iş yalnızca `/route` akışını etkiler.
- **`/init` optimizasyon kontrolü** (proje CLAUDE.md/init durumu kontrol edilip eksikse
  oluşturulması) → **SP11** olarak ayrı brainstorm+spec+plan. SP10 dışında.
- **Uzun sohbette oto-`/new` + context koruma** → **SP12** olarak ayrı tasarım. Teknik not:
  `/new` context'i SIFIRLAR (korumaz) ve bir SKILL.md `/new` tetikleyemez; bu iş harness/hook +
  memory-handoff (veya yerleşik auto-compaction) gerektirir. SP10 dışında.

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

## 3. Parça B — `installed` komutu (kurulu sayısı, runtime)

**Dosya:** `plugin/lib/cli.js` (yeni saf fonksiyon + yeni `installed` komutu).

"Yüklü olan skill sayısı" = **gerçekten kurulu** plugin + mcp sayısı (kullanıcı onayı: runtime).
Kaynak: `claude plugin list` ve `claude mcp list` çıktıları, mevcut `probeList` deseniyle.

- **Saf sayaç:** `countListed(method, listText)` → number. Yan etkisiz, format'a karşı testlenir.
  - `plugin`: kurulu her plugin `name@marketplace` referansıyla göründüğünden, çıktıdaki
    `name@marketplace` örüntülerini (kelime-sınırlı) sayar. Boş/yardım metni → 0.
  - `mcp`: empty-state guard (`/no\s+mcp\s+servers/i`) → 0; aksi halde gerçek server
    satırlarını sayar (yardım/başlık satırları hariç).
- **Probe:** `runInstalledCount({ env })` → `{ plugins, mcp, total }`. `env.run`/probe DI'lı,
  fail-soft: list komutu yoksa/başarısızsa o kanal `0` (asla throw etmez, `/route` akışını kırmaz).
- **CLI:** `node lib/cli.js installed` → son satır JSON `{ "plugins": N, "mcp": M, "total": N+M }`.

```jsonc
// node lib/cli.js installed
{ "plugins": 3, "mcp": 2, "total": 5 }
```

**Format yakalama (TDD ön-koşulu):** `claude plugin list` / `claude mcp list`'in tam çok-satırlı
çıktı formatı repoda yok. Parser tahminle değil; implementasyonda **önce gerçek komut çalıştırılıp
çıktı bir fixture'a kaydedilir**, sayaç o fixture'a karşı yazılır. Empty-state ve dolu-state
ikisi de test edilir.

**Neden ayrı komut:** `candidates` per-prompt eşleştirmedir; runtime envanteri (alt-süreç
`claude ... list`) ayrı sorumluluktur. `/route` intro'da bir kez çağrılır.

---

## 4. Parça C — `SKILL.md` Türkçe anlatım kuralı

`plugin/skills/capability-router/SKILL.md`'ye, Inputs'tan hemen sonra bir **"İlerleyiş anlatımı
(Türkçe)"** bölümü eklenir ve ilgili adımlara kısa anlatım talimatı serpilir. Kural:

> Tüm kullanıcıya dönük ilerleyiş ve özet **Türkçe** yazılır. Her ana adımda tek satırlık kısa
> bir ilerleme, en sonda toplu bir özet ver. CLI çıktısını ham basma — kendi cümlenle özetle.

**Adım eşlemesi (anlatım şablonu, kelime kelime zorunlu değil):**

- **Step 0 (intro — skill devrede):** Akışın başında, `installed` komutunu bir kez çağırıp:
  `🟢 cc-autopilot devrede — toplam harita: <mapTotal> yetenek, kurulu: <installed.total>.`
  (`mapTotal` Step 1 JSON'undan, `installed.total` `installed` komutundan.)
- **Step 1 (aday toplama):** `🔎 <N> aday buldum.` — `N = candidates.length`.
  Aday yoksa: `🔎 Bu istek için uygun aday yok — varsayılan davranışla devam ediyorum.`
- **Step 6 (karar):** `🧠 Konsey kararı: <decision> — yetenek(ler): <id'ler> (gerekçe: <kısa>).`
- **Step 7 (kurulum):** `📦 <X> kuruldu, <Y> atlandı/zaten var` ve onay bekleyen varsa
  `⏳ <Z> yetenek onay bekliyor.` (Onay istemi de Türkçe.)
- **Step 8 (yürütme):** `▶️ Bunları kullanarak başlıyorum: <yöntem>.` Yan-etkili adım onayı Türkçe.
- **Final toplu özet** (akışın sonunda, tek blok):
  ```
  Özet: <N> aday bulundu, <X> kuruldu, toplam harita <mapTotal> yetenek, kurulu <installed.total>.
  <ne ile başlandığı / sonuç>.
  ```

`no_capability_needed` / fail-soft yollarında da Türkçe tek satır: `varsayılan davranışla devam
ediyorum`.

---

## 5. Mimari & İzolasyon

- **Parça A** saf veri ekidir: `runCandidates` zaten haritayı yüklüyor, `mapTotal` türetilmiş
  alan. Diğer modüller (matcher/decision/installer/execution) **etkilenmez**.
- **Parça B** mevcut `probeList`/`realEnv` desenini izler: saf `countListed` (testlenebilir) +
  fail-soft probe sarmalayıcı. `installer.js` ve diğer komutlar değişmez (yeni, izole komut).
- **Parça C** salt prompt/dokümantasyon değişikliğidir; çalışma-zamanı mantığı yok. Anlatımın
  beslendiği veriler (aday sayısı, karar, kurulum sonucu, `mapTotal`, `installed`) zaten ilgili
  adımların çıktısında mevcut.

---

## 6. Test Stratejisi (TDD — testsiz merge yok)

**Parça A (`plugin/test/candidates.test.js`):**

- `runCandidates` başarı yolunda `mapTotal === map.capabilities.length` (fixture 3 cap, eşleşen 2
  → `mapTotal===3`, `candidates.length===2`: tam-harita ≠ aday-sayısı kanıtı).
- `runCandidates` hata yolunda (`mapFile` yok/bozuk) `mapTotal === 0` ve `candidates === []`.

**Parça B (`plugin/test/installed-cli.test.js`, yeni):**

- `countListed('plugin', <çok-satırlı örnek>)` → doğru sayı; empty/yardım metni → 0.
- `countListed('mcp', <çok-satırlı örnek>)` → doğru sayı; empty-state (`No MCP servers...`) → 0.
- `runInstalledCount` enjekte edilmiş probe ile `{plugins, mcp, total}` döndürür; probe
  başarısız/eksikse ilgili kanal `0` (fail-soft, throw yok).
- Örnekler, implementasyonda gerçek `claude ... list` çıktısından yakalanan fixture'a dayanır.

**Parça C:** Prompt metni birim-testlenmez; doğrulama Parça A+B testleri + anlatım şablonu
gözden geçirmesiyle yapılır.

---

## 7. Riskler / Açık Noktalar

- **Risk:** `claude plugin list`/`mcp list` çıktı formatı bilinmiyor → kırılgan parser. Azaltım:
  format **önce gerçek komuttan yakalanır**, sayaç ona karşı yazılır; her iki kanal fail-soft.
- **Risk:** Anlatım fazla gürültülü olabilir. Azaltım: adım başına **tek satır**, sonda tek özet.
- **Açık nokta yok:** Üç tasarım kararı (her-adım+intro+final anlatım; `mapTotal`'ı `candidates`'a
  ekleme; kurulu sayısı = runtime) kullanıcı tarafından onaylandı. `/init` ve oto-`/new` ayrı
  alt-projelere (SP11/SP12) devredildi.

---

## 8. Kalite Çıtası

Teknik borçsuz, deterministik saf ekleme + testler. `mapTotal` ve `countListed`/`runInstalledCount`
testsiz merge edilmez; parser gerçek formata karşı doğrulanır. Anlatım tek dil (Türkçe), tutarlı
şablon. İlgili: `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`.
