const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'use', 'using', 'via', 'can', 'all', 'any', 'not', 'but'
]);

export function makeId({ marketplace, plugin, kind, component } = {}) {
  return [marketplace, plugin, kind, component].filter(Boolean).join('::');
}

export function deriveKeywords(text, limit = 25) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].sort().slice(0, limit);
}

const KINDS = new Set(['skill', 'agent', 'mcp', 'command', 'plugin', 'bang', 'builtin-tool', 'slash', 'builtin-agent']);

export function validateCapability(input = {}) {
  const errs = [];
  if (!KINDS.has(input.kind)) errs.push(`kind must be one of ${[...KINDS].join('|')}`);
  if (!input.name || typeof input.name !== 'string') errs.push('name is required');
  if (!input.marketplace) errs.push('marketplace is required');
  if (!input.plugin) errs.push('plugin is required');
  return errs;
}

function normalizePopularity(p = {}) {
  return { unique_installs: p?.unique_installs ?? null, stars: p?.stars ?? null };
}

export function makeCapability(input) {
  const errs = validateCapability(input);
  if (errs.length) throw new Error(`Invalid capability (${input?.name || '?'}): ${errs.join('; ')}`);
  return {
    id: makeId({ marketplace: input.marketplace, plugin: input.plugin, kind: input.kind, component: input.component }),
    kind: input.kind,
    name: input.name,
    description: input.description || '',
    keywords: Array.isArray(input.keywords) ? input.keywords : [],
    source: {
      marketplace: input.marketplace,
      repo: input.source?.repo ?? null,
      discoveredVia: input.source?.discoveredVia || 'unknown'
    },
    install: input.install
      ? { method: input.install.method, command: input.install.command, package: input.install.package ?? null }
      : null,
    trust: null,
    cost: input.cost ?? null,
    popularity: normalizePopularity(input.popularity),
    lastSeen: input.now || ''
  };
}

// Build plugin capabilities from a marketplace.json manifest. Shared by the
// `known` (local) and `github` (web) sources. installCommand(pluginName) -> string.
export function capabilitiesFromManifest(manifest, { marketplace, repo = null, discoveredVia, installCommand, now }) {
  const caps = [];
  for (const p of manifest?.plugins || []) {
    if (!p || typeof p.name !== 'string' || !p.name) continue;
    caps.push(makeCapability({
      kind: 'plugin', name: p.name, description: p.description || '',
      keywords: deriveKeywords([p.name, p.description].filter(Boolean).join(' ')),
      marketplace, plugin: p.name,
      install: { method: 'plugin', command: installCommand(p.name), package: null },
      cost: null, popularity: {},
      source: { repo, discoveredVia }, now
    }));
  }
  return caps;
}
