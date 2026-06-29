import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile as fsRead, writeFile as fsWrite } from 'node:fs/promises';

// Validate a freshly-scanned capability map and publish it to the plugin's embedded copy.
// fs is dependency-injected so this is testable without touching disk. Refuses to publish an
// invalid/empty map (throws) so a broken scan can never overwrite the good embedded map.
export async function bundleMap({ srcMap, destMap, readFile, writeFile }) {
  const raw = await readFile(srcMap, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`bundle-map: kaynak harita geçerli JSON değil: ${srcMap}`); }
  if (parsed.schemaVersion !== 1) {
    throw new Error(`bundle-map: beklenmeyen schemaVersion: ${parsed.schemaVersion}`);
  }
  if (!Array.isArray(parsed.capabilities) || parsed.capabilities.length === 0) {
    throw new Error('bundle-map: kaynak haritada yetenek yok (boş) — publish iptal');
  }
  await writeFile(destMap, raw);                 // byte-identical copy
  return { count: parsed.capabilities.length };
}

// CLI: real fs, paths resolved from this script's location
// (indexer/scripts -> indexer/data and ../../plugin/data).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'data', 'capability-map.json');
const DEST = path.join(HERE, '..', '..', 'plugin', 'data', 'capability-map.json');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bundleMap({ srcMap: SRC, destMap: DEST, readFile: fsRead, writeFile: fsWrite })
    .then(({ count }) => console.log(`bundled ${count} caps -> plugin/data/capability-map.json`))
    .catch((e) => { console.error(e.message); process.exitCode = 1; });
}
