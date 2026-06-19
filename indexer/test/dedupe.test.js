import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeCapabilities } from '../src/dedupe.js';

function cap(over = {}) {
  return {
    id: 'mp::p::c', kind: 'skill', name: 'n', description: '', keywords: [],
    source: { marketplace: 'mp', repo: null, discoveredVia: 'known' },
    install: null, trust: null, cost: null, popularity: {}, lastSeen: '2026-01-01T00:00:00Z',
    ...over
  };
}

test('merges same id: unions keywords, keeps richer fields, latest lastSeen', () => {
  const a = cap({ keywords: ['b', 'a'], description: 'short', lastSeen: '2026-01-01T00:00:00Z',
    source: { marketplace: 'mp', repo: null, discoveredVia: 'known' }, popularity: { unique_installs: 1 } });
  const b = cap({ keywords: ['c', 'a'], description: 'a longer description', lastSeen: '2026-02-01T00:00:00Z',
    source: { marketplace: 'mp', repo: 'github:o/r', discoveredVia: 'official' },
    install: { method: 'plugin', command: 'x', package: null }, popularity: { unique_installs: 9 } });
  const [m] = dedupeCapabilities([a, b]);
  assert.deepEqual(m.keywords, ['a', 'b', 'c']);
  assert.equal(m.description, 'a longer description');
  assert.equal(m.lastSeen, '2026-02-01T00:00:00Z');
  assert.equal(m.source.discoveredVia, 'official');
  assert.equal(m.source.repo, 'github:o/r');
  assert.equal(m.install.command, 'x');
  assert.equal(m.popularity.unique_installs, 9);
});

test('distinct ids are kept and output is sorted by id', () => {
  const out = dedupeCapabilities([cap({ id: 'z' }), cap({ id: 'a' })]);
  assert.deepEqual(out.map((c) => c.id), ['a', 'z']);
});
