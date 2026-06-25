import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchJson } from '../src/http.js';

test('makeFetchJson returns parsed JSON on 2xx', async () => {
  const fj = makeFetchJson(async () => ({ ok: true, json: async () => ({ a: 1 }) }));
  assert.deepEqual(await fj('http://x'), { a: 1 });
});

test('makeFetchJson returns null on non-2xx', async () => {
  const fj = makeFetchJson(async () => ({ ok: false, status: 403, json: async () => ({}) }));
  assert.equal(await fj('http://x'), null);
});

test('makeFetchJson returns null on network throw', async () => {
  const fj = makeFetchJson(async () => { throw new Error('ECONNRESET'); });
  assert.equal(await fj('http://x'), null);
});

test('makeFetchJson returns null on invalid JSON', async () => {
  const fj = makeFetchJson(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
  assert.equal(await fj('http://x'), null);
});

test('makeFetchJson passes headers and a default User-Agent', async () => {
  let seen = null;
  const fj = makeFetchJson(async (url, opts) => { seen = opts; return { ok: true, json: async () => ({}) }; });
  await fj('http://x', { headers: { Authorization: 'Bearer t' } });
  assert.equal(seen.headers.Authorization, 'Bearer t');
  assert.equal(seen.headers['User-Agent'], 'cc-autopilot');
});
