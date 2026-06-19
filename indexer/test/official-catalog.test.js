import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as official from '../src/sources/official-catalog.js';

const FIXT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'plugin-catalog-cache.sample.json');
const NOW = '2026-06-19T00:00:00Z';

test('source name is "official"', () => {
  assert.equal(official.name, 'official');
});

test('collect emits one capability per component', async () => {
  const res = await official.collect({ sourcePaths: { officialCatalog: FIXT }, now: NOW });
  assert.equal(res.ok, true);
  // 2 skills + 1 mcp + 1 plugin-level (empty-plugin) = 4
  assert.equal(res.capabilities.length, 4);

  const scan = res.capabilities.find((c) => c.id === 'claude-plugins-official::api-security-testing::skill::42crunch-scan');
  assert.equal(scan.kind, 'skill');
  assert.equal(scan.install.command, 'claude plugin install api-security-testing@claude-plugins-official');
  assert.equal(scan.source.discoveredVia, 'official');
  assert.deepEqual(scan.cost, { always_on: 601, on_invoke: 6836 });
  assert.equal(scan.popularity.unique_installs, 441);
  assert.ok(scan.keywords.includes('security'));
  assert.equal(scan.lastSeen, NOW);

  const mcp = res.capabilities.find((c) => c.kind === 'mcp');
  assert.equal(mcp.id, 'claude-plugins-official::api-security-testing::mcp::crunch-mcp');

  const empty = res.capabilities.find((c) => c.id === 'claude-plugins-official::empty-plugin::plugin');
  assert.equal(empty.kind, 'plugin');
});

test('collect returns ok:false when catalog missing', async () => {
  const res = await official.collect({ sourcePaths: { officialCatalog: '/no/such/file.json' }, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
