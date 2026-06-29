# autobrain indexer

Scans local Claude plugin sources and builds `data/capability-map.json` — the
capability map consumed by the autobrain router plugin.

## Requirements

- Node.js >= 18 (no other dependencies)

## Usage

```bash
npm test          # run the test suite (or: node --test)
npm run scan      # scan local sources -> data/capability-map.json + data/scan-state.json
npm run status    # print a summary of the current map
```

If `npm` is not on your PATH, call Node directly:

```bash
node --test
node src/cli.js scan
node src/cli.js status
```

CLI flags (optional): `--data <dir>` (output dir), `--home <dir>` (Claude home),
`--officialCatalog <file>`, `--knownMarketplaces <file>`, `--trustedSources <file>`.

## Sources (this version)

- `official` — reads `~/.claude/plugins/plugin-catalog-cache.json` (official marketplace; always trusted)
- `known`    — reads `~/.claude/plugins/known_marketplaces.json` + each marketplace manifest

Web-discovery sources (GitHub / MCP registry / npm / PyPI) and `publish` (Faz 2)
arrive in later plans, plugging into the same source contract
(`export const name`; `export async function collect(ctx)`).

## Trust

`config/trusted-sources.json` lists repos that are auto-trusted (in addition to the
official marketplace). Everything else discovered is `candidate` or `unknown`.

## Output

`data/capability-map.json` (gitignored) — `{ schemaVersion, generatedAt, sources, capabilities[] }`.
Each capability: `{ id, kind, name, description, keywords[], source, install, trust, cost, popularity, lastSeen }`.
