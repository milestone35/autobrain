---
description: Check the current project against the autobrain optimization checklist (CLAUDE.md, permission allowlist, hooks) and fix missing items with one approval each
allowed-tools: Bash, Read, Skill
---

# /autobrain-tune — project optimization check

Use the **project-tuner** skill to check the current project against the autobrain optimization checklist and, with a single approval per item, fix what is missing. Follow the skill's steps exactly. All user-facing narration is in Turkish. Fail-soft: never break the user's environment — the read-only check runs automatically, and each fix (which writes files) asks for one approval first. Advisory items (no canonical auto-fix) are only reported.
