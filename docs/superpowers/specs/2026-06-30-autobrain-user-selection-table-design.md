# autobrain — Kullanıcı seçim tablosu (interactive capability gate)

**Tarih:** 2026-06-30
**Durum:** Onaylandı (brainstorming → implementasyon)

## Amaç

`/autobrain:route` akışında konsey karar verdikten sonra, kullanıcı adayları
açıklama + kaynak/market detaylarıyla bir **tablo** olarak görsün; modelin seçtikleri
önceden **✓ işaretli** gelsin; kullanıcı seçerse görev o seçilen yetenek(ler)le
yürütülsün. Kullanıcı seçimi yürütülecek seti belirler (modeli override eder).

## Kararlar (brainstorming)

- **Seçim UI:** Tam markdown tablo (≤10 aday) + serbest yanıt. AskUserQuestion'ın
  4-seçenek sınırına takılmaz.
- **Tetikleme:** Aday varsa (`candidates.length >= 1`) her zaman, karar ne olursa olsun
  (use_existing / install_then_use / no_capability_needed). no_capability_needed'da hepsi
  işaretsiz; kullanıcı bir aday ekleyebilir.
- **Yetki:** Kullanıcı seçimi tam yetkili. Seçilen yetenek kurulu değilse mevcut kurulum
  akışı: builtin → bedava, trusted → sessiz oto-kurulum, untrusted → tek onay. Seçilmeyen
  model adayları düşer.

## Mimari ilkesi

Mevcut desen: deterministik CLI komutları (decide/install/execute) + ince LLM
orkestrasyonu. Bu özellik de aynı kalıba uyar: LLM tabloyu çizer ve kullanıcının
doğal-dil yanıtını aday id'lerine çevirir; karar yeniden-kurma **deterministik CLI**de
kalır.

## Değişiklikler

### Kod 1 — `cli.js runCandidates` zenginleştirme
Her aday nesnesine ekle: `description`, `marketplace` (= `source.marketplace`),
`repo` (= `source.repo`), `discoveredVia` (= `source.discoveredVia`). Mevcut alanlar
(id/kind/name/trust/install/score) korunur. Tablo bu alanları gösterir.

### Kod 2 — yeni `cli.js select <decisionFile> --chosen <id1,id2,...>`
- Map'i ve mevcut karar dosyasını okur.
- `capabilities = chosen` (haritaya göre doğrulanır; bilinmeyen id elenir).
- `installs = chosen içinde install≠null olanlar` (builtin'ler install:null → hariç).
- `decision = chosen boşsa no_capability_needed; installs varsa install_then_use; yoksa use_existing`.
- `confidence = 1.0` (kullanıcı yetkili → güven kapısı kararı düşürmez).
- `method`/`rationale` korunur veya "kullanıcı seçimi" notuyla güncellenir.
- `normalizeDecision`'ı yeniden kullanır; sonucu `decisionFile`'a yazar; son satırda
  kanonik JSON basar (decide/execute ile aynı sözleşme).

### SKILL.md — yeni Step 6.5 "Aday tablosu & kullanıcı seçimi"
Step 6 (validate) ile Step 7 (install) arasına eklenir (cross-reference kırmamak için
6.5 numarası).
- `candidates` boşsa adımı atla.
- Markdown tablo, kolonlar: `# · ✓ · ad · tür · güven · kaynak/market · kurulum · açıklama(kısalt)`.
  ✓ = id'si nihai kararın `capabilities`'inde olan adaylar.
- Varsayılan = modelin seçimi. Kullanıcıya serbest yanıtla sor: "onayla" → varsayılan;
  numara/isimle ekle-çıkar.
- LLM yanıtı aday id'lerine çevirir → `node cli.js select <decisionFile> --chosen <ids>`
  → Step 7 ve Step 8 güncel karar üzerinde devam eder.
- Narration Türkçe.
- **Fail-soft:** yanıt anlaşılmazsa bir kez tekrar sor; yine anlaşılmazsa modelin
  kararına düş (akışı kırma).

## Test

- `candidates.test.js`: zenginleştirilmiş alanlar (`description`, `marketplace`) mevcut.
- Yeni `select-cli.test.js` (veya mevcut bir CLI test dosyasına ek): chosen → decision/
  installs türetme; builtin seçim install dışı; boş seçim → no_capability_needed;
  bilinmeyen id elenir; confidence 1.0.
- TDD: her CLI davranışı için önce başarısız test.

## Kapsam dışı (YAGNI)

- Tabloda sıralama/sayfalama yok (≤10 zaten).
- Çoklu tasarım yeteneği sınırı yok.
- Seçim geçmişi/önbellek saklanmaz.
