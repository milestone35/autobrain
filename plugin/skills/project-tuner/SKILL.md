---
name: project-tuner
description: Check the current project against the autobrain optimization checklist (CLAUDE.md, permission allowlist, hooks) and offer to fix missing items with one approval each. Invoked by the /autobrain-tune command.
allowed-tools: Bash, Read, Skill
---

# Project Tuner — optimization checklist

Check the current project for optimization gaps and, with the user's approval, fix them. All user-facing narration MUST be in **Turkish** (consistent with /route). Follow these steps exactly.

## Inputs
- `PLUGIN_ROOT`: the plugin directory (`${CLAUDE_PLUGIN_ROOT}` when run as an installed plugin; otherwise the `plugin/` dir of this repo).

## Step 1 — Gather checks (deterministic)
Run (the command defaults `--root` to the current working directory):
```bash
node "$PLUGIN_ROOT/lib/cli.js" checks
```
Parse the **last non-empty line** as JSON `{ "root", "checks": [ { "id", "title", "status", "remediation" } ] }`. If the command errors or the output is unparseable, tell the user in Turkish (`⚠️ Kontroller çalıştırılamadı.`) and STOP — fail-soft, never break anything.

## Step 2 — Report (Turkish)
Count `missing` checks. **Anlat:** `🔧 <toplam> kontrol yapıldı, <eksik> eksik.` then list each missing check's `title`. If none are missing: `✅ Proje zaten optimize — yapılacak bir şey yok.` and STOP.

## Step 3 — Remediate each missing check
For each check with `status: "missing"`, act by `remediation.kind`:
- `"advisory"` → do NOT run anything; just inform: `ℹ️ <title> eksik — update-config skill ile ekleyebilirsin.`
- `"slash"` → show what will run (`remediation.target`, e.g. `/init`) and ask for ONE approval in Turkish. If approved, invoke that command via the Skill tool (e.g. the `init` skill). If declined, skip and say so in Turkish.
- `"skill"` → show the skill (`remediation.target`, e.g. `fewer-permission-prompts`) and ask for ONE approval in Turkish. If approved, invoke it via the Skill tool. If declined, skip and say so.

**Fail-soft:** if a remediation target is unavailable or errors, do NOT abort the rest — report it in Turkish (`⚠️ <title> giderilemedi — elle çalıştırabilirsin: <target>`) and continue to the next check.

## Step 4 — Final summary (Turkish)
Emit one consolidated line:
```
Özet: <toplam> kontrol, <giderilen> giderildi, <atlanan/danışmanlık> atlandı.
```
