# capability-router — manual smoke scenarios

The council is LLM-driven, so it is verified by hand (not `node --test`). Run each scenario in a
Claude Code session with the plugin active, then record the result.

Prereq: a built map at `mapSource` (`cd ../indexer && npm run scan`).

## Scenario A — capability genuinely helps -> use_existing
Command: `/route audit my OpenAPI spec for security vulnerabilities`
Expect: decision `use_existing` (or `install_then_use` if not present), capabilities include a
component id under the `api-security-testing` plugin
(e.g. `claude-plugins-official::api-security-testing::skill::42crunch-audit`). Rationale references API security.

## Scenario B — trivial/irrelevant request -> no_capability_needed
Command: `/route rename this local variable from x to count`
Expect: decision `no_capability_needed`. The council declines (default behavior suffices).

## Scenario C — candidates exist but are unnecessary -> Critic rejects -> no_capability_needed
Command: `/route write a one-line shell echo`
Expect: matcher may surface candidates, but the Critic argues none is needed; low confidence ->
normalized to `no_capability_needed`.

## What to record per scenario
- The final decision JSON (printed after the `decide` step).
- Whether it matches the expectation above.
- Any case where the council invented an id (should be impossible — `decide` strips unknown ids).

## Scenario D — trusted install_then_use -> silent auto-install
Precondition: the chosen capability is NOT yet installed, `autoInstall: true` (default).
Command: `/route <request needing an uninstalled trusted plugin>`
Expect: decision `install_then_use`; the installer runs `claude plugin install ...` with no prompt;
result `installed` (or `failed` with a manual command if the environment blocks it). No approval asked.

## Scenario E — autoInstall off -> command shown, nothing installed
Precondition: set `autoInstall: false` in `config/autopilot.config.json`.
Command: `/route <request needing an uninstalled trusted plugin>`
Expect: result `skipped` with the install command printed; nothing is installed. (Restore
`autoInstall: true` afterward.)

## What to record (installs)
- The `install` results block (status per id).
- For trusted: confirm NO approval prompt appeared.
- For any `needs-approval` (only once untrusted/web-discovered capabilities exist): confirm a single
  approval was requested and nothing installed without it.

## SP6 — Execution (Step 8) smoke scenarios

These are manual transcript checks (no automated runner). The deterministic plan/risk pieces
are unit-tested in `test/execution.test.js` and `test/execute-cli.test.js`; these verify the
recipe's behavior end-to-end.

### S1 — read-only runs without approval
Request: "this repoda 'TODO' geçen yerleri bul".
Expect: council → `use_existing` with builtin `Grep` → `execute` plan shows `[ready] read-only · use_tool: builtin::core::builtin-tool::Grep` → agent runs Grep directly, no approval prompt, reports matches.

### S2 — side-effecting asks once, then runs
Request: "10.10.15.141 sunucusunda `df -h` çalıştır".
Expect: council → `use_existing` with builtin `shell` (bang) → `execute` plan shows `[needs-approval] side-effecting · run_shell: builtin::core::bang::shell` → agent shows the EXACT command (`ssh root@10.10.15.141 df -h`) and asks one approval → on yes, re-run with `--approved builtin::core::bang::shell`, run via Bash, report output; on no, skip and say so.

### S3 — mixed plan, single approval
Request that yields one read-only + one side-effecting step.
Expect: read-only step runs immediately; the side-effecting step is batched into a single approval message; declining skips only the side-effecting step while the read-only result still stands.

### S4 — fail-soft
Simulate `execute` erroring (e.g. corrupt `.decision.tmp.json`).
Expect: recipe does NOT break the task; falls back to normal behavior and says so.
