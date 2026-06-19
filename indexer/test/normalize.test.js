import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeId, deriveKeywords } from '../src/normalize.js';

test('makeId joins present parts with ::', () => {
  assert.equal(makeId({ marketplace: 'mp', plugin: 'p', kind: 'skill', component: 'c' }), 'mp::p::skill::c');
});

test('makeId omits missing parts', () => {
  assert.equal(makeId({ marketplace: 'mp', plugin: 'p', kind: 'plugin' }), 'mp::p::plugin');
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

import { makeCapability, validateCapability } from '../src/normalize.js';

const VALID = {
  kind: 'skill', name: 'audit', marketplace: 'mp', plugin: 'p', component: 'audit',
  description: 'Audit things', keywords: ['audit'],
  source: { repo: 'github:o/r', discoveredVia: 'official' },
  install: { method: 'plugin', command: 'claude plugin install p@mp' },
  cost: { always_on: 10 }, popularity: { unique_installs: 5 }, now: '2026-06-19T00:00:00Z'
};

test('validateCapability returns [] for a valid input', () => {
  assert.deepEqual(validateCapability(VALID), []);
});

test('validateCapability flags missing required fields', () => {
  const errs = validateCapability({ kind: 'bogus', name: '', plugin: 'p' });
  assert.ok(errs.some((e) => e.includes('kind')));
  assert.ok(errs.some((e) => e.includes('name')));
  assert.ok(errs.some((e) => e.includes('marketplace')));
});

test('makeCapability builds a normalized object', () => {
  const c = makeCapability(VALID);
  assert.equal(c.id, 'mp::p::skill::audit');
  assert.equal(c.kind, 'skill');
  assert.equal(c.trust, null);
  assert.equal(c.source.discoveredVia, 'official');
  assert.equal(c.install.package, null);
  assert.equal(c.lastSeen, '2026-06-19T00:00:00Z');
});

test('makeCapability throws on invalid input', () => {
  assert.throws(() => makeCapability({ kind: 'skill', name: '', plugin: 'p' }), /Invalid capability/);
});

test('makeCapability: same name, different kind => distinct ids (no collision)', () => {
  const base = { name: 'dup', marketplace: 'mp', plugin: 'p', component: 'dup', now: 't' };
  const skill = makeCapability({ ...base, kind: 'skill' });
  const command = makeCapability({ ...base, kind: 'command' });
  assert.notEqual(skill.id, command.id);
  assert.equal(skill.id, 'mp::p::skill::dup');
  assert.equal(command.id, 'mp::p::command::dup');
});
