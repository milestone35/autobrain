---
name: capability-router
description: "Run the autobrain multi-agent capability council to decide which capabilities best serve a request. Invoked by the /route command; gathers matcher candidates, runs a Planner and a Critic subagent (<=2 rounds), and produces one validated decision object. Then installs any required trusted capability (Step 7) and carries out the task (Step 8): read-only steps auto-run, side-effecting steps need one approval."
allowed-tools: Bash, Task, Write, Read, Skill
---

# Capability Router — multi-agent decision council

You orchestrate a small council to decide, autonomously, which capabilities (if any) best serve the user's request. The council DECIDES; then (Step 7) any required trusted capability is installed and (Step 8) the task is carried out — read-only steps automatically, side-effecting steps after a single approval. Follow these steps exactly.

## Inputs
- `REQUEST`: the user's request text (the `/route` argument, or the current task).
- `PLUGIN_ROOT`: the plugin directory (`${CLAUDE_PLUGIN_ROOT}` when run as an installed plugin; otherwise the `plugin/` dir of this repo).

## Progress narration (Turkish — REQUIRED)
All user-facing progress and summaries MUST be written in **Turkish**. At the start emit ONE intro line stating the skill is active plus the total map size and installed count; at each main step below emit ONE short Turkish progress line; at the very end emit one consolidated summary block. Do NOT dump raw CLI output — summarize it in your own words. (The CLI's own output lines are already Turkish; this rule pins YOUR narration to Turkish too.) Narration templates (wording need not be verbatim) are given inline at each step under "Anlat:".

## Step 1 — Gather candidates (deterministic)
Run the command below, **substituting the actual REQUEST text for the placeholder** (do not pass the literal word "REQUEST"); keep the quotes:
```bash
node "$PLUGIN_ROOT/lib/cli.js" candidates "<REQUEST text here>"
```
Parse the JSON. If `candidates` is empty (or an `error` is present), STOP and report decision `no_capability_needed` (nothing to route to). Do not run the council.

Parse `mapTotal` (the full capability-map size) and `candidates.length` from the JSON. Then run the installed-inventory command once and parse its JSON `{ "plugins", "mcp", "total" }`:
```bash
node "$PLUGIN_ROOT/lib/cli.js" installed
```
**Anlat (intro — skill devrede):** `🟢 autobrain devrede — toplam harita: <mapTotal> yetenek, kurulu: <installed.total>.`
**Anlat (adaylar):** `🔎 <candidates.length> aday buldum.`
If `candidates` is empty: `🔎 Bu istek için uygun aday yok — varsayılan davranışla devam ediyorum.`
Remember `mapTotal`, `installed.total` and the candidate count — the final summary (Step 8) reuses them.

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
This normalizes the decision: it enforces the confidence threshold (low confidence -> `no_capability_needed`), strips ids not in the map, and clears nonsensical install lists. The **last non-empty line** of the command's output is the canonical decision JSON — parse that and treat it as the FINAL decision (it overrides your synthesis); the lines above it are just a human-readable summary.

**Anlat:** `🧠 Konsey kararı: <decision> — yetenek(ler): <id'ler> (gerekçe: <kısa>).`
For `no_capability_needed`: `🧠 Özel yetenek gerekmiyor — varsayılan davranışla devam ediyorum.`

## Step 7 — Present and (if needed) install
Report the final decision in Turkish: the `decision`, chosen `capabilities`, `method`, and `rationale`.

**Anlat (kurulumdan sonra):** `📦 <kurulan sayısı> kuruldu, <atlanan/zaten var sayısı> atlandı.`
If any are `needs-approval`: `⏳ <sayı> yetenek onay bekliyor.` and ask the approval question in Turkish.
If any `failed`: `⚠️ <sayı> yetenek kurulamadı — o yetenek olmadan devam ediyorum.`

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
Do NOT clean up the scratch file yet — Step 8 (Execute) reads the same `.decision.tmp.json`.

## Step 8 — Execute (carry out the task)
Turn the decision into action. Run:
```bash
node "$PLUGIN_ROOT/lib/cli.js" execute "$PLUGIN_ROOT/.decision.tmp.json"
```
Parse the **last non-empty line** (canonical JSON `{ "decision": ..., "steps": [...] }`); the lines above are a human-readable summary. Each step is `{ id, name, kind, action, risk, directive, status }`.

- If `decision` is `no_capability_needed` or `steps` is empty → do nothing here; accomplish the user's request with your normal behavior.
- **Ready steps** (`status: "ready"` — read-only) → carry them out NOW using the real tool the `action`/`directive` names: `use_tool`→use Grep/Read/etc.; `dispatch_agent`→Explore/Plan via the Task tool; `invoke_slash`→the analysis command. No approval needed.
- **Approval-pending steps** (`status: "needs-approval"` — side-effecting) → present ALL of them in ONE message. For each, show `id`, `action`, and for `run_shell` the EXACT shell command you will run (composed from the user's request). Ask for a single approval.
  - If approved: run the confirmation command below (it should now report every approved step as `status: "ready"`) — the CLI itself executes nothing, so then carry out each step yourself with the real tool (`run_shell`→Bash; `use_tool`→Write/Edit/Bash; `dispatch_agent`→Task; `invoke_skill`→Skill; `call_mcp`→the MCP tool):
    ```bash
    node "$PLUGIN_ROOT/lib/cli.js" execute "$PLUGIN_ROOT/.decision.tmp.json" --approved <comma,separated,ids>
    ```
  - If declined: skip those steps and say so.
- **Anlat (yürütmeye başlarken):** `▶️ Bunları kullanarak başlıyorum: <yöntem>.` For side-effecting steps, ask the approval question in Turkish (show the exact command).
- Report what was executed, what was skipped, and any errors — in Turkish.
- **Final toplu özet** (akışın en sonunda, tek blok; Step 1'deki sayıları, `mapTotal` ve `installed.total`'ı kullan):
  ```
  Özet: <aday sayısı> aday bulundu, <kurulan sayısı> kuruldu, toplam harita <mapTotal> yetenek, kurulu <installed.total>.
  <ne ile başlandığı / sonuç>.
  ```

**Fail-soft:** if `execute` errors or the plan is unusable, do NOT break the user's task — fall back to your normal behavior and say so. A single step's failure does not abort the rest; continue and summarize at the end.

Finally, clean up the scratch file (`PLUGIN_ROOT/.decision.tmp.json`) — but ONLY after BOTH the Step 7 install flow AND this Step 8 execute (including any Step 8 `--approved` re-run) are fully done.

## Failure handling
If any subagent fails or returns unparseable output, fall back to `no_capability_needed` and say so. Never break the user's underlying task — this is an advisory decision.
