---
description: Route a request through the cc-autopilot capability council, then carry out the task — read-only steps run automatically, side-effecting steps (incl. shell/ssh) ask for one approval
allowed-tools: Bash, Task, Write, Read, Skill
---

# /route — capability council + executor

Use the **capability-router** skill to route the following request through the multi-agent council (Planner + Critic), reach a validated decision (use_existing / install_then_use / no_capability_needed), install any required trusted capability, and then **carry out the task** using the chosen capability.

Request: $ARGUMENTS

Follow the skill's steps exactly, including the execution step (Step 8): read-only steps run without approval; side-effecting steps (shell/ssh, file writes, agents, skills, installs) are presented for a single approval before running. If no capability is needed, just handle the request normally. Never break the underlying task — execution is fail-soft.
