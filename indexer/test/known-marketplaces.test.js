import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as known from '../src/sources/known-marketplaces.js';

const FIXT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'known');
const NOW = '2026-06-19T00:00:00Z';

// Build a runtime known_marketplaces.json whose installLocation points at the real fixture dir.
async function buildKnownFile() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cc-known-'));
  const tpl = JSON.parse(await readFile(path.join(FIXT_DIR, 'known_marketplaces.sample.json'), 'utf8'));
  tpl['mp-a'].installLocation = path.join(FIXT_DIR, 'mp-a');
  const file = path.join(dir, 'known_marketplaces.json');
  await writeFile(file, JSON.stringify(tpl), 'utf8');
  return { dir, file };
}

test('source name is "known"', () => {
  assert.equal(known.name, 'known');
});

test('collect emits plugin-level capabilities from marketplace manifest', async () => {
  const { dir, file } = await buildKnownFile();
  const res = await known.collect({ sourcePaths: { knownMarketplaces: file }, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 2); // alpha + beta; mp-missing skipped

  const alpha = res.capabilities.find((c) => c.id === 'mp-a::alpha::plugin');
  assert.equal(alpha.kind, 'plugin');
  assert.equal(alpha.install.command, 'claude plugin install alpha@mp-a');
  assert.equal(alpha.source.repo, 'github:owner/mp-a');
  assert.equal(alpha.source.discoveredVia, 'known');
  assert.ok(alpha.keywords.includes('alpha'));
  await rm(dir, { recursive: true, force: true });
});

test('collect returns ok:false when known file missing', async () => {
  const res = await known.collect({ sourcePaths: { knownMarketplaces: '/no/such/file.json' }, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
