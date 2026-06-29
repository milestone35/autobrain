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
import { planExecution } from './execution.js';

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
  if (error || !map) return { candidates: [], mapTotal: 0, error: error || 'harita yok' };
  const promptTokens = tokenize(prompt);
  const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
  return {
    mapTotal: map.capabilities.length,
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

export function verifyCmdFor(method) {
  if (method === 'plugin') return 'claude plugin list';
  if (method === 'mcp') return 'claude mcp list';
  return null;                                   // unknown -> trust exit code
}

// Extract the server name from a `claude mcp add` command. The name follows any
// options: `claude mcp add [--transport http] <name> <cmdOrUrl> [-- ...]`. Skip each
// `--flag` (and the value of `--transport`) and return the first plain token.
// ASSUMPTION: `--transport` is the only value-taking flag our sources emit (see the
// `claude mcp add` commands built in indexer mcp-registry.js installFor / npm.js). If a
// source starts emitting another valued flag (e.g. --scope/--header/--env), teach this
// skip about it too, otherwise that flag's value would be mistaken for the name. The
// function fails closed (returns '') on malformed input, so a miss only causes a
// re-install attempt, never a false "already-installed".
export function mcpAddName(command) {
  const after = String(command).split(/mcp add\s+/)[1];
  if (!after) return '';
  const toks = after.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '--') break;                       // '--' starts the run command; name must precede it
    if (t.startsWith('-')) {
      if (t === '--transport') i++;              // skip the flag's value (http/sse)
      continue;
    }
    return t;                                     // first plain token = server name
  }
  return '';
}

// The mcp server is registered under the name in `claude mcp add <name> ...`,
// so verify by matching that name (not the package) in `claude mcp list`.
export function mcpListed(listText, item) {
  const text = String(listText);
  if (/no\s+mcp\s+servers/i.test(text)) return false;   // empty-state help text, nothing configured
  const nameTok = mcpAddName(item?.command || '');
  if (!nameTok) return false;
  return new RegExp(`(^|[^\\w-])${escapeRegex(nameTok)}([^\\w-]|$)`).test(text);
}

export function listed(method, listText, item) {
  return method === 'mcp' ? mcpListed(listText, item) : pluginListed(listText, item.id);
}

async function probeList(cmd) {
  try {
    const { stdout } = await pexec(cmd);
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
      const cmd = verifyCmdFor(item.method);
      if (!cmd) return false;                       // unknown method -> attempt install
      const p = await probeList(cmd);
      return p.ok && listed(item.method, p.text, item);
    },
    verify: async (item) => {
      const cmd = verifyCmdFor(item.method);
      if (!cmd) { log('uyarı: bilinmeyen kurulum yöntemi — exit-code güveniliyor'); return true; }
      const p = await probeList(cmd);
      if (!p.ok) { log('uyarı: kurulum doğrulanamadı (list komutu yok) — exit-code güveniliyor'); return true; }
      return listed(item.method, p.text, item);
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

function parseApprovedIds(argv) {
  const ai = argv.indexOf('--approved');
  return ai !== -1 && argv[ai + 1] ? new Set(argv[ai + 1].split(',')) : new Set();
}

function formatExecStep(s) {
  return `  [${s.status}] ${s.risk} · ${s.action}: ${s.id}`;
}

export async function runExecute({ decisionFile, mapFile, config, approvedIds = new Set(), now }) {
  const { map } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  let raw = null;
  try { raw = JSON.parse(await readFile(decisionFile, 'utf8')); } catch { raw = null; }
  if (!raw || !map) {
    return { steps: [], decision: 'no_capability_needed', lines: ['[cc-autopilot] yürütme: karar/harita okunamadı, plan yok'] };
  }
  // Re-apply the same gate as `decide`/`install` (low confidence / unknown ids -> nothing to run).
  const knownIds = new Set(map.capabilities.map((c) => c.id));
  const decision = normalizeDecision(raw, { confidenceThreshold: config.confidenceThreshold, knownIds });
  const steps = planExecution(decision, map).map((s) => ({
    ...s,
    status: s.risk === 'read-only' || approvedIds.has(s.id) ? 'ready' : 'needs-approval'
  }));
  const lines = ['[cc-autopilot] yürütme planı:', ...steps.map(formatExecStep)];
  if (!steps.length) lines.push('  (yürütülecek adım yok)');
  if (steps.some((s) => s.status === 'needs-approval')) {
    lines.push("(Yan-etkili adımlar onay bekliyor — '--approved <id>' ile teyit edin.)");
  }
  return { steps, decision: decision.decision, lines };
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
    const approvedIds = parseApprovedIds(argv);
    const { lines } = await runInstall({ decisionFile, mapFile, config, approvedIds, now });
    console.log(lines.join('\n'));
  } else if (cmd === 'execute') {
    const decisionFile = argv[3];
    if (!decisionFile || decisionFile.startsWith('--')) {
      console.error('Usage: cli.js execute <decisionFile> [--approved id1,id2]');
      process.exitCode = 1;
      return;
    }
    const approvedIds = parseApprovedIds(argv);
    const { steps, decision, lines } = await runExecute({ decisionFile, mapFile, config, approvedIds, now });
    console.log(lines.join('\n'));
    console.log(`\n${JSON.stringify({ decision, steps })}`);
  } else {
    console.error('Usage: cli.js <preview|candidates|decide|install|execute> ...');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  });
}
