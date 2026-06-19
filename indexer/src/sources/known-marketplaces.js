import path from 'node:path';
import { readJson } from '../store.js';
import { makeCapability, deriveKeywords } from '../normalize.js';

export const name = 'known';

async function readManifest(installLocation) {
  if (!installLocation) return null;
  const candidates = [
    path.join(installLocation, '.claude-plugin', 'marketplace.json'),
    path.join(installLocation, 'marketplace.json')
  ];
  for (const file of candidates) {
    const m = await readJson(file, null);
    if (m) return m;
  }
  return null;
}

export async function collect(ctx) {
  const { sourcePaths, now, log = () => {} } = ctx;
  const known = await readJson(sourcePaths.knownMarketplaces, null);
  if (!known) return { capabilities: [], ok: false, error: 'known_marketplaces.json not found' };

  const capabilities = [];
  for (const [mpName, mp] of Object.entries(known)) {
    try {
      const repo = mp.source?.repo ? `github:${mp.source.repo}` : null;
      const manifest = await readManifest(mp.installLocation);
      if (!manifest) {
        log(`known: no manifest for ${mpName}, skipping`);
        continue;
      }
      for (const p of manifest.plugins || []) {
        capabilities.push(makeCapability({
          kind: 'plugin', name: p.name, description: p.description || '',
          keywords: deriveKeywords([p.name, p.description].filter(Boolean).join(' ')),
          marketplace: mpName, plugin: p.name,
          install: { method: 'plugin', command: `claude plugin install ${p.name}@${mpName}`, package: null },
          cost: null, popularity: {},
          source: { repo, discoveredVia: 'known' }, now
        }));
      }
    } catch (e) {
      log(`known: skipping ${mpName}: ${e.message}`);
    }
  }

  return { capabilities, ok: true };
}
