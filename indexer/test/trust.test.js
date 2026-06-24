import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepo, loadTrustedSet, classifyTrust, applyTrust } from '../src/trust.js';

test('normalizeRepo lowercases and adds github: prefix when bare', () => {
  assert.equal(normalizeRepo('Obra/Superpowers'), 'github:obra/superpowers');
  assert.equal(normalizeRepo('github:Obra/Superpowers'), 'github:obra/superpowers');
  assert.equal(normalizeRepo(null), null);
});

test('loadTrustedSet normalizes entries', () => {
  const set = loadTrustedSet({ sources: ['Obra/Superpowers'] });
  assert.ok(set.has('github:obra/superpowers'));
});

function cap(over = {}) {
  return { source: { repo: null, discoveredVia: 'known' }, install: null, ...over };
}

test('official is always trusted', () => {
  assert.equal(classifyTrust(cap({ source: { repo: null, discoveredVia: 'official' } }), new Set()), 'trusted');
});

test('repo in trusted set is trusted', () => {
  const set = loadTrustedSet({ sources: ['o/r'] });
  assert.equal(classifyTrust(cap({ source: { repo: 'github:o/r', discoveredVia: 'known' } }), set), 'trusted');
});

test('has repo or install but not trusted -> candidate', () => {
  assert.equal(classifyTrust(cap({ source: { repo: 'github:x/y', discoveredVia: 'known' } }), new Set()), 'candidate');
});

test('no repo and no install -> unknown', () => {
  assert.equal(classifyTrust(cap(), new Set()), 'unknown');
});

test('applyTrust sets trust on every capability', () => {
  const out = applyTrust([cap({ source: { repo: null, discoveredVia: 'official' } })], new Set());
  assert.equal(out[0].trust, 'trusted');
});

test('discoveredVia builtin => builtin tier', () => {
  assert.equal(classifyTrust(cap({ source: { repo: null, discoveredVia: 'builtin' } }), new Set()), 'builtin');
});

test('builtin tier wins even if a repo is present', () => {
  assert.equal(classifyTrust(cap({ source: { repo: 'github:x/y', discoveredVia: 'builtin' } }), new Set()), 'builtin');
});
