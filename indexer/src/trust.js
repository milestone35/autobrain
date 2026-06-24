export function normalizeRepo(repo) {
  if (!repo) return null;
  const lower = String(repo).toLowerCase().trim();
  return lower.includes(':') ? lower : `github:${lower}`;
}

export function loadTrustedSet(trustedSourcesJson) {
  const list = Array.isArray(trustedSourcesJson?.sources) ? trustedSourcesJson.sources : [];
  return new Set(list.map(normalizeRepo).filter(Boolean));
}

export function classifyTrust(cap, trustedSet) {
  if (cap.source?.discoveredVia === 'builtin') return 'builtin';
  if (cap.source?.discoveredVia === 'official') return 'trusted';
  const repo = normalizeRepo(cap.source?.repo);
  if (repo && trustedSet.has(repo)) return 'trusted';
  if (repo || cap.install?.command) return 'candidate';
  return 'unknown';
}

export function applyTrust(caps, trustedSet) {
  return caps.map((c) => ({ ...c, trust: classifyTrust(c, trustedSet) }));
}
