# autobrain — Tasarım-farkındalığı (design-awareness)

**Tarih:** 2026-06-30
**Durum:** Onaylandı (brainstorming → implementasyon)

## Problem

`/autobrain:route` ile çalıştırılan bir görevde konsey (Planner + Critic) bileşik bir
isteği yanlış yönlendirdi. Görev iki alt-görevden oluşuyordu:

1. Bir Java/Spring chat pipeline'ını **analiz et** (kod analizi — builtin Explore/Read doğru araç),
2. Bunu **şık, self-contained bir HTML rapora dök** (tasarım/frontend teslim ürünü).

Matcher `frontend-design`'ı zaten aday olarak yüzeye çıkardı, ama Planner (güven 0.86) ve
Critic ikisi de `no_capability_needed` dedi; gerekçe "tüm adaylar chat-UI/harita/deploy
içindir, Java/Spring analizi değil." Rapor düz builtin `Write` ile üretildi ve tasarım
kalitesi düşük kaldı.

### Kök neden

Matcher/skorlama değil — **konsey muhakemesi** (SKILL.md'deki Planner/Critic prompt'u):

- Konsey bileşik görevi **baskın alt-göreve (kod analizi)** indirgedi.
- Teslim ürününün bir **HTML/görsel artefakt** olduğunu, yani bir tasarım yeteneğinin
  tam da iyileştireceği şeyi yok saydı.
- "En küçük/en ucuz set, builtin'i tercih et" önyargısı tasarım yeteneğini "fazlalık"
  olarak eledi.

## Çözüm — 4 tamamlayıcı değişiklik

### A) Prompt: SKILL.md (Planner Step 2 + Critic Step 3)
- **Bileşik görev ayrıştırma:** Planner isteği önce kısa alt-görevlere ayırır; tek baskın
  alt-göreve indirgemez; her alt-görevi ayrı değerlendirir.
- **Teslim-format kuralı:** Teslim ürünü kullanıcıya gösterilen **görsel/sunum artefaktı**
  (HTML rapor/sayfa, UI, slayt, diyagram, landing) ise **ve** adaylarda bir tasarım
  yeteneği varsa, onu sete dahil et. Görsel teslimde tasarım kalitesi "işi yapmanın
  parçası"dır, gold-plating değildir. Düz kod/markdown/JSON/CLI çıktısında tetiklenmez.
- **Karma (mixed) karar:** Çekirdek iş builtin + teslim için tasarım yeteneği. `capabilities`'e
  tasarım yeteneğini koy (kurulum gerekiyorsa `install_then_use`), `method`'da ayrımı yaz.
- **Critic dengeleyici kural:** Görsel/sunum teslim ürünü için düz builtin `Write` tasarım
  kalitesini karşılamaz; aday havuzunda tasarım yeteneği varsa kabul et (token maliyeti
  bu durumda gerekçeli).

### B) Kod: topN 5 → 10
- `plugin/lib/config.js` DEFAULTS.topN ve `plugin/config/autobrain.config.json` topN.
- Daha fazla aday yüzeye çıkar; tasarım yeteneklerinin top-N'e girme olasılığı artar.

### C) Kod: `artifact-design`'ı builtin skill olarak ekle
- `indexer/src/sources/builtin-catalog.js` BUILTINS listesine:
  `{ kind: 'skill', name: 'artifact-design', description: '...',
     keywords: ['design','html','report','artifact','page','visual','layout','css','ui','polished'] }`
- `discoveredVia:'builtin'` → `trust:'builtin'`, `install:null` (kurulumsuz),
  id `builtin::core::skill::artifact-design`.
- Görsel teslimde konsey bunu kurulum sürtünmesi olmadan `frontend-design` kurmaya tercih
  edebilir. Execution: kind `skill` → `invoke_skill`, side-effecting (tek onay).
- Haritayı yeniden üret (indexer); üretilemezse entry'yi `plugin/data/capability-map.json`'a
  elle enjekte et (canlı olması için).

### D) Kod: matcher.js sınırlı tasarım sezgisi
- Prompt görsel-teslim sinyali içeriyorsa (regex `html|report|rapor|dashboard|landing|slide|slayt|diagram|diyagram|\bui\b|sayfa|page|tasarl|design|visual|görsel|css`)
  **ve** kapasite tasarım-odaklıysa (name/keywords/desc'te `design|frontend|ui|visual|layout|css|artifact`),
  skora sabit bonus (+4) ekle.
- Sinyal yoksa bonus yok → düz kod/yaz görevlerinde davranış değişmez.

## Test / doğrulama

- `plugin` ve `indexer` altında mevcut testler: `node --test`.
- Yeni vakalar: matcher bonus (sinyal var/yok), builtin-catalog'da artifact-design varlığı.
- Davranışsal: örnek "html rapora aktar" prompt'unda `frontend-design`/`artifact-design`
  top-N'de ve seçilir; "bir fonksiyon yaz" prompt'unda bonus tetiklenmez.

## Kapsam dışı (YAGNI)

- Figma/diğer tasarım sağlayıcıları için özel mantık yok.
- Öğrenen/ağırlıklı skor yok; bonus sabit.
- Composite kararda en fazla 1 tasarım yeteneği.
