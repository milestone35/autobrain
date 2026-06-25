import { capabilitiesFromManifest } from '../normalize.js';
import { normalizeRepo } from '../trust.js';

export const name = 'github';

const REPO_CAP = 30;
const CODE_SEARCH_URL =
  `https://api.github.com/search/code?q=filename:marketplace.json+path:.claude-plugin&per_page=${REPO_CAP}`;
// GitHub full_name (owner/repo) and marketplace names are interpolated into a shell-run
// install command, so validate them before use (defense against injection from repo data).
const SAFE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_NAME = /^[A-Za-z0-9_.@-]+$/;

export function parseCodeSearch(json, cap = REPO_CAP) {
  const items = Array.isArray(json?.items) ? json.items : [];
  const repos = [];
  const seen = new Set();
  for (const it of items) {
    const fullName = it?.repository?.full_name;
    const path = it?.path;
    const key = String(fullName).toLowerCase();
    if (!fullName || !path || seen.has(key)) continue;
    const [owner, repo] = String(fullName).split('/');
    if (!owner || !repo) continue;
    seen.add(key);
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
    if (!SAFE_REPO.test(r.fullName)) { log(`github: unsafe repo name ${r.fullName}, skipping`); continue; }
    try {
      const manifest = await fetchJson(rawManifestUrl(r));
      if (!manifest) { log(`github: no manifest for ${r.fullName}`); continue; }
      let marketplace = manifest.name || `${r.owner}-${r.repo}`;
      if (!SAFE_NAME.test(marketplace)) { log(`github: unsafe marketplace name for ${r.fullName}, using fallback`); marketplace = `${r.owner}-${r.repo}`; }
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
