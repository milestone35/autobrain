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
  // Pass 1: merge exact-id duplicates (the same capability seen from multiple sources).
  const byId = new Map();
  for (const c of caps) {
    const existing = byId.get(c.id);
    byId.set(c.id, existing ? mergeCap(existing, c) : c);
  }
  // Pass 2: merge MCP servers that install the same package across sources — e.g. an npm
  // package found by the npm search AND listed in the MCP registry. These carry different
  // ids (marketplace + name differ), so Pass 1 cannot catch them. mergeCap keeps the
  // higher-priority source (mcp-registry rank 3 beats npm rank 4) and unions keywords.
  // Caps without an install package (remote-only servers, all non-mcp caps) pass through.
  // (Distinct-id caps that reach Pass 2 always differ in source rank under the current
  // sources, so mergeCap's primary selection is order-independent here.)
  const byPkg = new Map();
  const out = [];
  for (const c of byId.values()) {
    // Key by ecosystem + package so an npm package and a PyPI package that happen to
    // share a bare name (npm/PyPI are separate namespaces) are NOT merged. Our sources
    // encode the ecosystem in the command verb: npm -> `npx`, pypi -> `uvx`.
    const key = c.kind === 'mcp' && c.install?.package
      ? `${/\buvx\b/.test(c.install.command || '') ? 'pypi' : 'npm'}:${c.install.package}`
      : null;
    if (!key) { out.push(c); continue; }
    const existing = byPkg.get(key);
    byPkg.set(key, existing ? mergeCap(existing, c) : c);
  }
  for (const c of byPkg.values()) out.push(c);
  return out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
