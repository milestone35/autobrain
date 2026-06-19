import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sources } from '../src/sources/index.js';

test('registry exposes the two local sources with the contract shape', () => {
  assert.deepEqual(sources.map((s) => s.name), ['official', 'known']);
  for (const s of sources) {
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.collect, 'function');
  }
});
