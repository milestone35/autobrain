import { readFile } from 'node:fs/promises';

const DAY_MS = 86400000;

function fail(error) {
  return { map: null, error, stale: false, ageDays: null };
}

export async function loadMap({ mapFile, staleDays = 14, now } = {}) {
  let raw;
  try {
    raw = await readFile(mapFile, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fail(`Harita bulunamadı (not found): ${mapFile}. Önce 'npm run scan' çalıştırın.`);
    return fail(`Harita okunamadı: ${mapFile}: ${e.message}`);
  }

  let map;
  try {
    map = JSON.parse(raw);
  } catch (e) {
    return fail(`Bozuk JSON (corrupt): ${mapFile}: ${e.message}`);
  }

  if (map?.schemaVersion !== 1) return fail(`Desteklenmeyen schemaVersion: ${map?.schemaVersion}`);

  const nowMs = Date.parse(now || new Date().toISOString());
  const genMs = Date.parse(map.generatedAt);
  const ageDays = Number.isFinite(genMs) && Number.isFinite(nowMs)
    ? Math.floor((nowMs - genMs) / DAY_MS)
    : null;
  const stale = ageDays !== null && ageDays > staleDays;

  return { map, error: null, stale, ageDays };
}
