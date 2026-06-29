import { loadMap } from './map-loader.js';
import { matchPrompt } from './matcher.js';

function formatCandidate(cap) {
  const head = `- ${cap.name}  (${cap.kind}·${cap.trust ?? 'unknown'}) — ${cap.description || ''}`.trimEnd();
  const install = cap.install?.command ? `\n    kur: ${cap.install.command}` : '';
  return head + install;
}

export function formatContext(candidates, map, stale, ageDays) {
  const total = map.capabilities?.length ?? 0;
  const staleNote = stale ? `  (harita ${ageDays} gün eski — 'npm run scan' önerilir)` : '';
  const lines = [
    `[autobrain] Bu istek için işe yarayabilecek yetenekler (harita: ${total} yetenek):${staleNote}`,
    ...candidates.map(formatCandidate),
    '(Alakasızsa yok say. Karar/kurulum sonraki sürümde otomatikleşecek.)'
  ];
  return lines.join('\n');
}

export async function handleHook({ stdinText, config, mapFile, now }) {
  try {
    if (!config?.enabled) return null;

    let prompt;
    try {
      prompt = JSON.parse(stdinText)?.prompt;
    } catch {
      return null; // bad stdin -> fail-open
    }
    if (!prompt || typeof prompt !== 'string') return null;

    const { map, error, stale, ageDays } = await loadMap({ mapFile, staleDays: config.staleDays, now });
    if (error || !map) return null; // fail-open: no map, no injection

    const { candidates } = matchPrompt(prompt, map, { topN: config.topN, scoreFloor: config.scoreFloor });
    if (!candidates.length) return null;

    return { additionalContext: formatContext(candidates, map, stale, ageDays) };
  } catch {
    return null; // any unexpected error -> fail-open
  }
}
