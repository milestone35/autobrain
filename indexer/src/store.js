import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

export async function atomicWriteJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

export async function readJson(file, fallback) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Bozuk JSON: ${file}: ${e.message}`);
  }
}

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEXER_ROOT = path.join(SRC_DIR, '..');

export function resolvePaths(opts = {}) {
  const home = opts.home || os.homedir();
  const dataDir = opts.dataDir || path.join(INDEXER_ROOT, 'data');
  const pluginsDir = path.join(home, '.claude', 'plugins');
  return {
    home,
    dataDir,
    mapFile: path.join(dataDir, 'capability-map.json'),
    stateFile: path.join(dataDir, 'scan-state.json'),
    trustedSources: opts.trustedSources || path.join(INDEXER_ROOT, 'config', 'trusted-sources.json'),
    sourcePaths: {
      officialCatalog: opts.officialCatalog || path.join(pluginsDir, 'plugin-catalog-cache.json'),
      knownMarketplaces: opts.knownMarketplaces || path.join(pluginsDir, 'known_marketplaces.json')
    }
  };
}

export async function writeMap(mapFile, map) {
  await atomicWriteJson(mapFile, map);
}

export async function readMap(mapFile) {
  const m = await readJson(mapFile, null);
  if (!m) throw new Error(`Harita yok: ${mapFile}. Önce 'scan' çalıştırın.`);
  if (m.schemaVersion !== 1) throw new Error(`Desteklenmeyen schemaVersion: ${m.schemaVersion}`);
  return m;
}

export async function readScanState(stateFile) {
  try {
    const s = await readJson(stateFile, null);
    return s && typeof s === 'object' ? { sources: s.sources || {}, lastRun: s.lastRun ?? null } : { sources: {}, lastRun: null };
  } catch {
    return { sources: {}, lastRun: null };
  }
}

export async function writeScanState(stateFile, state) {
  await atomicWriteJson(stateFile, state);
}
