import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atomicWriteJson, readJson } from '../src/store.js';
import { resolvePaths, writeMap, readMap, readScanState, writeScanState } from '../src/store.js';

async function tmp() {
  return mkdtemp(path.join(tmpdir(), 'cc-store-'));
}

test('atomicWriteJson creates dirs and writes pretty JSON with trailing newline', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'nested', 'out.json');
  await atomicWriteJson(file, { a: 1 });
  const raw = await readFile(file, 'utf8');
  assert.equal(raw, '{\n  "a": 1\n}\n');
  await rm(dir, { recursive: true, force: true });
});

test('readJson returns fallback on ENOENT', async () => {
  const dir = await tmp();
  assert.deepEqual(await readJson(path.join(dir, 'missing.json'), { ok: true }), { ok: true });
  await rm(dir, { recursive: true, force: true });
});

test('readJson throws a clear error on corrupt JSON', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'bad.json');
  await writeFile(file, '{ not json', 'utf8');
  await assert.rejects(() => readJson(file, null), /Bozuk JSON/);
  await rm(dir, { recursive: true, force: true });
});

test('resolvePaths derives source paths from home and data dir', () => {
  const p = resolvePaths({ home: '/H', dataDir: '/D' });
  assert.equal(p.dataDir, '/D');
  assert.equal(p.mapFile, path.join('/D', 'capability-map.json'));
  assert.equal(p.stateFile, path.join('/D', 'scan-state.json'));
  assert.equal(p.sourcePaths.officialCatalog, path.join('/H', '.claude', 'plugins', 'plugin-catalog-cache.json'));
  assert.equal(p.sourcePaths.knownMarketplaces, path.join('/H', '.claude', 'plugins', 'known_marketplaces.json'));
});

test('writeMap then readMap round-trips', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'capability-map.json');
  await writeMap(file, { schemaVersion: 1, generatedAt: 't', sources: {}, capabilities: [] });
  const m = await readMap(file);
  assert.equal(m.schemaVersion, 1);
  await rm(dir, { recursive: true, force: true });
});

test('readMap throws when missing', async () => {
  const dir = await tmp();
  await assert.rejects(() => readMap(path.join(dir, 'capability-map.json')), /Harita yok/);
  await rm(dir, { recursive: true, force: true });
});

test('readMap throws on unsupported schemaVersion', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'capability-map.json');
  await writeFile(file, JSON.stringify({ schemaVersion: 99 }), 'utf8');
  await assert.rejects(() => readMap(file), /schemaVersion/);
  await rm(dir, { recursive: true, force: true });
});

test('readScanState returns default when absent', async () => {
  const dir = await tmp();
  assert.deepEqual(await readScanState(path.join(dir, 'scan-state.json')), { sources: {}, lastRun: null });
  await rm(dir, { recursive: true, force: true });
});

test('writeScanState then readScanState round-trips', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'scan-state.json');
  await writeScanState(file, { sources: { official: { ok: true } }, lastRun: 't' });
  assert.equal((await readScanState(file)).sources.official.ok, true);
  await rm(dir, { recursive: true, force: true });
});

test('resolvePaths exposes pypiSeeds (default under config, overridable)', () => {
  const def = resolvePaths({ home: '/H', dataDir: '/D' });
  assert.ok(def.sourcePaths.pypiSeeds.endsWith(path.join('config', 'pypi-seeds.json')));
  const over = resolvePaths({ home: '/H', dataDir: '/D', pypiSeeds: '/X/seeds.json' });
  assert.equal(over.sourcePaths.pypiSeeds, '/X/seeds.json');
});
