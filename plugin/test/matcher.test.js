import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../lib/matcher.js';

test('tokenize lowercases, splits on non-alnum, drops short words + stopwords, dedupes', () => {
  assert.deepEqual(tokenize('Audit my API for the Security'), ['api', 'audit', 'security']);
});

test('tokenize returns [] for empty/nullish', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test('tokenize is order-independent (sorted unique set)', () => {
  assert.deepEqual(tokenize('security audit'), tokenize('audit security'));
});
