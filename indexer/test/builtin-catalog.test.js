import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as builtin from '../src/sources/builtin-catalog.js';

const NOW = '2026-06-24T00:00:00Z';

test('source name is "builtin"', () => {
  assert.equal(builtin.name, 'builtin');
});

test('collect emits builtin capabilities with install:null and builtin source', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  assert.equal(res.ok, true);
  assert.ok(res.capabilities.length >= 18, `expected >=18, got ${res.capabilities.length}`);
  for (const c of res.capabilities) {
    assert.equal(c.install, null, `${c.id} must have install:null`);
    assert.equal(c.source.discoveredVia, 'builtin');
    assert.equal(c.source.marketplace, 'builtin');
    assert.equal(c.lastSeen, NOW);
    assert.ok(['bang', 'builtin-tool', 'slash', 'builtin-agent', 'skill'].includes(c.kind));
  }
});

test('collect includes the artifact-design builtin skill (zero-install design capability)', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const ad = res.capabilities.find((c) => c.id === 'builtin::core::skill::artifact-design');
  assert.ok(ad, 'artifact-design present');
  assert.equal(ad.kind, 'skill');
  assert.equal(ad.install, null);
  assert.equal(ad.source.discoveredVia, 'builtin');
  assert.ok(ad.keywords.includes('design') && ad.keywords.includes('html'));
});

test('collect includes the bang shell capability with ssh keyword', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const shell = res.capabilities.find((c) => c.kind === 'bang');
  assert.ok(shell, 'bang capability present');
  assert.equal(shell.id, 'builtin::core::bang::shell');
  assert.ok(shell.keywords.includes('ssh'));
});

test('collect covers all four builtin kinds', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const kinds = new Set(res.capabilities.map((c) => c.kind));
  for (const k of ['bang', 'builtin-tool', 'slash', 'builtin-agent']) assert.ok(kinds.has(k), `missing kind ${k}`);
});

test('collect ids are unique', async () => {
  const res = await builtin.collect({ sourcePaths: {}, now: NOW });
  const ids = res.capabilities.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});
