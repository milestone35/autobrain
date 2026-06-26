import { readJson } from '../store.js';
import { makeCapability, deriveKeywords } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'pypi';

const PKG_URL = (n) => `https://pypi.org/pypi/${encodeURIComponent(n)}/json`;
const SEED_CAP = 200;
// Package name is interpolated into a shell-run install command; validate defensively
// (same as npm SAFE_PKG / mcp-registry SAFE_IDENT; rejects a leading dash so it can't be
// consumed as a uvx flag). The @scope/ branch is unused for PyPI but harmless.
const SAFE_IDENT = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._][A-Za-z0-9._-]*$/;

// Fold the package name into a collision-safe `claude mcp add` server name (same fold as
// the mcp-registry source). The real package name is still used verbatim for `uvx`.
export function serverName(pkgName) {
  const cleaned = String(pkgName).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'mcp';
}

export function parsePypiSeeds(json) {
  const list = Array.isArray(json?.packages) ? json.packages : [];
  const out = [];
  for (const p of list) {
    if (typeof p === 'string' && SAFE_IDENT.test(p)) out.push(p);
    if (out.length >= SEED_CAP) break;
  }
  return out;
}

export function extractRepo(info) {
  const urls = info?.project_urls && typeof info.project_urls === 'object' ? Object.values(info.project_urls) : [];
  const candidates = [...urls, info?.home_page];
  for (const u of candidates) {
    const m = String(u || '').match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
    if (m) return normalizeRepo(`${m[1]}/${m[2]}`);
  }
  return null;
}

export function pypiKeywords(info) {
  const raw = typeof info?.keywords === 'string'
    ? info.keywords.split(/[,\s]+/)
    : (Array.isArray(info?.keywords) ? info.keywords : []);
  const fromKw = raw.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  const derived = deriveKeywords([info?.name, info?.summary].filter(Boolean).join(' '));
  return [...new Set([...fromKw, ...derived])];
}

export function buildCap(pkgJson, { now }) {
  const info = pkgJson?.info;
  const pkgName = info?.name;
  if (typeof pkgName !== 'string' || !SAFE_IDENT.test(pkgName)) return null;
  return makeCapability({
    kind: 'mcp', name: pkgName, description: info.summary || '',
    keywords: pypiKeywords(info),
    marketplace: 'pypi', plugin: pkgName,
    install: { method: 'mcp', command: `claude mcp add ${serverName(pkgName)} -- uvx ${pkgName}`, package: pkgName },
    cost: null, popularity: {},
    source: { repo: extractRepo(info), discoveredVia: 'pypi' }, now
  });
}

export async function collect(ctx) {
  const { sourcePaths, fetchJson, now, log = () => {} } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
  const seeds = await readJson(sourcePaths?.pypiSeeds, null);
  if (!seeds) return { capabilities: [], ok: false, error: 'pypi-seeds.json not found' };
  const names = parsePypiSeeds(seeds);
  const capabilities = [];
  for (const n of names) {
    try {
      const pkg = await fetchJson(PKG_URL(n));
      if (!pkg) { log(`pypi: no metadata for ${n}`); continue; }
      const cap = buildCap(pkg, { now });
      if (cap) capabilities.push(cap);
    } catch (e) {
      log(`pypi: skipping ${n}: ${e.message}`);
    }
  }
  return { capabilities, ok: true };
}
