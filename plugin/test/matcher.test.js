import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, scoreCapability, rankCandidates, matchPrompt } from '../lib/matcher.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'capability-map.sample.json'), 'utf8'));
const cap = (id) => MAP.capabilities.find((c) => c.id === id);

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

test('scoreCapability weights name x3, keyword x2, description x1', () => {
  const t = tokenize('audit my api security');
  // api-audit: name {api,audit}=2*3=6; keywords {api,audit,security}=3*2=6; desc {audit,api,security}=3*1=3 => 15
  assert.equal(scoreCapability(t, cap('mp::api-sec::skill::api-audit')), 15);
  // api-fuzz: name {api}=1*3=3; keywords {api}=1*2=2; desc {api}=1*1=1 => 6
  assert.equal(scoreCapability(t, cap('mp::api-sec::skill::api-fuzz')), 6);
  // write-readme: no overlap => 0
  assert.equal(scoreCapability(t, cap('mp::docs::skill::write-readme')), 0);
});

test('rankCandidates sorts by score desc, then unique_installs desc, then id asc', () => {
  const scored = [
    { cap: { id: 'b', popularity: { unique_installs: 10 } }, score: 5 },
    { cap: { id: 'a', popularity: { unique_installs: 10 } }, score: 5 },
    { cap: { id: 'c', popularity: { unique_installs: 99 } }, score: 9 }
  ];
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['c', 'a', 'b']);
});

test('rankCandidates caps at topN', () => {
  const scored = [1, 2, 3, 4].map((n) => ({ cap: { id: `id${n}`, popularity: {} }, score: n }));
  assert.equal(rankCandidates(scored, 2).length, 2);
});

test('matchPrompt returns ranked candidates above scoreFloor (generous gate)', () => {
  const { candidates } = matchPrompt('audit my api security', MAP, { topN: 5, scoreFloor: 0 });
  assert.deepEqual(candidates.map((c) => c.id), ['mp::api-sec::skill::api-audit', 'mp::api-sec::skill::api-fuzz']);
});

test('matchPrompt returns [] when nothing matches', () => {
  const { candidates } = matchPrompt('xyzzy nothing here', MAP, { topN: 5, scoreFloor: 0 });
  assert.deepEqual(candidates, []);
});
