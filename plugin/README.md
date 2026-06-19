# cc-autopilot router (plugin)

Consumes `capability-map.json` (produced by the `indexer/`) and, on every prompt,
injects a passive hint listing candidate capabilities via a fail-open
`UserPromptSubmit` hook. Includes a read-only `/route` preview command.

## Requirements
- Node.js >= 18 (no other dependencies)
- A built map at the path in `config/autopilot.config.json` (`mapSource`,
  default `../indexer/data/capability-map.json`). Build it with `cd ../indexer && npm run scan`.

## Usage
```bash
npm test                                           # run the test suite
node lib/cli.js preview "audit my api security"    # read-only matcher preview (human-readable)
node lib/cli.js candidates "audit my api security" # machine-readable candidates (council input)
node lib/cli.js decide path/to/decision.json       # validate/normalize a council decision
```
In Claude Code (plugin installed):
- `/route <request>` — run the multi-agent capability council and get a decision (decides only; installs nothing).

## How it works
- `hooks/user-prompt-submit.js` — reads the prompt from stdin, loads the map,
  runs the lexical matcher, and (if candidates) emits
  `hookSpecificOutput.additionalContext`. Always exits 0 (fail-open).
- `lib/matcher.js` — deterministic lexical scoring: name×3, keyword×2, description×1.
  Generous gate (`scoreFloor=0`); ranking + `topN` cap limit noise.
- `lib/map-loader.js` — loads the map, guards `schemaVersion`, computes staleness.
- `lib/config.js` — `config/autopilot.config.json` with per-field defaults.
- `lib/cli.js` — `runPreview` / `runCandidates` / `runDecide` + path resolution, shared by the
  hook entry and the council.
- `skills/capability-router/SKILL.md` — the council: gathers candidates, runs Planner + Critic
  subagents (≤2 rounds), synthesizes a decision, and validates it via `lib/cli.js decide`.
- `lib/decision.js` — deterministic decision validation/normalization: confidence-threshold
  fallback to `no_capability_needed`, and rejection of capability ids not present in the map.

## Config (`config/autopilot.config.json`)
- `enabled` — master switch (false = router silent)
- `mapSource` — path to capability-map.json (relative to plugin root, or absolute)
- `topN` — max candidates injected (default 5)
- `scoreFloor` — minimum score to surface (default 0 = any lexical signal)
- `staleDays` — age after which a "run scan" note is appended (default 14)
- `confidenceThreshold` — minimum council confidence; below it the decision falls back to
  `no_capability_needed` (default 0.6)

## Notes / caveats
- The hook command uses `node`; the CC runtime must be able to resolve `node` on
  its PATH. If Node is in a non-PATH location (e.g. a conda env), ensure CC's
  environment can find it.
- Council (autonomous decision) and auto-install arrive in later sub-projects;
  this version only surfaces passive hints.
