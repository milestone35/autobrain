import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { loadMap } from './map-loader.js';
import { matchPrompt, scoreCapability, tokenize } from './matcher.js';
import { normalizeDecision } from './decision.js';

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
    ...candidates.flatMap((c) => {
      const head = `  [score ${scoreCapability(promptTokens, c)}] ${c.id}  (${c.kind}·${c.trust}) — ${c.name}`;
      return c.install?.command ? [head, `      kur: ${c.install.command}`] : [head];
    })
  ];
  return { candidates, lines };
}

export async function runCandidates({ prompt, mapFile, config, now }) {
  const { map, error } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  if (error || !map) return { candidates: [], error: error || 'harita yok' };
  const promptTokens = tokenize(prompt);
  const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
  return {
    candidates: candidates.map((c) => ({
      id: c.id, kind: c.kind, name: c.name, trust: c.trust,
      install: c.install?.command ?? null, score: scoreCapability(promptTokens, c)
    }))
  };
}

export async function runDecide({ decisionFile, mapFile, config, now }) {
  const { map } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  const knownIds = map ? new Set(map.capabilities.map((c) => c.id)) : null;

  let parsed = null;
  let readError = null;
  try {
    parsed = JSON.parse(await readFile(decisionFile, 'utf8'));
  } catch (e) {
    readError = e.message;
  }

  const decision = normalizeDecision(readError ? { confidence: 0 } : parsed,
    { confidenceThreshold: config.confidenceThreshold, knownIds });
  if (readError) decision.rationale = `karar dosyası okunamadı: ${readError}`;

  const lines = [
    `[cc-autopilot] karar: ${decision.decision}  (confidence ${decision.confidence})`,
    decision.capabilities.length ? `  yetenekler: ${decision.capabilities.join(', ')}` : '  yetenekler: -',
    decision.installs.length ? `  kurulacak:  ${decision.installs.join(', ')}` : '  kurulacak:  -',
    decision.method ? `  yöntem: ${decision.method}` : '  yöntem: -',
    `  gerekçe: ${decision.rationale || '-'}`,
    '(Kurulum bu sürümde otomatik DEĞİL — kurulacak yetenek(ler) için install komutu sonraki sürümde uygulanır.)'
  ];
  return { decision, lines };
}

async function main(argv) {
  const cmd = argv[2];
  const config = await loadPluginConfig();
  const mapFile = resolveMapFile(config);
  const now = new Date().toISOString();

  if (cmd === 'preview') {
    const { lines } = await runPreview({ prompt: argv.slice(3).join(' '), mapFile, config, now });
    console.log(lines.join('\n'));
  } else if (cmd === 'candidates') {
    const res = await runCandidates({ prompt: argv.slice(3).join(' '), mapFile, config, now });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'decide') {
    const decisionFile = argv[3];
    if (!decisionFile) {
      console.error('Usage: cli.js decide <decisionFile>');
      process.exitCode = 1;
      return;
    }
    const { decision, lines } = await runDecide({ decisionFile, mapFile, config, now });
    console.log(lines.join('\n'));
    console.log(`\n${JSON.stringify(decision)}`);
  } else {
    console.error('Usage: cli.js <preview|candidates|decide> ...');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
