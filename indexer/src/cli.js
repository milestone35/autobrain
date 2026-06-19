import { sources } from './sources/index.js';
import { dedupeCapabilities } from './dedupe.js';
import { loadTrustedSet, applyTrust } from './trust.js';
import {
  resolvePaths, readJson, writeMap, readScanState, writeScanState
} from './store.js';

export async function runScan(opts = {}) {
  const paths = resolvePaths(opts);
  const now = opts.now || new Date().toISOString();
  const log = opts.log || (() => {});
  const trustedSet = loadTrustedSet(await readJson(paths.trustedSources, { sources: [] }));
  await readScanState(paths.stateFile); // surfaces corrupt-state recovery; result unused this plan

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
