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
