# Yayın Paketleme: Marketplace Manifest + Gömülü Harita (SP13) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cc-autopilot'u indirilebilir bir Claude Code plugin'i yap: yetenek haritasını plugin'e göm (self-contained), repo köküne aynı-repo marketplace manifest'i ekle, repoyu publish'e hazırla.

**Architecture:** Üç task. (1) Mevcut harita snapshot'ını `plugin/data/`'ya kopyala + config mapSource'u `./data`'ya repoint (runtime JSON + config.js DEFAULTS) → plugin kendi haritasını okur. (2) Repo köküne `.claude-plugin/marketplace.json` (source `./plugin`). (3) `.gitignore` + stray temizlik + README install talimatı + commit. Kod mantığı değişmez; doğrulama = tam test suite (regresyon) + canlı gömülü-harita smoke.

**Tech Stack:** Node.js ESM (zero-dep), `node --test`, JSON manifestler, git.

> **Ortam notu:** Node sistem PATH'inde DEĞİL. Test/CLI'dan önce Git Bash'te:
> `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`

---

## File Structure

- **Create:** `plugin/data/capability-map.json` — gömülü harita snapshot (mevcut `indexer/data/capability-map.json` kopyası, 1263 cap).
- **Modify:** `plugin/config/autopilot.config.json` — `mapSource` → `./data/capability-map.json`.
- **Modify:** `plugin/lib/config.js` — `DEFAULTS.mapSource` → `./data/capability-map.json`.
- **Create:** `.claude-plugin/marketplace.json` (repo kökü) — marketplace + plugin entry (`source: ./plugin`).
- **Create:** `.gitignore` (repo kökü) — `*.stackdump`, `node_modules/`.
- **Delete:** `bash.exe.stackdump`, `indexer/bash.exe.stackdump`, `test.txt` (stray, untracked).
- **Modify/Commit:** `README.md` — install talimatı (`/plugin marketplace add ...`) + commit (şu an untracked).

Plugin/skill çalışma-zamanı mantığı (matcher/decision/installer/execution/checks) **dokunulmaz**.

---

## Task 1: Haritayı göm + config'i repoint et (self-contained)

**Files:**
- Create: `plugin/data/capability-map.json`
- Modify: `plugin/config/autopilot.config.json`
- Modify: `plugin/lib/config.js`

- [ ] **Step 1: Harita snapshot'ını plugin'e kopyala**

Run (repo kökünden):
```bash
mkdir -p plugin/data && cp indexer/data/capability-map.json plugin/data/capability-map.json
```
Doğrula (boyut + cap sayısı eşleşmeli):
```bash
du -h plugin/data/capability-map.json && grep -o '"id":' plugin/data/capability-map.json | wc -l
```
Expected: ~1.6M ve `1263`.

- [ ] **Step 2: Runtime config mapSource'unu repoint et**

`plugin/config/autopilot.config.json` içindeki satırı değiştir:
```json
  "mapSource": "../indexer/data/capability-map.json",
```
şununla:
```json
  "mapSource": "./data/capability-map.json",
```
(Dosyadaki diğer alanlar — `enabled`, `topN`, `scoreFloor`, `staleDays`, `confidenceThreshold`, `autoInstall` — aynen kalır.)

- [ ] **Step 3: config.js DEFAULTS fallback'ini repoint et**

`plugin/lib/config.js` satır 3'teki:
```javascript
  mapSource: '../indexer/data/capability-map.json',
```
şununla değiştir:
```javascript
  mapSource: './data/capability-map.json',
```
(Bu, config dosyası eksik/bozuk olsa bile gömülü haritanın bulunmasını sağlar. `config.test.js` mapSource'u sembolik olarak `DEFAULTS.mapSource`'a karşı doğruladığı için bu değişiklik regresyon-güvenlidir.)

- [ ] **Step 4: Tam test suite (regresyon)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "tests |pass |fail "
```
Expected: `tests 119`, `pass 119`, `fail 0`.

- [ ] **Step 5: Canlı gömülü-harita smoke**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node lib/cli.js candidates "audit api security" | grep -m1 mapTotal
```
Expected: `"mapTotal": 1263,` — yani CLI artık `plugin/data/`'daki gömülü haritadan okuyor (`../indexer` olmadan). Ek teyit: `grep mapSource config/autopilot.config.json` → `./data/capability-map.json`.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/data/capability-map.json plugin/config/autopilot.config.json plugin/lib/config.js
git commit -m "feat(publish): yetenek haritasını plugin'e göm + mapSource'u ./data'ya repoint (self-contained)"
```

---

## Task 2: Marketplace manifest (repo kökü, aynı repo)

**Files:**
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Marketplace dizinini ve manifest'i oluştur**

`.claude-plugin/marketplace.json` (repo kökünde) tam içerik:
```json
{
  "name": "cc-autopilot",
  "owner": { "name": "harun.hanbay" },
  "plugins": [
    {
      "name": "cc-autopilot",
      "source": "./plugin",
      "description": "Routes each prompt to the best capabilities from the cc-autopilot capability map; a multi-agent council decides, installs trusted capabilities, and executes — with Turkish progress narration. Also /autopilot-tune for project optimization checks.",
      "version": "0.1.0"
    }
  ]
}
```

- [ ] **Step 2: JSON geçerliliği + source yolu doğrula**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
node --input-type=commonjs -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('./.claude-plugin/marketplace.json','utf8')); console.log('name:',m.name,'| plugins:',m.plugins.length,'| source:',m.plugins[0].source)"
test -f plugin/.claude-plugin/plugin.json && echo "plugin manifest OK"
```
Expected: `name: cc-autopilot | plugins: 1 | source: ./plugin` ve `plugin manifest OK`. (Hata vermemeli → JSON geçerli.)

- [ ] **Step 3: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add .claude-plugin/marketplace.json
git commit -m "feat(publish): aynı-repo marketplace.json (cc-autopilot, source ./plugin)"
```

---

## Task 3: Publish hazırlığı — .gitignore + temizlik + README

**Files:**
- Create: `.gitignore`
- Delete: `bash.exe.stackdump`, `indexer/bash.exe.stackdump`, `test.txt`
- Modify/Commit: `README.md`

- [ ] **Step 1: `.gitignore` oluştur** (repo kökü) tam içerik:
```gitignore
# OS / shell artifacts
*.stackdump

# Node
node_modules/

# Scratch / temp
*.tmp
.decision.tmp.json
```

- [ ] **Step 2: Stray dosyaları sil**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
rm -f bash.exe.stackdump indexer/bash.exe.stackdump test.txt
git status --short
```
Expected: stray dosyalar listede yok; yeni `.gitignore` ve `README.md` `??` olarak görünür (henüz eklenmedi).

- [ ] **Step 3: README'ye install talimatı ekle**

`README.md`'i Read ile aç. Eğer bir kurulum (Installation) bölümü YOKSA, dosyanın uygun bir yerine (başlık/açıklamadan sonra) şu bölümü ekle. Zaten varsa, marketplace komutlarını içerecek şekilde güncelle:
```markdown
## Installation

cc-autopilot is a Claude Code plugin, distributed via this repository's marketplace.

```bash
# Add this repo as a plugin marketplace (replace <github-user> with the repo owner)
/plugin marketplace add <github-user>/cc-autopilot
# Install the plugin
/plugin install cc-autopilot@cc-autopilot
```

Once installed, each prompt receives passive capability hints. Use `/route <request>` to run
the multi-agent council + executor, and `/autopilot-tune` to check the current project for
optimization gaps (CLAUDE.md, permission allowlist, hooks).
```
NOT: `<github-user>` kasıtlı bir doldurma alanıdır — kullanıcı GitHub'a push ederken kendi repo sahibini yazacak (henüz remote yok). Bunu olduğu gibi, açıkça işaretli bırak.

- [ ] **Step 4: README + .gitignore + silmeleri commit et**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add .gitignore README.md
git add -A   # stray dosya silmelerini de evreler (zaten untracked'larsa no-op)
git status --short
git commit -m "chore(publish): .gitignore + stray temizlik + README install talimatı"
```
Expected: commit, `.gitignore` + `README.md` ekler; çalışma ağacı temiz.

- [ ] **Step 5: Tam suite son kontrol (paketleme kodu kırmamalı)**

Run:
```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "tests |pass |fail "
```
Expected: `pass 119`, `fail 0`.

---

## Push talimatı (KULLANICI yapar — plan dışı, referans)

Implementer bunu ÇALIŞTIRMAZ; yalnızca son raporda kullanıcıya hatırlatır:
```bash
# GitHub'da boş bir 'cc-autopilot' reposu açtıktan sonra:
git remote add origin https://github.com/<github-user>/cc-autopilot.git
git push -u origin master
```
Sonra kullanıcılar: `/plugin marketplace add <github-user>/cc-autopilot` → `/plugin install cc-autopilot@cc-autopilot`. İsteğe bağlı: community marketplace başvurusu `platform.claude.com/plugins/submit`.

---

## Self-Review (planlama sonrası — yazar kontrolü)

**1. Spec coverage:**
- Spec §2 (gömülü harita + config repoint + DEFAULTS repoint + regresyon-güvenliği) → Task 1 (Step 1–5). ✓
- Spec §3 (kök marketplace.json, source ./plugin, owner email yok) → Task 2. ✓
- Spec §4 (.gitignore + stray temizlik + README commit + install talimatı) → Task 3. ✓
- Spec §5 (tam suite regresyon; canlı mapTotal=1263 smoke; JSON geçerliliği) → Task 1 Step 4/5 + Task 2 Step 2. ✓
- Spec "Kapsam dışı" (push + başvuru kullanıcıda; mantık değişmez) → Push referans bölümü (çalıştırılmaz); yalnızca paketleme dosyaları değişiyor. ✓

**2. Placeholder scan:** Plan adımlarında TBD/TODO yok; her dosya için tam içerik/komut var. README'deki `<github-user>` plan eksikliği değil, kullanıcı-girişli bilinçli alan (remote yok) — açıkça işaretlendi. ✓

**3. Type/değer tutarlılığı:** `mapSource` yeni değeri `./data/capability-map.json` üç yerde (Step 1 hedefi, runtime config, config.js DEFAULTS) birebir aynı. Marketplace `name: cc-autopilot` + `source: ./plugin` plugin.json (`name: cc-autopilot`) ile tutarlı. Beklenen test sayısı 119 (SP11 sonrası) tüm regresyon adımlarında aynı. ✓
