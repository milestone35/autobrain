import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeId, deriveKeywords } from '../src/normalize.js';

test('makeId joins present parts with ::', () => {
  assert.equal(makeId({ marketplace: 'mp', plugin: 'p', component: 'c' }), 'mp::p::c');
});

test('makeId omits missing component', () => {
  assert.equal(makeId({ marketplace: 'mp', plugin: 'p' }), 'mp::p');
});

test('deriveKeywords lowercases, drops short words and stopwords, dedupes', () => {
  const kw = deriveKeywords('API Security for the Audit and audit');
  assert.deepEqual(kw, ['api', 'audit', 'security']);
});

test('deriveKeywords returns sorted unique list capped at 25', () => {
  const kw = deriveKeywords(Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '));
  assert.equal(kw.length, 25);
  assert.deepEqual(kw, [...kw].sort());
});
