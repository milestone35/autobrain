---
name: capability-router
description: Run the cc-autopilot multi-agent capability council to decide which capabilities best serve a request. Invoked by the /route command; gathers matcher candidates, runs a Planner and a Critic subagent (<=2 rounds), and produces one validated decision object. Decides only — never installs.
allowed-tools: Bash(node *), Task, Write, Read
---

# Capability Router — multi-agent decision council

You orchestrate a small council to decide, autonomously, which capabilities (if any) best serve the user's request. You DECIDE; you never install anything. Follow these steps exactly.

## Inputs
- `REQUEST`: the user's request text (the `/route` argument, or the current task).
- `PLUGIN_ROOT`: the plugin directory (`${CLAUDE_PLUGIN_ROOT}` when run as an installed plugin; otherwise the `plugin/` dir of this repo).

## Step 1 — Gather candidates (deterministic)
Run the command below, **substituting the actual REQUEST text for the placeholder** (do not pass the literal word "REQUEST"); keep the quotes:
```bash
node "$PLUGIN_ROOT/lib/cli.js" candidates "<REQUEST text here>"
```
Parse the JSON. If `candidates` is empty (or an `error` is present), STOP and report decision `no_capability_needed` (nothing to route to). Do not run the council.

## Step 2 — Planner subagent (Task tool)
Dispatch ONE subagent (general-purpose). Give it ONLY: the REQUEST and the JSON candidate list. Instruct it to return strict JSON:
`{ "capabilities": ["id"...], "method": "execution plan", "rationale": "why", "confidence": 0.0 }`
Rules for the Planner:
- Choose ONLY from the provided candidate ids. Never invent ids.
- Prefer the smallest, cheapest set that does the job; prefer already-suitable over installing more.
- `confidence` in [0,1] reflects how sure it is a listed capability genuinely helps.
- A candidate whose `trust` is `builtin` (kind `bang`/`builtin-tool`/`slash`/`builtin-agent`) is ALREADY available — it needs no install. Prefer such a candidate when it suffices, and never list it under `installs`. (E.g. for a quick search, prefer the builtin `Grep` over installing a search plugin.)

## Step 3 — Critic subagent (Task tool)
Dispatch ONE subagent (general-purpose). Give it: the REQUEST, the candidate JSON, and the Planner's proposal. Instruct it to attack the proposal and return strict JSON:
`{ "verdict": "accept" | "revise" | "reject", "objections": ["..."], "suggested": { "capabilities": [...], "installs": [...] }, "confidence": 0.0 }`
The Critic asks: is a special capability genuinely needed, or does default behavior suffice? Is there a cheaper / already-installed option? Is the trust/risk acceptable? Is the token cost justified?

## Step 4 — Converge (<=2 rounds)
- If the Critic's verdict is `accept`, proceed.
- If `revise`/`reject` AND this is round 1, re-dispatch the Planner once with the Critic's objections, then proceed with the revised proposal (optionally re-run the Critic).
- Never exceed 2 Planner rounds. When in doubt or confidence is low, prefer `no_capability_needed`.

## Step 5 — Synthesize the decision object
Build ONE object. Use the lower of Planner/Critic confidence when they disagree. If the Critic's verdict was `revise`/`reject`, fold its `suggested.capabilities`/`suggested.installs` into the set (after the round-2 Planner pass); if `accept`, keep the Planner's set. (The deterministic `decide` step re-checks every id against the map regardless.)
```json
{ "decision": "use_existing | install_then_use | no_capability_needed",
  "capabilities": ["id"...], "installs": ["id"...],
  "method": "execution plan", "rationale": "concise reasoning", "confidence": 0.0 }
```
- `use_existing`: chosen capabilities are already available; `installs` empty.
- `install_then_use`: list the ids that must be installed in `installs`.
- `no_capability_needed`: default behavior is best; empty lists.
Write this object to a scratch file using the Write tool, e.g. `PLUGIN_ROOT/.decision.tmp.json`.

## Step 6 — Validate (deterministic)
Run:
```bash
node "$PLUGIN_ROOT/lib/cli.js" decide "$PLUGIN_ROOT/.decision.tmp.json"
```
This normalizes the decision: it enforces the confidence threshold (low confidence -> `no_capability_needed`), strips ids not in the map, and clears nonsensical install lists. The **last line** of the command's output is the canonical decision JSON — parse that and treat it as the FINAL decision (it overrides your synthesis); the lines above it are just a human-readable summary.

## Step 7 — Present and (if needed) install
Report the final decision: the `decision`, chosen `capabilities`, `method`, and `rationale`.

If the decision is `install_then_use`, run the installer over the same decision file:
```bash
node "$PLUGIN_ROOT/lib/cli.js" install "$PLUGIN_ROOT/.decision.tmp.json"
```
Read its results:
- `installed` / `already-installed` / `skipped` — report them as-is.
- `needs-approval` — these are candidate/unknown (untrusted) capabilities. Ask the user ONCE
  whether to install them (show the id + install command). If they agree, re-run with the approved ids:
  ```bash
  node "$PLUGIN_ROOT/lib/cli.js" install "$PLUGIN_ROOT/.decision.tmp.json" --approved <comma,separated,ids>
  ```
  If they decline, report that those capabilities were skipped.
- `failed` — report which failed; continue without them and offer the manual install command.

Builtin capabilities (`trust: builtin`) never appear in the install plan (their `install` is null), so
the installer simply skips them — use them directly, no prompt, no install.

Trusted capabilities install silently (no prompt) when `autoInstall` is on (the default). Never
prompt for trusted installs. After installs complete, hand the task off to the chosen capability.
Finally, clean up the scratch file — but ONLY after any `--approved` re-runs are done (the re-run
reads the same `.decision.tmp.json`, so do not delete it before then).

## Failure handling
If any subagent fails or returns unparseable output, fall back to `no_capability_needed` and say so. Never break the user's underlying task — this is an advisory decision.
