import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { loadMap } from './map-loader.js';
import { matchPrompt, scoreCapability, tokenize } from './matcher.js';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(LIB_DIR, '..');

// Resolve config.mapSource (possibly relative) against the plugin root.
export function resolveMapFile(config, root = PLUGIN_ROOT) {
  return path.isAbsolute(config.mapSource) ? config.mapSource : path.resolve(root, config.mapSource);
}

export async function loadPluginConfig(root = PLUGIN_ROOT) {
  try {
    const raw = await readFile(path.join(root, 'config', 'autopilot.config.json'), 'utf8');
    return loadConfig(JSON.parse(raw));
  } catch {
    return loadConfig({}); // missing/corrupt config -> defaults
  }
}

export async function runPreview({ prompt, mapFile, config, now }) {
  const { map, error, stale, ageDays } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  if (error || !map) {
    return { candidates: [], lines: [`[cc-autopilot] harita yüklenemedi: ${error}`] };
  }
  const promptTokens = tokenize(prompt);
  const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
  const lines = [
    `[cc-autopilot] preview — ${candidates.length} aday (harita: ${map.capabilities.length}${stale ? `, ${ageDays}g eski` : ''})`,
    ...candidates.map((c) => `  [score ${scoreCapability(promptTokens, c)}] ${c.id}  (${c.kind}·${c.trust}) — ${c.name}`)
  ];
  return { candidates, lines };
}

async function main(argv) {
  const cmd = argv[2];
  if (cmd !== 'preview') {
    console.error('Usage: cli.js preview "<prompt>"');
    process.exitCode = 1;
    return;
  }
  const prompt = argv.slice(3).join(' ');
  const config = await loadPluginConfig();
  const mapFile = resolveMapFile(config);
  const { lines } = await runPreview({ prompt, mapFile, config, now: new Date().toISOString() });
  console.log(lines.join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
