const VIA_PRIORITY = { official: 0, known: 1, github: 2, 'mcp-registry': 3, npm: 4, pypi: 5, unknown: 9 };

function rank(via) {
  return VIA_PRIORITY[via] ?? 9;
}

function mergeCap(a, b) {
  // primary = lower priority number (more authoritative source)
  const [primary, secondary] = rank(a.source.discoveredVia) <= rank(b.source.discoveredVia) ? [a, b] : [b, a];
  return {
    id: primary.id,
    kind: primary.kind,
    name: primary.name || secondary.name,
    description: (a.description || '').length >= (b.description || '').length ? a.description : b.description,
    keywords: [...new Set([...(a.keywords || []), ...(b.keywords || [])])].sort(),
    source: {
      marketplace: primary.source.marketplace,
      repo: primary.source.repo ?? secondary.source.repo ?? null,
      discoveredVia: primary.source.discoveredVia
    },
    install: primary.install || secondary.install || null,
    trust: null,
    cost: primary.cost ?? secondary.cost ?? null,
    popularity: {
      unique_installs: Math.max(a.popularity?.unique_installs ?? 0, b.popularity?.unique_installs ?? 0) || undefined,
      stars: Math.max(a.popularity?.stars ?? 0, b.popularity?.stars ?? 0) || undefined
    },
    lastSeen: (a.lastSeen || '') >= (b.lastSeen || '') ? a.lastSeen : b.lastSeen
  };
}

export function dedupeCapabilities(caps) {
  const byId = new Map();
  for (const c of caps) {
    const existing = byId.get(c.id);
    byId.set(c.id, existing ? mergeCap(existing, c) : c);
  }
  return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
