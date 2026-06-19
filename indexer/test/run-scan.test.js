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
