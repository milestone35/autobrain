import { capabilitiesFromManifest } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'github';

const CODE_SEARCH_URL =
  'https://api.github.com/search/code?q=filename:marketplace.json+path:.claude-plugin&per_page=30';
const REPO_CAP = 30;

export function parseCodeSearch(json, cap = REPO_CAP) {
  const items = Array.isArray(json?.items) ? json.items : [];
  const repos = [];
  const seen = new Set();
  for (const it of items) {
    const fullName = it?.repository?.full_name;
    const path = it?.path;
    if (!fullName || !path || seen.has(fullName)) continue;
    const [owner, repo] = String(fullName).split('/');
    if (!owner || !repo) continue;
    seen.add(fullName);
    repos.push({ owner, repo, fullName, path });
  }
  return repos.slice(0, cap);
}

export function rawManifestUrl({ fullName, path }) {
  return `https://raw.githubusercontent.com/${fullName}/HEAD/${path}`;
}

export async function collect(ctx) {
  const { fetchJson, now, githubToken = null, log = () => {} } = ctx;
  if (typeof fetchJson !== 'function') return { capabilities: [], ok: false, error: 'no fetchJson' };

  const headers = { Accept: 'application/vnd.github+json' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const search = await fetchJson(CODE_SEARCH_URL, { headers });
  if (!search) return { capabilities: [], ok: false, error: 'github code search failed (rate-limit/auth?)' };

  const capabilities = [];
  for (const r of parseCodeSearch(search)) {
    try {
      const manifest = await fetchJson(rawManifestUrl(r));
      if (!manifest) { log(`github: no manifest for ${r.fullName}`); continue; }
      const marketplace = manifest.name || `${r.owner}-${r.repo}`;
      const caps = capabilitiesFromManifest(manifest, {
        marketplace,
        repo: normalizeRepo(r.fullName),
        discoveredVia: 'github',
        installCommand: (n) => `claude plugin marketplace add ${r.fullName} && claude plugin install ${n}@${marketplace}`,
        now
      });
      for (const c of caps) capabilities.push(c);
    } catch (e) {
      log(`github: skipping ${r.fullName}: ${e.message}`);
    }
  }
  return { capabilities, ok: true };
}
