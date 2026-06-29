# Plugin Directory Başvuru Hazırlığı (SP16) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `claude plugin validate ./plugin`'i hatasız geçir (frontmatter YAML bug fix) ve başvuru-kalite metadata + LICENSE ekle — version SABİTLENMEDEN (SHA korunur).

**Architecture:** İki task. (1) `capability-router/SKILL.md` description'ını çift tırnağa al (gömülü `: ` YAML'ı bozuyordu → metadata sessizce düşüyordu; gerçek bug). (2) plugin.json'a metadata (MIT/author/homepage/repo/keywords), marketplace.json'a description, repo köküne MIT LICENSE. Gate = `claude plugin validate` (Anthropic inceleme hattının komutu) + tam test suite.

**Tech Stack:** JSON manifestler, YAML frontmatter, `claude plugin validate`, `node --test`.

> **Ortam notu:** Node PATH'te değil. Test için: `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`. `claude` CLI mevcut (validate için).

---

## File Structure

- **Modify:** `plugin/skills/capability-router/SKILL.md` — `description` çift tırnağa.
- **Modify:** `plugin/.claude-plugin/plugin.json` — author/license/homepage/repository/keywords.
- **Modify:** `.claude-plugin/marketplace.json` — üst düzey `description`.
- **Create:** `LICENSE` (repo kökü) — MIT.

Kod/mantık DEĞİŞMEZ. `version` EKLENMEZ (SHA-tabanlı sürümleme korunur).

---

## Task 1: Frontmatter YAML bug fix (capability-router)

**Files:**
- Modify: `plugin/skills/capability-router/SKILL.md`

- [ ] **Step 1: Hatanın mevcut olduğunu doğrula**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot && claude plugin validate ./plugin 2>&1 | grep -A2 "capability-router"
```
Expected: `YAML frontmatter failed to parse` hatası görünür (`Validation failed`).

- [ ] **Step 2: description'ı çift tırnağa al.** `plugin/skills/capability-router/SKILL.md` 3. satırı şudur:

```
description: Run the autobrain multi-agent capability council to decide which capabilities best serve a request. Invoked by the /route command; gathers matcher candidates, runs a Planner and a Critic subagent (<=2 rounds), and produces one validated decision object. Then installs any required trusted capability (Step 7) and carries out the task (Step 8): read-only steps auto-run, side-effecting steps need one approval.
```

Şununla değiştir (yalnızca değerin başına ve sonuna çift tırnak; metin aynen korunur — içinde çift tırnak yok, güvenli):

```
description: "Run the autobrain multi-agent capability council to decide which capabilities best serve a request. Invoked by the /route command; gathers matcher candidates, runs a Planner and a Critic subagent (<=2 rounds), and produces one validated decision object. Then installs any required trusted capability (Step 7) and carries out the task (Step 8): read-only steps auto-run, side-effecting steps need one approval."
```

- [ ] **Step 3: validate ile frontmatter hatasının gittiğini doğrula**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot && claude plugin validate ./plugin 2>&1 | tail -20
```
Expected: `capability-router` için YAML hatası YOK. Çıktı `Validation passed` veya `passed with warnings` (yalnızca version/author uyarıları kalır); `✘`/`error`/`failed` YOK.

- [ ] **Step 4: Tam test suite (regresyon)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "pass |fail "
```
Expected: `pass 119`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/skills/capability-router/SKILL.md
git commit -m "fix(submit): capability-router SKILL.md frontmatter YAML hatası (description tırnaklandı)"
```

---

## Task 2: Başvuru metadata + LICENSE

**Files:**
- Modify: `plugin/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Create: `LICENSE`

- [ ] **Step 1: `plugin.json`'a metadata ekle.** `plugin/.claude-plugin/plugin.json` tam olarak şu hale gelir (`version` EKLENMEZ):

```json
{
  "name": "autobrain",
  "description": "Routes each prompt to the best capabilities from the autobrain capability map (passive candidate hints).",
  "author": { "name": "harun.hanbay" },
  "license": "MIT",
  "homepage": "https://github.com/milestone35/autobrain",
  "repository": "https://github.com/milestone35/autobrain",
  "keywords": ["claude-code", "plugin", "capability-router", "automation", "mcp", "router"],
  "hooks": "./hooks/hooks.json"
}
```

- [ ] **Step 2: `marketplace.json`'a üst düzey `description` ekle.** `.claude-plugin/marketplace.json` tam olarak şu hale gelir:

```json
{
  "name": "autobrain",
  "owner": { "name": "harun.hanbay" },
  "description": "autobrain — routes each prompt to the best capability; a council decides, installs trusted capabilities, and executes.",
  "plugins": [
    {
      "name": "autobrain",
      "source": "./plugin",
      "description": "Routes each prompt to the best capabilities from the autobrain capability map; a multi-agent council decides, installs trusted capabilities, and executes — with Turkish progress narration. Also /autobrain-tune for project optimization checks."
    }
  ]
}
```

- [ ] **Step 3: `LICENSE` dosyasını oluştur** (repo kökü) tam içerik:

```
MIT License

Copyright (c) 2026 harun.hanbay

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: JSON geçerliliği + validate (her iki seviye)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
node --input-type=commonjs -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('./plugin/.claude-plugin/plugin.json','utf8')); const m=JSON.parse(fs.readFileSync('./.claude-plugin/marketplace.json','utf8')); console.log('license:',p.license,'author:',p.author.name,'kw:',p.keywords.length,'| mp.desc?',!!m.description,'mp.plugin.version:',m.plugins[0].version)"
claude plugin validate ./plugin 2>&1 | tail -15
claude plugin validate . 2>&1 | tail -15
```
Expected: `license: MIT author: harun.hanbay kw: 6 | mp.desc? true mp.plugin.version: undefined`. `validate ./plugin` → error YOK. `validate .` → "marketplace description" uyarısı GİTMİŞ; kalan uyarılar yalnızca version/author (kabul); hata YOK.

- [ ] **Step 5: Tam suite (her iki paket)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test 2>&1 | grep -iE "pass |fail "
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "pass |fail "
```
Expected: indexer `pass 113 / fail 0`; plugin `pass 119 / fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add plugin/.claude-plugin/plugin.json .claude-plugin/marketplace.json LICENSE
git commit -m "feat(submit): başvuru metadata (MIT/author/homepage/repo/keywords) + LICENSE + marketplace description"
```

---

## Self-Review (planlama sonrası — yazar kontrolü)

**1. Spec coverage:**
- Spec §2.A (frontmatter fix, description tırnak) → Task 1. ✓
- Spec §2.B (plugin.json author/license/homepage/repository/keywords; version yok) → Task 2 Step 1. ✓
- Spec §2.C (marketplace description; plugins[0].version yok) → Task 2 Step 2. ✓
- Spec §2.D (MIT LICENSE, Copyright 2026 harun.hanbay, email yok) → Task 2 Step 3. ✓
- Spec §3 gate (validate ./plugin error'suz; validate . marketplace-desc uyarısı gitti; suite; LICENSE) → Task 1 Step 3-4 + Task 2 Step 4-5. ✓
- Spec "kapsam dışı" (version pinleme yok; başvuru formu kullanıcı; mantık değişmez) → version hiçbir yere eklenmedi; sadece metadata/frontmatter. ✓

**2. Placeholder scan:** TBD/TODO yok; her dosya için tam içerik; her komutta beklenen çıktı. ✓

**3. Tutarlılık:** `license: "MIT"` ↔ LICENSE dosyası MIT; `author.name`/owner `harun.hanbay` her yerde aynı; homepage=repository=`https://github.com/milestone35/autobrain`; `version` hiçbir manifeste eklenmedi (SHA kararı). Beklenen test 113/119 (SP15 sonrası). ✓
