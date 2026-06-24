# cc-autopilot — Yürütme Katmanı (Sub-project 6) — Tasarım Dokümanı

- **Tarih:** 2026-06-24
- **Durum:** Onaylandı (brainstorming) → implementasyon planına hazır
- **Konum:** `C:\Users\harun.hanbay\Desktop\cc-autopilot\` (`plugin/` alt-klasörü)
- **Sahip:** harun.hanbay
- **Üst spec:** `docs/superpowers/specs/2026-06-19-cc-autopilot-design.md`
- **Önceki alt-projeler:** SP1 (Indexer), SP2 (Router+matcher+hook), SP3 (Konsey + `/route`), SP4 (Oto-installer), SP5 (Yerleşik taksonomi) — hepsi TAMAMLANDI ve `master`'da.
- **İlişki:** SP5 brainstorming'inde "fiili yürütme" ayrı alt-proje (SP6) olarak ayrıldı. Bu spec onu hayata geçirir.

---

## 1. Amaç (Problem & Vizyon)

Bugün `/route` konseyi yalnızca **karar verir ve raporlar** (SP3); trusted ise kurar (SP4); ama
seçtiği yeteneği kullanarak kullanıcının işini **yapmaz**. Bu alt-proje `/route`'u pasif öneriden
**aktif yürütücüye** dönüştürür: konsey karar verdikten (ve gerekirse kurduktan) sonra, seçilen
yeteneği kullanarak işi **fiilen tamamlar** — bir güvenlik/onay kapısıyla.

Somut motive eden kullanım (SP5'ten): kullanıcı `! ssh root@10.10.15.141 echo ok` benzeri uzak
komutları ajana aktarıyor. SP6 ile `/route "10.10.15.141 sunucusunda diski kontrol et"` →
konsey `bang` yeteneğini seçer → executor planı `run_shell` adımı üretir → kullanıcı tek onay
verir → ajan komutu Bash ile koşturur.

### Kritik içgörü (mimariyi belirler)

SP4 installer'ı Node ile **shell'leyebiliyordu** (enjekte `run`). SP6'da ise bir Grep/Task/Skill
çağrısını Node kodu **çalıştıramaz** — bunları **ana ajan (Claude) gerçek araçlarıyla** yapmalı
(kullanıcı da görsün ve CC izin modeli uygulansın diye). Bu nedenle:

- **Deterministik çekirdek = PLANLAYICI/SINIFLAYICI** (yan etki yok, %100 test edilebilir): kararı
  sıralı yürütme adımlarına çevirir ve her adımın riskini etiketler. **YÜRÜTMEZ.**
- **Fiili yürütücü = SKILL reçetesi** (ana ajan): planı okur, yan-etkili adımlar için onay alır,
  sonra adımları gerçek araçlarla (Bash/Skill/Task/slash…) **yapar.**

Bu, SP4'ün `planInstalls`/`executeInstalls` + CLI + reçete-adımı desenini izler — ama "execute"
tarafı kod değil ajandır.

### Kapsam

- **Tetikleyici:** Yalnızca `/route` (açık çağrı). Her-prompt otomatik yürütme KAPSAM DIŞI (hook
  hızlı fail-open bir Node script'i; subagent/araç çalıştıramaz — gelecekte ayrı faz).
- **Onay sınırı:** Salt-okunur yetenekler onaysız çalışır; yan-etkili/dış-etkili olanlar tek onay
  ister (§4 risk modeli).

### Kalite çıtası (NON-NEGOTIABLE)

Teknik borçsuz, uzman düzeyi, %100 sağlam. Planlayıcı+sınıflayıcı saf/deterministik ve tam
unit-testli. Hata yönetimi fail-soft: kullanıcının asıl işi ASLA bozulmaz. Testsiz merge yok.

---

## 2. Mimari & Veri Akışı

```
/route "..." → konsey karar (SP3) → (gerekirse install, SP4)
            → execution.planExecution(decision, map)        ← YENİ deterministik
            → her adıma execution.classifyRisk(step)         ← YENİ deterministik
            → cli.js execute <decisionFile> [--approved ...]  ← YENİ (makine-okunur plan)
            → SKILL Step 8: ajan planı UYGULAR (onay kapısıyla) ← YENİ reçete
```

**Yeni dosyalar:**
- `plugin/lib/execution.js` — saf planlama + risk sınıflama (yan etki yok).
- `plugin/test/execution.test.js` — unit testler.
- `plugin/lib/cli.js` — `execute` alt-komutu eklenir (mevcut dosya).
- `plugin/test/execute-cli.test.js` — CLI testi.
- `plugin/skills/capability-router/SKILL.md` — Step 8 (yeni); `SMOKE.md` — manuel senaryolar.
- `plugin/commands/route.md` — "yalnızca raporla" ifadesi "karar ver + uygula"ya güncellenir.

---

## 3. Adım Modeli & `kind → action` Eşlemesi

`planExecution(decision, map)` her seçili yetenek id'sini sıralı bir yürütme adımına çevirir:

```js
{ id, name, kind, action, risk, directive }
```

`kind → action` (deterministik):

| kind | action | Ajan bunu nasıl yapar |
|---|---|---|
| `bang` | `run_shell` | Bash aracıyla komutu koşturur (ssh dahil) |
| `builtin-tool` | `use_tool` | Aracı doğrudan kullanır (Grep/Read/Edit…) |
| `slash` | `invoke_slash` | Slash komutunu çağırır |
| `builtin-agent` | `dispatch_agent` | Task ile o ajan tipini başlatır |
| `agent` | `dispatch_agent` | Task ile kurulu ajanı başlatır |
| `skill` | `invoke_skill` | Skill aracıyla çağırır |
| `command` | `invoke_slash` | Kurulu slash komutunu çağırır |
| `mcp` | `call_mcp` | İlgili MCP aracını çağırır |
| `plugin` | `use_directly` | Net bileşen yok → fallback |

- **`directive`:** ajana ne yapacağını söyleyen kısa yapısal ipucu. `use_tool`→araç adı (`cap.name`);
  `dispatch_agent`→agentType (`cap.name`); `invoke_slash`→komut adı; `run_shell`→sabit talimat metni
  ("kullanıcının isteğini gerçekleştiren tek shell komutunu oluştur ve çalıştır" — komutun KENDİSİ
  konsey/ajan tarafından kullanıcının niyetinden üretilir, deterministik değildir).
- **Sıra:** `decision.capabilities` sırası korunur. Kurulması gerekenler (SP4) önce kurulur.
- **Eşleşmeyen id:** haritada yoksa adım atlanır (savunma; SP3 zaten ayıklar).

---

## 4. Risk Modeli

`classifyRisk(step)` → `'read-only'` | `'side-effecting'` (saf, deterministik).

**Salt-okunur allow-list (onaysız oto-çalışır):**

| kategori | girişler |
|---|---|
| builtin-tool | `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch` |
| builtin-agent | `Explore`, `Plan` |
| slash | `/review`, `/security-review`, `/code-review` |

**Yan-etkili (tek onay ister):** allow-list dışındaki HER ŞEY —
- `bang` (her zaman; ssh/komut çalıştırma),
- builtin-tool: `Write`, `Edit`, `Bash`, `Task`,
- builtin-agent: `general-purpose`, `code-reviewer`,
- tüm `skill`, `agent`, `command`, `mcp`, `plugin`,
- tanınmayan/yeni builtin-tool veya builtin-agent adı (fail-safe → side-effecting).

**İlke:** "Kesin salt-okunur olarak tanınmayan = yan-etkili." Allow-list dar ve açık; bilinmeyen
her şey onaya düşer. `bang` için istisna yok.

**Onay akışı (reçetede):** plan üretilince ajan yan-etkili adımları (id + action + `run_shell` için
üretilen tam komut) tek mesajda gösterir, **tek onay** ister. Onay → hepsi sırayla çalışır; ret →
yan-etkililer atlanır, salt-okunurlar yine çalışır. Salt-okunurlar onay beklemez.

---

## 5. CLI Sözleşmesi (`cli.js execute`)

`node cli.js execute <decisionFile> [--approved id,id,...]` — SP4 `install` desenini izler:

- `planExecution` + her adıma `classifyRisk` uygular.
- `--approved` YOKSA: yan-etkili adımlar `status: "needs-approval"`, salt-okunurlar `status: "ready"`.
- `--approved id,id` ile: o id'ler `status: "ready"` olur.
- **CLI hiçbir şey çalıştırmaz** — yalnızca plan + onay durumunu döndürür (fiili iş ajanda).
- Çıktı sözleşmesi `decide`/`install` ile aynı: üst satırlar insan-okunur özet, **son satır = kanonik
  JSON** (reçete son satırı parse eder).
- `decision: no_capability_needed` veya boş plan → boş `steps` listesi.
- Bozuk/okunamayan dosya → temiz hata mesajı + non-zero exit (asıl işi bozmadan).

---

## 6. SKILL.md Step 8 (Reçete) & route.md

**Step 8 — Execute (Step 7 install'dan sonra):**
1. `node "$PLUGIN_ROOT/lib/cli.js" execute "$PLUGIN_ROOT/.decision.tmp.json"` çağır, son-satır JSON'u parse et.
2. `decision: no_capability_needed` veya `steps` boşsa → atla; işi normal akışınla yap.
3. `status: ready` (salt-okunur) adımları **doğrudan uygula** (ilgili gerçek aracı/skill'i/agent'ı kullan).
4. `status: needs-approval` adım varsa: hepsini (id + action + `run_shell` için ürettiğin tam komut)
   tek mesajda göster, **tek onay** iste. Onaylanırsa `execute --approved <ids>` ile teyit et ve adımları
   gerçek araçlarla uygula. Reddedilirse o adımları atla ve kullanıcıya bildir.
5. Sonucu raporla (ne yapıldı, ne atlandı, varsa hata).

**Hata yönetimi (fail-soft):** plan boşsa/`execute` hata verirse → kullanıcının asıl işini ASLA
bozma; normal davranışa dön ve durumu söyle. Tek adımın başarısızlığı kalanları iptal etmez
(sıradakine devam, sonda özet).

**route.md:** açıklamadaki "read-only; installs nothing" / "report a decision" ifadeleri,
"decide and carry out the task (with an approval gate for side-effecting steps)" olacak şekilde
güncellenir. `allowed-tools`'a yürütme için gereken araçlar eklenir (Bash zaten var; Skill eklenir).

---

## 7. Test Stratejisi (TDD)

Mevcut 124 testin üzerine ~12-15 yeni test:

1. **planExecution:** her kind → doğru action (9 kind); `decision.capabilities` sırası korunur;
   haritada olmayan id atlanır; `no_capability_needed` → boş steps.
2. **classifyRisk:** allow-list'teki her salt-okunur giriş → `read-only`; bang/Write/Edit/Bash/Task/
   general-purpose/code-reviewer/skill/agent/mcp/command/plugin → `side-effecting`; tanınmayan
   builtin-tool/builtin-agent adı → `side-effecting` (fail-safe).
3. **cli execute:** `--approved` yok → yan-etkililer `needs-approval`, salt-okunurlar `ready`;
   `--approved` ile → ilgili id'ler `ready`; son-satır-JSON sözleşmesi geçerli; bozuk dosya → temiz hata.
4. **SMOKE.md:** salt-okunur oto-çalışma, yan-etkili onay (kabul/ret), bang/ssh onay, fail-soft —
   manuel transcript senaryoları (SP3/SP4 stili).

Test runner = Node built-in `node --test`. Hedef: tüm testler yeşil.

---

## 8. Riskler & Kararlar

- **Komut üretimi LLM'de:** `run_shell` komutunun kendisini ajan üretir (deterministik değil). Risk:
  yanlış/tehlikeli komut. Azaltım: her `run_shell` ZORUNLU onay; üretilen tam komut onayda gösterilir.
- **CLI çalıştırmıyor:** SP4'ten farklı olarak `execute` CLI fiilen iş yapmaz; sadece planlar. Fiili
  iş ajanda (gerçek araçlar + CC izin modeli). Bu bilinçli — kod, ajan adına araç çağıramaz.
- **Allow-list eskimesi:** salt-okunur liste sabit; yeni bir salt-okunur yetenek eklenirse onaya
  düşer (zararsız fail-safe). Gerektiğinde elle genişletilir.
- **Her-prompt oto:** kapsam dışı (hook kısıtı). İleride ayrı faz.

---

## 9. Tamamlanma Kriteri

- `/route "<iş>"` → konsey karar → executor plan → salt-okunurlar oto-çalışır, yan-etkililer tek
  onayla çalışır; iş fiilen tamamlanır.
- `node cli.js execute <file>` doğru plan + onay durumu üretir (son-satır JSON).
- `classifyRisk` allow-list'i doğru ayırır; bilinmeyen → side-effecting.
- Fail-soft: hata kullanıcının asıl işini bozmaz.
- Tüm testler yeşil; teknik borç yok.
