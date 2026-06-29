# cc-autopilot → autobrain Rebrand (SP14) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand every live artifact from `cc-autopilot` (and bare `autopilot`) to `autobrain` — code, manifests, tests, docs, the config filename, and the tune command — keeping all 228 tests green, then push to the remote.

**Architecture:** Pure rename, no logic change. Two ordered substitutions per scoped file list (`cc-autopilot`→`autobrain` FIRST, then bare `autopilot`→`autobrain`, so `cc-autopilot-router`→`autobrain-router` never double-converts), plus two `git mv` file renames (config + tune command). Task 1 covers functional files (code/manifests/tests) and keeps the suite green + live smoke; Task 2 covers prose docs; then push. The test suite + a residual-grep gate guard correctness.

**Tech Stack:** Node.js ESM (zero-dep), `node --test`, git, sed (Git Bash).

> **Ortam notu:** Node sistem PATH'inde DEĞİL. Test/CLI'dan önce:
> `export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"`
> Yerel klasör adı `Desktop/cc-autopilot` DEĞİŞMEZ (sadece içerik rebrand). `docs/` (bu SP14 dosyaları hariç) DOKUNULMAZ.

---

## File Structure

**Task 1 — functional (code/manifest/test) + config file rename:**
- Modify: `plugin/lib/cli.js`, `plugin/lib/hook.js`, `plugin/lib/optimizations.js`
- Modify: `plugin/.claude-plugin/plugin.json`, `plugin/package.json`, `.claude-plugin/marketplace.json`
- Modify: `indexer/src/http.js`, `indexer/package.json`
- Modify (test asserts): `plugin/test/hook.test.js`, `indexer/test/http.test.js`
- Rename: `plugin/config/autopilot.config.json` → `plugin/config/autobrain.config.json`

**Task 2 — prose docs + tune command rename:**
- Modify: `README.md`, `plugin/README.md`, `indexer/README.md`, `plugin/skills/capability-router/SKILL.md`, `plugin/skills/capability-router/SMOKE.md`, `plugin/skills/project-tuner/SKILL.md`, `plugin/commands/route.md`
- Rename + modify: `plugin/commands/autopilot-tune.md` → `plugin/commands/autobrain-tune.md`

NOT touched: local folder name; `docs/superpowers/specs+plans` (dated history); `capability-router`/`project-tuner` skill names.

---

## Task 1: Functional rename (code + manifests + tests + config file)

**Files:** as listed above (Task 1 group).

- [ ] **Step 1: Rename the config file (git mv)**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git mv plugin/config/autopilot.config.json plugin/config/autobrain.config.json
```

- [ ] **Step 2: Apply ordered substitution to the functional file list**

Run (the `cc-autopilot`→`autobrain` pass first, then the bare `autopilot`→`autobrain` pass — both over the SAME explicit list; this turns `cc-autopilot-router`→`autobrain-router`, `[cc-autopilot]`→`[autobrain]`, `'cc-autopilot'`→`'autobrain'`, the cli.js `autopilot.config.json` path→`autobrain.config.json`, and the optimizations.js `/autopilot-tune`→`/autobrain-tune`):
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
FILES="plugin/lib/cli.js plugin/lib/hook.js plugin/lib/optimizations.js plugin/.claude-plugin/plugin.json plugin/package.json .claude-plugin/marketplace.json indexer/src/http.js indexer/package.json plugin/test/hook.test.js indexer/test/http.test.js"
sed -i 's/cc-autopilot/autobrain/g' $FILES
sed -i 's/autopilot/autobrain/g' $FILES
```

- [ ] **Step 3: Verify the key functional substitutions landed**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
grep -n 'autobrain.config.json' plugin/lib/cli.js
grep -c '\[autobrain\]' plugin/lib/cli.js          # expect 7
grep -n '\[autobrain\]' plugin/lib/hook.js          # expect 1
grep -n "User-Agent': 'autobrain'" indexer/src/http.js
grep -n '"name": "autobrain"' plugin/.claude-plugin/plugin.json
grep -n '"name": "autobrain-router"' plugin/package.json
grep -n '"name": "autobrain-indexer"' indexer/package.json
grep -n '/autobrain/' plugin/test/hook.test.js      # the regex assert
grep -n "'autobrain'" indexer/test/http.test.js     # the UA assert
```
Expected: every grep matches (the cli.js prefix count is 7), confirming no residual `autopilot` in these lines.

- [ ] **Step 4: Confirm NO residual `cc-autopilot` or bare `autopilot` in the functional files**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
grep -rIn 'cc-autopilot\|autopilot' plugin/lib plugin/.claude-plugin plugin/package.json .claude-plugin indexer/src indexer/package.json plugin/test indexer/test && echo "RESIDUAL FOUND (fix above)" || echo "CLEAN (0 residual)"
```
Expected: `CLEAN (0 residual)`.

- [ ] **Step 5: Full test suite (both packages)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test 2>&1 | grep -iE "tests |pass |fail "
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "tests |pass |fail "
```
Expected: indexer `pass 109 / fail 0`; plugin `pass 119 / fail 0`. (hook.test.js + http.test.js assert the new strings.)

- [ ] **Step 6: Live smoke (new config filename + log prefix)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin
node lib/cli.js candidates "audit api security" | grep -m1 mapTotal
node lib/cli.js preview "audit api security" | head -1
```
Expected: `"mapTotal": 1263,` (reads `config/autobrain.config.json`), and the preview's first line starts with `[autobrain] preview —`.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add -A
git commit -m "feat(rebrand): cc-autopilot -> autobrain (kod/manifest/test + config dosya adı)"
```

---

## Task 2: Prose docs + tune command rename

**Files:** as listed above (Task 2 group).

- [ ] **Step 1: Rename the tune command file (git mv)**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git mv plugin/commands/autopilot-tune.md plugin/commands/autobrain-tune.md
```

- [ ] **Step 2: Apply ordered substitution to the prose file list**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
DOCS="README.md plugin/README.md indexer/README.md plugin/skills/capability-router/SKILL.md plugin/skills/capability-router/SMOKE.md plugin/skills/project-tuner/SKILL.md plugin/commands/route.md plugin/commands/autobrain-tune.md"
sed -i 's/cc-autopilot/autobrain/g' $DOCS
sed -i 's/autopilot/autobrain/g' $DOCS
```
(This turns the root README title, `/cc-autopilot:route`→`/autobrain:route`, install `cc-autopilot@cc-autopilot`→`autobrain@autobrain`, the `autopilot.config.json` references→`autobrain.config.json`, and `/autopilot-tune`→`/autobrain-tune`. The marketplace-add line is already `milestone35/autobrain` and is unaffected.)

- [ ] **Step 3: Confirm repo-wide residual = 0 (live dirs + root manifests/READMEs, docs/ excluded)**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
grep -rIn 'cc-autopilot\|autopilot' plugin indexer .claude-plugin README.md && echo "RESIDUAL FOUND (fix above)" || echo "CLEAN (0 residual)"
```
Expected: `CLEAN (0 residual)`. (The `docs/` tree is intentionally NOT searched — historical records keep the old name.)

- [ ] **Step 4: Spot-check the install instructions and command file**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
grep -n 'autobrain@autobrain\|milestone35/autobrain' README.md
grep -n 'autobrain-tune\|autobrain' plugin/commands/autobrain-tune.md | head -3
ls plugin/commands/
```
Expected: README shows `/plugin marketplace add milestone35/autobrain` and `/plugin install autobrain@autobrain`; the command dir lists `autobrain-tune.md` and `route.md` (no `autopilot-tune.md`).

- [ ] **Step 5: Full suite still green (docs must not affect code)**

```bash
export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test 2>&1 | grep -iE "pass |fail "
```
Expected: `pass 119`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot
git add -A
git commit -m "feat(rebrand): cc-autopilot -> autobrain (README/skill/komut doküman + tune komut adı)"
```

---

## Push (after both tasks merge to master — controller handles)

NOT part of subagent tasks. After Task 1+2 are reviewed and merged to `master`, the controller pushes:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git push origin master
```
Then end users install via `/plugin marketplace add milestone35/autobrain` → `/plugin install autobrain@autobrain`.

---

## Self-Review (planlama sonrası — yazar kontrolü)

**1. Spec coverage:**
- Spec §2 isim eşlemesi (cc-autopilot + bare autopilot, ordered) → Task 1 Step 2 + Task 2 Step 2 (iki sed, sıralı). ✓
- Spec §3 git mv (config + komut) → Task 1 Step 1 (config) + Task 2 Step 1 (komut). ✓
- Spec §3 dosya alanları (kod/manifest/test vs prose) → Task 1 (functional list) + Task 2 (doc list); tüm 16+2 dosya kapsandı. ✓
- Spec §4 doğrulama (suite fail 0; residual grep 0; smoke mapTotal+[autobrain]; manifest) → Task 1 Step 3-6 + Task 2 Step 3-5. ✓
- Spec §4 remote push → Push bölümü (controller). ✓
- Spec "kapsam dışı" (klasör, docs/, skill adları) → sed listeleri docs/'u içermez; klasör/skill adı dokunulmaz. ✓

**2. Placeholder scan:** TBD/TODO yok; her adımda tam komut + beklenen çıktı. ✓

**3. Tutarlılık:** Yeni adlar tutarlı: plugin name `autobrain`, package `autobrain-router`/`autobrain-indexer`, config `autobrain.config.json`, komut `autobrain-tune.md`, install `autobrain@autobrain`, log `[autobrain]`, UA `autobrain`. Ordered-replace (cc-autopilot önce) `cc-autobrain` hatasını önler. Beklenen test: indexer 109 + plugin 119. ✓
