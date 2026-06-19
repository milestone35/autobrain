import { readJson } from '../store.js';
import { makeCapability, deriveKeywords } from '../normalize.js';

export const name = 'official';

const COMPONENT_KINDS = { skills: 'skill', agents: 'agent', mcpServers: 'mcp', commands: 'command' };

export async function collect(ctx) {
  const { sourcePaths, now, log = () => {} } = ctx;
  const data = await readJson(sourcePaths.officialCatalog, null);
  if (!data) return { capabilities: [], ok: false, error: 'plugin-catalog-cache.json not found' };

  const plugins = data.catalog?.plugins || {};
  const capabilities = [];

  for (const [key, entry] of Object.entries(plugins)) {
    try {
      const marketplace = key.includes('@') ? key.split('@')[1] : 'unknown';
      const plugin = entry.plugin || key.split('@')[0];
      const me = entry.marketplace_entry || {};
      const keywords = deriveKeywords([me.name, me.description, me.category].filter(Boolean).join(' '));
      const command = `claude plugin install ${plugin}@${marketplace}`;
      const popularity = { unique_installs: entry.unique_installs ?? undefined };
      let added = 0;

      for (const [field, kind] of Object.entries(COMPONENT_KINDS)) {
        for (const item of entry.components?.[field] || []) {
          capabilities.push(makeCapability({
            kind, name: item.name, description: me.description || '', keywords,
            marketplace, plugin, component: item.name,
            install: { method: 'plugin', command, package: null },
            cost: item.chars || null, popularity,
            source: { repo: null, discoveredVia: 'official' }, now
          }));
          added++;
        }
      }

      if (added === 0) {
        capabilities.push(makeCapability({
          kind: 'plugin', name: me.name || plugin, description: me.description || '', keywords,
          marketplace, plugin,
          install: { method: 'plugin', command, package: null },
          cost: null, popularity,
          source: { repo: null, discoveredVia: 'official' }, now
        }));
      }
    } catch (e) {
      log(`official: skipping ${key}: ${e.message}`);
    }
  }

  return { capabilities, ok: true };
}
