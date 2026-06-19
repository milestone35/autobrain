import { sources } from './sources/index.js';
import { dedupeCapabilities } from './dedupe.js';
import { loadTrustedSet, applyTrust } from './trust.js';
import {
  resolvePaths, readJson, writeMap, readMap, writeScanState
} from './store.js';
import { pathToFileURL } from 'node:url';

export async function runScan(opts = {}) {
  const paths = resolvePaths(opts);
  const now = opts.now || new Date().toISOString();
  const log = opts.log || (() => {});
  const trustedSet = loadTrustedSet(await readJson(paths.trustedSources, { sources: [] }));

  const allCaps = [];
  const sourceSummary = {};
  for (const src of sources) {
    try {
      const res = await src.collect({ sourcePaths: paths.sourcePaths, prevState: {}, now, log });
      for (const c of res.capabilities) allCaps.push(c);
      sourceSummary[src.name] = { ok: res.ok !== false, count: res.capabilities.length, error: res.error || null, lastRun: now };
    } catch (e) {
      sourceSummary[src.name] = { ok: false, count: 0, error: e.message, lastRun: now };
      log(`source ${src.name} failed: ${e.message}`);
    }
  }

  const capabilities = applyTrust(dedupeCapabilities(allCaps), trustedSet);
  const map = { schemaVersion: 1, generatedAt: now, sources: sourceSummary, capabilities };
  await writeMap(paths.mapFile, map);
  await writeScanState(paths.stateFile, { sources: sourceSummary, lastRun: now });
  return map;
}

export async function runStatus(opts = {}) {
  const paths = resolvePaths(opts);
  const map = await readMap(paths.mapFile);
  const byKind = {}, byTrust = {}, bySource = {};
  for (const c of map.capabilities) {
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    byTrust[c.trust] = (byTrust[c.trust] || 0) + 1;
    bySource[c.source.discoveredVia] = (bySource[c.source.discoveredVia] || 0) + 1;
  }
  const summary = { generatedAt: map.generatedAt, total: map.capabilities.length, byKind, byTrust, bySource, sources: map.sources };
  const log = opts.log || console.log;
  log(formatStatus(summary));
  return summary;
}

function formatStatus(s) {
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ') || '-';
  return [
    `generatedAt: ${s.generatedAt}`,
    `total: ${s.total}`,
    `byKind:   ${fmt(s.byKind)}`,
    `byTrust:  ${fmt(s.byTrust)}`,
    `bySource: ${fmt(s.bySource)}`
  ].join('\n');
}

async function main(argv) {
  const cmd = argv[2];
  const flags = {};
  for (let i = 3; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const val = argv[i + 1];
    if (val === undefined) {
      console.error(`Missing value for ${key}`);
      process.exitCode = 1;
      return;
    }
    flags[key.slice(2)] = val;
  }
  if (flags.data) flags.dataDir = flags.data;
  if (cmd === 'scan') {
    const map = await runScan(flags);
    console.log(`scan complete: ${map.capabilities.length} capabilities`);
  } else if (cmd === 'status') {
    await runStatus(flags);
  } else {
    console.error('Usage: cli.js <scan|status> [--data <dir>] [--home <dir>]');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
