import { makeCapability, deriveKeywords } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'npm';

const SEARCH_URL = 'https://registry.npmjs.org/-/v1/search?text=keywords:mcp&size=50';
const PKG_CAP = 50;
// Package name is interpolated into a shell-run install command (npx -y <pkg>);
// npm already constrains names, but validate defensively (incl. @scope/name).
const SAFE_PKG = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._][A-Za-z0-9._-]*$/;

export function isLikelyMcpServer(pkg) {
  const name = String(pkg?.name || '').toLowerCase();
  const kws = (Array.isArray(pkg?.keywords) ? pkg.keywords : []).map((k) => String(k).toLowerCase());
  const hasMcpKw = kws.includes('mcp') || kws.includes('model-context-protocol');
  const serverSignal = kws.includes('server') || kws.includes('model-context-protocol') ||
    /(^|[-_/])mcp([-_/]|$)/.test(name) || /(^|[-_/])server([-_/]|$)/.test(name);
  return hasMcpKw && serverSignal;
}

export function extractRepo(pkg) {
  const raw = pkg?.links?.repository ||
    (typeof pkg?.repository === 'string' ? pkg.repository : pkg?.repository?.url) || '';
  const m = String(raw).match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return m ? normalizeRepo(`${m[1]}/${m[2]}`) : null;
}

// Derive the mcp server name registered via `claude mcp add <name>`. Fold the whole
// package id (scope included) into the name so scoped packages whose last segment is
// generic (e.g. @ai-sdk/mcp) don't register as a bare collision-prone token like "mcp".
function shortName(pkgName) {
  const cleaned = String(pkgName)
    .replace(/^@/, '')                  // drop the scope's leading @
    .replace(/[^a-zA-Z0-9]+/g, '-')     // slashes & punctuation -> -
    .replace(/^-+|-+$/g, '');
  return cleaned || 'mcp';
}

export function parseNpmSearch(json, { now, cap = PKG_CAP } = {}) {
  const objects = Array.isArray(json?.objects) ? json.objects : [];
  const caps = [];
  for (const o of objects) {
    const pkg = o?.package;
    if (!pkg?.name || !SAFE_PKG.test(pkg.name) || !isLikelyMcpServer(pkg)) continue;
    const keywords = [...new Set([
      ...(Array.isArray(pkg.keywords) ? pkg.keywords.map((k) => String(k)) : []),
      ...deriveKeywords([pkg.name, pkg.description].filter(Boolean).join(' '))
    ])];
    caps.push(makeCapability({
      kind: 'mcp', name: pkg.name, description: pkg.description || '', keywords,
      marketplace: 'npm', plugin: pkg.name,
      install: { method: 'mcp', command: `claude mcp add ${shortName(pkg.name)} -- npx -y ${pkg.name}`, package: pkg.name },
      cost: null, popularity: {},
      source: { repo: extractRepo(pkg), discoveredVia: 'npm' }, now
    }));
    if (caps.length >= cap) break;
  }
  return caps;
}

export async function collect(ctx) {
  const { fetchJson, now } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
  const json = await fetchJson(SEARCH_URL);
  if (!json) return { capabilities: [], ok: false, error: 'npm search failed' };
  return { capabilities: parseNpmSearch(json, { now }), ok: true };
}
