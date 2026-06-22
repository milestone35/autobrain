import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { loadMap } from './map-loader.js';
import { matchPrompt, scoreCapability, tokenize } from './matcher.js';
import { normalizeDecision } from './decision.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { planInstalls, executeInstalls } from './installer.js';

const pexec = promisify(exec);

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
    '(install_then_use ise kurulum, güven sınırına göre yapılır: trusted sessiz, untrusted tek onayla.)'
  ];
  return { decision, lines };
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Does `claude plugin list` output reference this capability's plugin?
// id format: marketplace::plugin::kind::component. We match the unique
// "plugin@marketplace" install ref, OR the plugin name on word boundaries —
// robust to either list format and immune to substring collisions
// (e.g. plugin "ai" must NOT match "aikido").
export function pluginListed(listText, id) {
  const [marketplace, plugin] = String(id).split('::');
  if (!plugin) return false;
  const text = String(listText);
  if (marketplace && text.includes(`${plugin}@${marketplace}`)) return true;
  return new RegExp(`(^|[^\\w-])${escapeRegex(plugin)}([^\\w-]|$)`).test(text);
}

async function probePluginList() {
  try {
    const { stdout } = await pexec('claude plugin list');
    return { ok: true, text: stdout };
  } catch {
    return { ok: false, text: '' };
  }
}

// Real injected deps for actual installs. isInstalled is false when the probe is
// unavailable (so we attempt); verify trusts the exit code when the probe is
// unavailable (so a successful install is not falsely reported as failed).
export function realEnv(approvedIds, log) {
  return {
    run: async (command) => { await pexec(command); },
    isInstalled: async (item) => {
      const p = await probePluginList();
      return p.ok && pluginListed(p.text, item.id);
    },
    verify: async (item) => {
      const p = await probePluginList();
      if (!p.ok) { log('uyarı: kurulum doğrulanamadı (claude plugin list yok) — exit-code güveniliyor'); return true; }
      return pluginListed(p.text, item.id);
    },
    approve: async (item) => approvedIds.has(item.id),
    log
  };
}

function formatInstallResult(r) {
  const tail = r.error ? ` — ${r.error}` : r.command ? ` — ${r.command}` : '';
  return `  ${r.status}: ${r.id}${tail}`;
}

export async function runInstall({ decisionFile, mapFile, config, approvedIds = new Set(), now, env }) {
  const { map } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  let raw = null;
  try { raw = JSON.parse(await readFile(decisionFile, 'utf8')); } catch { raw = null; }
  if (!raw || !map) {
    return { results: [], lines: ['[cc-autopilot] kurulum: karar/harita okunamadı, hiçbir şey kurulmadı'] };
  }
  // Re-apply the same gate as `decide` so installing from a raw scratch file cannot
  // bypass the confidence threshold / id-filtering (low confidence -> no installs).
  const knownIds = new Set(map.capabilities.map((c) => c.id));
  const decision = normalizeDecision(raw, { confidenceThreshold: config.confidenceThreshold, knownIds });
  const plan = planInstalls(decision, map, { autoInstall: config.autoInstall });
  const deps = env || realEnv(approvedIds, (m) => console.error(m));
  const results = await executeInstalls(plan, deps);
  const lines = ['[cc-autopilot] kurulum sonuçları:', ...results.map(formatInstallResult)];
  if (results.some((r) => r.status === 'needs-approval')) {
    lines.push("(Onay bekleyenler için: tekrar '--approved <id>' ile çağırın.)");
  }
  if (results.some((r) => r.status === 'failed')) {
    lines.push('(Başarısızlar atlandı — o yetenek olmadan devam edebilir veya komutu elle çalıştırabilirsiniz.)');
  }
  return { results, lines };
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
  } else if (cmd === 'install') {
    const decisionFile = argv[3];
    if (!decisionFile || decisionFile.startsWith('--')) {
      console.error('Usage: cli.js install <decisionFile> [--approved id1,id2]');
      process.exitCode = 1;
      return;
    }
    const ai = argv.indexOf('--approved');
    const approvedIds = ai !== -1 && argv[ai + 1] ? new Set(argv[ai + 1].split(',')) : new Set();
    const { lines } = await runInstall({ decisionFile, mapFile, config, approvedIds, now });
    console.log(lines.join('\n'));
  } else {
    console.error('Usage: cli.js <preview|candidates|decide|install> ...');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
