import { makeCapability, deriveKeywords } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'mcp-registry';

const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers?limit=100';
const SERVER_CAP = 100;
const OFFICIAL_META = 'io.modelcontextprotocol.registry/official';
// Package identifier is interpolated into a shell-run install command; validate
// defensively (mirrors npm.js SAFE_PKG; allows @scope/name; rejects a leading dash
// so it can't be consumed as an npx/uvx flag).
const SAFE_IDENT = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._][A-Za-z0-9._-]*$/;
// Remote url: https only, no shell metacharacters / whitespace.
const SAFE_URL = /^https:\/\/[^\s`'"&|;<>$()]+$/;

// Fold the whole namespaced registry name into a collision-safe `claude mcp add` name
// (SP7 npm-fix lesson: never emit a bare generic token like "mcp").
export function serverName(regName) {
  const cleaned = String(regName).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'mcp';
}

export function extractRepo(server) {
  const url = server?.repository?.url || '';
  const m = String(url).match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return m ? normalizeRepo(`${m[1]}/${m[2]}`) : null;
}

// Pick the install target, preferring packages (npm > pypi) then remotes (http > sse).
// Returns { method:'mcp', command, package } or null if nothing safely installable.
export function installFor(server) {
  const nm = serverName(server?.name);
  const packages = Array.isArray(server?.packages) ? server.packages : [];
  const npmPkg = packages.find((p) => p?.registryType === 'npm' && SAFE_IDENT.test(String(p.identifier || '')));
  if (npmPkg) return { method: 'mcp', command: `claude mcp add ${nm} -- npx -y ${npmPkg.identifier}`, package: npmPkg.identifier };
  const pypiPkg = packages.find((p) => p?.registryType === 'pypi' && SAFE_IDENT.test(String(p.identifier || '')));
  if (pypiPkg) return { method: 'mcp', command: `claude mcp add ${nm} -- uvx ${pypiPkg.identifier}`, package: pypiPkg.identifier };
  const remotes = Array.isArray(server?.remotes) ? server.remotes : [];
  const http = remotes.find((r) => r?.type === 'streamable-http' && SAFE_URL.test(String(r.url || '')));
  if (http) return { method: 'mcp', command: `claude mcp add --transport http ${nm} ${http.url}`, package: null };
  const sse = remotes.find((r) => r?.type === 'sse' && SAFE_URL.test(String(r.url || '')));
  if (sse) return { method: 'mcp', command: `claude mcp add --transport sse ${nm} ${sse.url}`, package: null };
  return null;
}

function isLatest(entry) {
  return entry?._meta?.[OFFICIAL_META]?.isLatest === true;
}

// Dedupe to one entry per server name: prefer isLatest === true, else first seen.
function dedupeToLatest(entries) {
  const byName = new Map();
  for (const e of entries) {
    const nm = e?.server?.name;
    if (!nm) continue;
    const existing = byName.get(nm);
    if (!existing) { byName.set(nm, e); continue; }
    if (!isLatest(existing) && isLatest(e)) byName.set(nm, e);
  }
  return [...byName.values()];
}

export function parseRegistry(json, { now, cap = SERVER_CAP } = {}) {
  const entries = Array.isArray(json?.servers) ? json.servers : [];
  const caps = [];
  for (const entry of dedupeToLatest(entries)) {
    const server = entry.server;
    const install = installFor(server);
    if (!install) continue;                         // oci-only / no target / unsafe -> skip
    caps.push(makeCapability({
      kind: 'mcp', name: server.name, description: server.description || '',
      keywords: deriveKeywords([server.name, server.title, server.description].filter(Boolean).join(' ')),
      marketplace: 'mcp-registry', plugin: server.name,
      install, cost: null, popularity: {},
      source: { repo: extractRepo(server), discoveredVia: 'mcp-registry' }, now
    }));
    if (caps.length >= cap) break;
  }
  return caps;
}

export async function collect(ctx) {
  const { fetchJson, now } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };
  const json = await fetchJson(REGISTRY_URL);
  if (!json) return { capabilities: [], ok: false, error: 'mcp registry search failed' };
  return { capabilities: parseRegistry(json, { now }), ok: true };
}
