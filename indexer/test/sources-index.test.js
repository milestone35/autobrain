import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sources } from '../src/sources/index.js';

test('registry exposes the local sources with the contract shape', () => {
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known', 'builtin']);
  for (const s of sources) {
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.collect, 'function');
  }
});

test('builtin source is registered', () => {
  assert.ok(sources.some((s) => s.name === 'builtin'));
});
