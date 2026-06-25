import path from 'node:path';
import { readJson } from '../store.js';
import { capabilitiesFromManifest } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

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
      const repo = normalizeRepo(mp.source?.repo);
      const manifest = await readManifest(mp.installLocation);
      if (!manifest) {
        log(`known: no manifest for ${mpName}, skipping`);
        continue;
      }
      const caps = capabilitiesFromManifest(manifest, {
        marketplace: mpName, repo, discoveredVia: 'known',
        installCommand: (n) => `claude plugin install ${n}@${mpName}`, now
      });
      for (const c of caps) capabilities.push(c);
    } catch (e) {
      log(`known: skipping ${mpName}: ${e.message}`);
    }
  }

  return { capabilities, ok: true };
}
