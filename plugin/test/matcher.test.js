import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, scoreCapability, rankCandidates, matchPrompt, deliverableIsVisual, isDesignOriented } from '../lib/matcher.js';
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

test('scoreCapability tokenizes multi-word keywords (contract robustness)', () => {
  // The capability-map contract permits arbitrary keyword strings, not just single
  // tokens. A multi-word keyword must still match a single prompt token.
  const cap = { name: '', description: '', keywords: ['api security'] };
  assert.equal(scoreCapability(tokenize('api'), cap), 2);       // 1 keyword token * 2
  assert.equal(scoreCapability(tokenize('security'), cap), 2);
});

test('rankCandidates prefers builtin over installable on equal score', () => {
  const scored = [
    { cap: { id: 'plugin-cap', trust: 'trusted', popularity: { unique_installs: 999 } }, score: 5 },
    { cap: { id: 'builtin-cap', trust: 'builtin', popularity: { unique_installs: 0 } }, score: 5 }
  ];
  // equal score: builtin wins even though the plugin has far more installs
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['builtin-cap', 'plugin-cap']);
});

test('rankCandidates: relevance still dominates builtin preference', () => {
  const scored = [
    { cap: { id: 'builtin-cap', trust: 'builtin', popularity: {} }, score: 2 },
    { cap: { id: 'plugin-cap', trust: 'trusted', popularity: {} }, score: 9 }
  ];
  // higher-score plugin must still rank first; builtin preference is only a tie-break
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['plugin-cap', 'builtin-cap']);
});

test('rankCandidates: isBuiltin via source.discoveredVia also gets tie-break preference', () => {
  const scored = [
    { cap: { id: 'plugin-cap', trust: 'trusted', popularity: { unique_installs: 50 } }, score: 5 },
    { cap: { id: 'builtin-via-source', trust: 'trusted', source: { discoveredVia: 'builtin' }, popularity: { unique_installs: 0 } }, score: 5 }
  ];
  // builtin recognized via source.discoveredVia (not the trust field) still wins the tie
  assert.deepEqual(rankCandidates(scored, 5).map((c) => c.id), ['builtin-via-source', 'plugin-cap']);
});

// --- Design-awareness heuristic (SP17) --------------------------------------

test('deliverableIsVisual detects visual/presentation deliverable signals', () => {
  assert.equal(deliverableIsVisual('export this to an html report'), true);
  assert.equal(deliverableIsVisual('bunu bir html rapora aktar'), true);
  assert.equal(deliverableIsVisual('design a landing page'), true);
  assert.equal(deliverableIsVisual('build a ui dashboard'), true);
  assert.equal(deliverableIsVisual('şık bir tasarım istiyorum'), true);
});

test('deliverableIsVisual is false for plain code/text tasks (no substring false-positives)', () => {
  assert.equal(deliverableIsVisual('write a function to parse json'), false);
  assert.equal(deliverableIsVisual('fix the failing build script'), false);   // must NOT match 'ui' inside 'build'
  assert.equal(deliverableIsVisual('refactor the require() calls'), false);    // must NOT match 'ui' inside 'require'
  assert.equal(deliverableIsVisual(''), false);
});

test('isDesignOriented flags design/frontend/ui capabilities, not generic ones', () => {
  assert.equal(isDesignOriented({ name: 'frontend-design', keywords: ['frontend', 'design'], description: 'polished interfaces' }), true);
  assert.equal(isDesignOriented({ name: 'artifact-design', keywords: ['artifact', 'html'], description: 'design fundamentals' }), true);
  assert.equal(isDesignOriented({ name: 'api-audit', keywords: ['api', 'security'], description: 'audit apis' }), false);
});

test('scoreCapability adds design bonus only when wantsVisual AND cap is design-oriented', () => {
  const t = tokenize('html report');
  const designCap = { name: 'frontend-design', keywords: ['frontend', 'design'], description: 'polished ui' };
  const plainCap = { name: 'api-audit', keywords: ['api'], description: 'audit' };
  const base = scoreCapability(t, designCap);
  assert.equal(scoreCapability(t, designCap, { wantsVisual: true }), base + 4); // bonus applied
  assert.equal(scoreCapability(t, designCap, { wantsVisual: false }), base);    // no signal -> no bonus
  assert.equal(scoreCapability(t, designCap), base);                            // back-compat: opts optional
  // a non-design cap never gets the bonus even when a visual deliverable is wanted
  assert.equal(scoreCapability(t, plainCap, { wantsVisual: true }), scoreCapability(t, plainCap));
});

test('matchPrompt surfaces a design capability for a visual deliverable via the bonus', () => {
  const map = { capabilities: [
    { id: 'design', name: 'frontend-design', keywords: ['frontend', 'design'], description: 'polished interfaces', trust: 'trusted', popularity: {} },
    { id: 'plain', name: 'json-tool', keywords: ['json'], description: 'parse json', trust: 'trusted', popularity: {} }
  ] };
  // 'export to an html report' shares no tokens with the design cap -> base score 0 (excluded
  // at scoreFloor 0). The visual-deliverable bonus must pull it above the floor.
  const { candidates } = matchPrompt('export to an html report', map, { topN: 5, scoreFloor: 0 });
  assert.ok(candidates.some((c) => c.id === 'design'), 'design cap should surface via bonus');
});
