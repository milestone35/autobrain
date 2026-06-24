// Intentional copy of indexer/src/normalize.js's stopwords + tokenization.
// The plugin knows the indexer ONLY via the capability-map.json contract, so we
// duplicate rather than import. Keep this list in sync with the indexer if it changes.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'use', 'using', 'via', 'can', 'all', 'any', 'not', 'but'
]);

export function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].sort();
}

function countMatches(promptTokens, candidateTokens) {
  const set = new Set(candidateTokens);
  let n = 0;
  for (const t of promptTokens) if (set.has(t)) n++;
  return n;
}

export function scoreCapability(promptTokens, cap) {
  const nameHits = countMatches(promptTokens, tokenize(cap.name));
  const kwHits = countMatches(promptTokens, (cap.keywords || []).flatMap(tokenize));
  const descHits = countMatches(promptTokens, tokenize(cap.description));
  return nameHits * 3 + kwHits * 2 + descHits * 1;
}

function isBuiltin(cap) {
  return cap?.trust === 'builtin' || cap?.source?.discoveredVia === 'builtin';
}

export function rankCandidates(scored, topN) {
  return [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ab = isBuiltin(a.cap) ? 1 : 0;
      const bb = isBuiltin(b.cap) ? 1 : 0;
      if (bb !== ab) return bb - ab;                 // equal score: builtin (zero-install) first
      const ai = a.cap.popularity?.unique_installs ?? 0;
      const bi = b.cap.popularity?.unique_installs ?? 0;
      if (bi !== ai) return bi - ai;
      return a.cap.id < b.cap.id ? -1 : a.cap.id > b.cap.id ? 1 : 0;
    })
    .slice(0, topN)
    .map((s) => s.cap);
}

export function matchPrompt(prompt, map, opts = {}) {
  const topN = opts.topN ?? 5;
  const scoreFloor = opts.scoreFloor ?? 0;
  const promptTokens = tokenize(prompt);
  const scored = [];
  for (const cap of map?.capabilities || []) {
    const score = scoreCapability(promptTokens, cap);
    if (score > scoreFloor) scored.push({ cap, score });
  }
  return { candidates: rankCandidates(scored, topN), promptTokens };
}
