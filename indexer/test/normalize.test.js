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

test('makeCapability accepts the four builtin kinds', () => {
  const base = { name: 'x', marketplace: 'builtin', plugin: 'core', component: 'x', now: 't' };
  for (const kind of ['bang', 'builtin-tool', 'slash', 'builtin-agent']) {
    const c = makeCapability({ ...base, kind });
    assert.equal(c.kind, kind);
  }
});

test('validateCapability still rejects an unknown kind', () => {
  const errs = validateCapability({ kind: 'nonsense', name: 'x', marketplace: 'builtin', plugin: 'core' });
  assert.ok(errs.some((e) => e.includes('kind')));
});

import { capabilitiesFromManifest } from '../src/normalize.js';

test('capabilitiesFromManifest builds one plugin cap per manifest plugin', () => {
  const manifest = { plugins: [{ name: 'p1', description: 'd1' }, { name: 'p2' }, { bad: true }] };
  const caps = capabilitiesFromManifest(manifest, {
    marketplace: 'mp', repo: 'github:o/r', discoveredVia: 'github',
    installCommand: (n) => `cmd ${n}`, now: 't'
  });
  assert.equal(caps.length, 2);                       // entry without a name is skipped
  assert.equal(caps[0].id, 'mp::p1::plugin');
  assert.equal(caps[0].kind, 'plugin');
  assert.equal(caps[0].install.command, 'cmd p1');
  assert.equal(caps[0].install.method, 'plugin');
  assert.equal(caps[0].source.repo, 'github:o/r');
  assert.equal(caps[0].source.discoveredVia, 'github');
  assert.equal(caps[0].lastSeen, 't');
});

test('capabilitiesFromManifest returns [] for a manifest with no plugins', () => {
  assert.deepEqual(capabilitiesFromManifest({}, { marketplace: 'm', discoveredVia: 'x', installCommand: () => 'c', now: 't' }), []);
});

test('capabilitiesFromManifest skips plugins with unsafe names (injection defense)', () => {
  const manifest = { plugins: [{ name: 'ok-plugin' }, { name: 'evil && rm -rf /' }, { name: 'has space' }] };
  const caps = capabilitiesFromManifest(manifest, {
    marketplace: 'mp', discoveredVia: 'x', installCommand: (n) => `cmd ${n}`, now: 't'
  });
  assert.deepEqual(caps.map((c) => c.name), ['ok-plugin']);     // unsafe names dropped
});
