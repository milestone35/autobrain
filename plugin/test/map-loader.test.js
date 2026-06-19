import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMap } from '../lib/map-loader.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');
async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-map-')); }

test('loadMap loads a valid map and is fresh when within staleDays', async () => {
  const res = await loadMap({ mapFile: FIXT, staleDays: 14, now: '2026-06-25T00:00:00Z' });
  assert.equal(res.error, null);
  assert.equal(res.map.capabilities.length, 3);
  assert.equal(res.stale, false);
  assert.equal(res.ageDays, 6);
});

test('loadMap flags stale when older than staleDays', async () => {
  const res = await loadMap({ mapFile: FIXT, staleDays: 14, now: '2026-08-01T00:00:00Z' });
  assert.equal(res.stale, true);
  assert.ok(res.ageDays > 14);
});

test('loadMap returns error when file missing', async () => {
  const res = await loadMap({ mapFile: '/no/such/map.json', staleDays: 14, now: '2026-06-19T00:00:00Z' });
  assert.equal(res.map, null);
  assert.match(res.error, /not found|bulunamad/i);
});

test('loadMap returns error on corrupt JSON', async () => {
  const dir = await tmp();
  const f = path.join(dir, 'bad.json');
  await writeFile(f, '{ not json', 'utf8');
  const res = await loadMap({ mapFile: f, staleDays: 14, now: '2026-06-19T00:00:00Z' });
  assert.equal(res.map, null);
  assert.match(res.error, /JSON/i);
  await rm(dir, { recursive: true, force: true });
});

test('loadMap returns error on unsupported schemaVersion', async () => {
  const dir = await tmp();
  const f = path.join(dir, 'v99.json');
  await writeFile(f, JSON.stringify({ schemaVersion: 99, capabilities: [] }), 'utf8');
  const res = await loadMap({ mapFile: f, staleDays: 14, now: '2026-06-19T00:00:00Z' });
  assert.equal(res.map, null);
  assert.match(res.error, /schemaVersion/);
  await rm(dir, { recursive: true, force: true });
});
