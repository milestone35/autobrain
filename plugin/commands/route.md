---
description: Preview cc-autopilot router candidates for a prompt (read-only; installs nothing)
allowed-tools: Bash(node *)
---

# /route — capability preview

Read-only preview of which capabilities the cc-autopilot router would surface for the given prompt. Nothing is installed or decided.

!`node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js" preview "$ARGUMENTS"`

The candidates above are ranked by lexical relevance (read-only). In a later version the router will decide and install autonomously.
