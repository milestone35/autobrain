const VIA_PRIORITY = { official: 0, known: 1, github: 2, 'mcp-registry': 3, npm: 4, pypi: 5, unknown: 9 };

function rank(via) {
  return VIA_PRIORITY[via] ?? 9;
}

function pickDescription(a, b) {
  const da = a || '';
  const db = b || '';
  if (da.length !== db.length) return da.length > db.length ? da : db;
  return da <= db ? da : db; // equal length: lexical, order-independent
}

function maxOrNull(x, y) {
  const vals = [x, y].filter((v) => typeof v === 'number');
  return vals.length ? Math.max(...vals) : null;
}

function mergeCap(a, b) {
  // primary = lower priority number (more authoritative source)
  const [primary, secondary] = rank(a.source.discoveredVia) <= rank(b.source.discoveredVia) ? [a, b] : [b, a];
  return {
    id: primary.id,
    kind: primary.kind,
    name: primary.name || secondary.name,
    description: pickDescription(a.description, b.description),
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
      unique_installs: maxOrNull(a.popularity?.unique_installs, b.popularity?.unique_installs),
      stars: maxOrNull(a.popularity?.stars, b.popularity?.stars)
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
