import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleMap } from '../scripts/bundle-map.js';

const validMap = JSON.stringify({ schemaVersion: 1, capabilities: [{ id: 'a' }, { id: 'b' }] });

test('bundleMap: valid map is written byte-identical and count returned', async () => {
  let written = null;
  const res = await bundleMap({
    srcMap: '/src.json', destMap: '/dest.json',
    readFile: async () => validMap,
    writeFile: async (p, c) => { written = { p, c }; }
  });
  assert.deepEqual(res, { count: 2 });
  assert.equal(written.p, '/dest.json');
  assert.equal(written.c, validMap);
});

test('bundleMap: empty capabilities -> throws, no write', async () => {
  let wrote = false;
  await assert.rejects(
    bundleMap({ srcMap: '/s', destMap: '/d',
      readFile: async () => JSON.stringify({ schemaVersion: 1, capabilities: [] }),
      writeFile: async () => { wrote = true; } }),
    /yetenek yok|boş/);
  assert.equal(wrote, false);
});

test('bundleMap: invalid JSON -> throws, no write', async () => {
  let wrote = false;
  await assert.rejects(
    bundleMap({ srcMap: '/s', destMap: '/d',
      readFile: async () => 'not json{',
      writeFile: async () => { wrote = true; } }),
    /JSON/);
  assert.equal(wrote, false);
});

test('bundleMap: wrong schemaVersion -> throws, no write', async () => {
  let wrote = false;
  await assert.rejects(
    bundleMap({ srcMap: '/s', destMap: '/d',
      readFile: async () => JSON.stringify({ schemaVersion: 99, capabilities: [{ id: 'a' }] }),
      writeFile: async () => { wrote = true; } }),
    /schemaVersion/);
  assert.equal(wrote, false);
});
