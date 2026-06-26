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

test('description tie-break is order-independent for equal-length descriptions', () => {
  const a = cap({ description: 'aaa' });
  const b = cap({ description: 'bbb' });
  const [ab] = dedupeCapabilities([a, b]);
  const [ba] = dedupeCapabilities([b, a]);
  assert.equal(ab.description, ba.description);
  assert.equal(ab.description, 'aaa'); // lexically smaller wins, deterministically
});

test('merges mcp caps that install the same package across sources (registry wins)', () => {
  const npmCap = {
    id: 'npm::@foo/srv::mcp', kind: 'mcp', name: '@foo/srv', description: 'npm desc',
    keywords: ['a'], source: { marketplace: 'npm', repo: 'github:foo/srv', discoveredVia: 'npm' },
    install: { method: 'mcp', command: 'claude mcp add foo-srv -- npx -y @foo/srv', package: '@foo/srv' },
    trust: null, cost: null, popularity: {}, lastSeen: '2026-01-01T00:00:00Z'
  };
  const regCap = {
    id: 'mcp-registry::io.github.foo/srv::mcp', kind: 'mcp', name: 'io.github.foo/srv',
    description: 'a much longer registry description', keywords: ['b'],
    source: { marketplace: 'mcp-registry', repo: 'github:foo/srv', discoveredVia: 'mcp-registry' },
    install: { method: 'mcp', command: 'claude mcp add io-github-foo-srv -- npx -y @foo/srv', package: '@foo/srv' },
    trust: null, cost: null, popularity: {}, lastSeen: '2026-02-01T00:00:00Z'
  };
  // order-independent: registry (rank 3) must win regardless of input order
  for (const input of [[npmCap, regCap], [regCap, npmCap]]) {
    const out = dedupeCapabilities(input);
    assert.equal(out.length, 1);                                       // merged, not duplicated
    assert.equal(out[0].id, 'mcp-registry::io.github.foo/srv::mcp');   // registry wins
    assert.equal(out[0].install.command, 'claude mcp add io-github-foo-srv -- npx -y @foo/srv');
    assert.deepEqual(out[0].keywords, ['a', 'b']);                     // unioned + sorted
  }
});

test('does not merge mcp caps that install different packages', () => {
  const a = cap({ id: 'npm::p1::mcp', kind: 'mcp', source: { marketplace: 'npm', repo: null, discoveredVia: 'npm' }, install: { method: 'mcp', command: 'x', package: 'p1' } });
  const b = cap({ id: 'mcp-registry::p2::mcp', kind: 'mcp', source: { marketplace: 'mcp-registry', repo: null, discoveredVia: 'mcp-registry' }, install: { method: 'mcp', command: 'y', package: 'p2' } });
  assert.equal(dedupeCapabilities([a, b]).length, 2);
});

test('does not merge remote mcp caps (install.package null) sharing nothing', () => {
  const a = cap({ id: 'mcp-registry::r1::mcp', kind: 'mcp', source: { marketplace: 'mcp-registry', repo: null, discoveredVia: 'mcp-registry' }, install: { method: 'mcp', command: 'claude mcp add r1 --transport http r1 https://a', package: null } });
  const b = cap({ id: 'mcp-registry::r2::mcp', kind: 'mcp', source: { marketplace: 'mcp-registry', repo: null, discoveredVia: 'mcp-registry' }, install: { method: 'mcp', command: 'claude mcp add r2 --transport http r2 https://b', package: null } });
  assert.equal(dedupeCapabilities([a, b]).length, 2);
});

test('non-mcp caps with no package are unaffected by the package pass', () => {
  const out = dedupeCapabilities([cap({ id: 'z' }), cap({ id: 'a' })]);
  assert.deepEqual(out.map((c) => c.id), ['a', 'z']);   // still kept + sorted
});

test('does not merge same-name packages across ecosystems (npm npx vs pypi uvx)', () => {
  const npmCap = cap({ id: 'npm::redis::mcp', kind: 'mcp',
    source: { marketplace: 'npm', repo: null, discoveredVia: 'npm' },
    install: { method: 'mcp', command: 'claude mcp add redis -- npx -y redis', package: 'redis' } });
  const pypiCap = cap({ id: 'mcp-registry::x.redis/srv::mcp', kind: 'mcp',
    source: { marketplace: 'mcp-registry', repo: null, discoveredVia: 'mcp-registry' },
    install: { method: 'mcp', command: 'claude mcp add x-redis-srv -- uvx redis', package: 'redis' } });
  assert.equal(dedupeCapabilities([npmCap, pypiCap]).length, 2);  // different ecosystems, not merged
});

test('merges a pypi cap and an mcp-registry cap that install the same pypi package (registry wins)', () => {
  const pypiCap = {
    id: 'pypi::mcp-server-git::mcp', kind: 'mcp', name: 'mcp-server-git', description: 'pypi desc',
    keywords: ['git'], source: { marketplace: 'pypi', repo: null, discoveredVia: 'pypi' },
    install: { method: 'mcp', command: 'claude mcp add mcp-server-git -- uvx mcp-server-git', package: 'mcp-server-git' },
    trust: null, cost: null, popularity: {}, lastSeen: '2026-01-01T00:00:00Z'
  };
  const regCap = {
    id: 'mcp-registry::io.github.x/git::mcp', kind: 'mcp', name: 'io.github.x/git', description: 'registry desc longer',
    keywords: ['mcp'], source: { marketplace: 'mcp-registry', repo: 'github:x/git', discoveredVia: 'mcp-registry' },
    install: { method: 'mcp', command: 'claude mcp add io-github-x-git -- uvx mcp-server-git', package: 'mcp-server-git' },
    trust: null, cost: null, popularity: {}, lastSeen: '2026-02-01T00:00:00Z'
  };
  for (const input of [[pypiCap, regCap], [regCap, pypiCap]]) {
    const out = dedupeCapabilities(input);
    assert.equal(out.length, 1);                                   // both commands use uvx -> same ecosystem key pypi:mcp-server-git
    assert.equal(out[0].id, 'mcp-registry::io.github.x/git::mcp');  // registry rank 3 beats pypi rank 5
    assert.deepEqual(out[0].keywords, ['git', 'mcp']);
  }
});
