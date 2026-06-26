import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScan } from '../src/cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OFFICIAL = path.join(HERE, 'fixtures', 'plugin-catalog-cache.sample.json');
const NOW = '2026-06-19T00:00:00Z';

test('runScan writes a deduped, trust-classified map and scan-state', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cc-scan-'));
  const trusted = path.join(dataDir, 'trusted.json');
  await (await import('node:fs/promises')).writeFile(trusted, JSON.stringify({ sources: [] }), 'utf8');

  const map = await runScan({
    dataDir,
    trustedSources: trusted,
    officialCatalog: OFFICIAL,
    knownMarketplaces: '/no/such/known.json',
    fetchJson: async () => null,
    now: NOW
  });

  assert.equal(map.schemaVersion, 1);
  assert.equal(map.generatedAt, NOW);
  assert.equal(map.sources.official.ok, true);
  assert.equal(map.sources.known.ok, false);
  assert.ok(map.capabilities.length >= 4);

  assert.ok(map.capabilities.every((c) => c.source.discoveredVia !== 'official' || c.trust === 'trusted'));
  const ids = map.capabilities.map((c) => c.id);
  assert.deepEqual(ids, [...ids].sort());

  const onDisk = JSON.parse(await readFile(path.join(dataDir, 'capability-map.json'), 'utf8'));
  assert.equal(onDisk.capabilities.length, map.capabilities.length);

  await rm(dataDir, { recursive: true, force: true });
});

test('runScan integrates github + npm caps via injected fetchJson (candidate tier)', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cc-scan-web-'));
  const trusted = path.join(dataDir, 'trusted.json');
  await (await import('node:fs/promises')).writeFile(trusted, JSON.stringify({ sources: [] }), 'utf8');

  const CODE_SEARCH = { items: [{ repository: { full_name: 'o/r' }, path: '.claude-plugin/marketplace.json' }] };
  const MANIFEST = { name: 'mp', plugins: [{ name: 'webskill', description: 'a web plugin' }] };
  const NPM_SEARCH = { objects: [{ package: { name: 'x-mcp', description: 'd', keywords: ['mcp', 'server'], links: { repository: 'https://github.com/o/r2' } } }] };
  const fetchJson = async (url) => {
    if (url.includes('/search/code')) return CODE_SEARCH;
    if (url.includes('raw.githubusercontent.com')) return MANIFEST;
    if (url.includes('registry.npmjs.org')) return NPM_SEARCH;
    return null;
  };

  const map = await runScan({
    dataDir, trustedSources: trusted,
    officialCatalog: '/no/such/official.json', knownMarketplaces: '/no/such/known.json',
    fetchJson, githubToken: null, now: NOW
  });

  const gh = map.capabilities.find((c) => c.source.discoveredVia === 'github');
  const np = map.capabilities.find((c) => c.source.discoveredVia === 'npm');
  assert.ok(gh, 'github cap present');
  assert.ok(np, 'npm cap present');
  assert.equal(gh.trust, 'candidate');                 // repo present, not in trusted set
  assert.equal(np.trust, 'candidate');
  assert.equal(map.sources.github.count, 1);
  assert.equal(map.sources.npm.count, 1);

  await rm(dataDir, { recursive: true, force: true });
});
