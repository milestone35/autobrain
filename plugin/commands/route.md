---
description: Route a request through the cc-autopilot capability council and report a decision (read-only; installs nothing)
allowed-tools: Bash(node *), Task, Write, Read
---

# /route — capability council

Use the **capability-router** skill to route the following request through the multi-agent council (Planner + Critic) and report a single decision (use_existing / install_then_use / no_capability_needed). The council decides only — it installs nothing.

Request: $ARGUMENTS

After the skill produces its final (validated) decision, present it to me: the decision, the chosen capabilities, the method, and the rationale. If the decision is `install_then_use`, show the install command(s) as text without running them.
