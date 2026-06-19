import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atomicWriteJson, readJson } from '../src/store.js';

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
