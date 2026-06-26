import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as npm from '../src/sources/npm.js';

const NOW = '2026-06-25T00:00:00Z';

test('source name is "npm"', () => {
  assert.equal(npm.name, 'npm');
});

test('isLikelyMcpServer accepts mcp servers and rejects unrelated packages', () => {
  assert.equal(npm.isLikelyMcpServer({ name: 'foo-mcp-server', keywords: ['mcp', 'server'] }), true);
  assert.equal(npm.isLikelyMcpServer({ name: 'server-foo', keywords: ['model-context-protocol'] }), true);
  assert.equal(npm.isLikelyMcpServer({ name: 'mcp-thing', keywords: ['mcp'] }), true);          // name signal
  assert.equal(npm.isLikelyMcpServer({ name: 'random-lib', keywords: ['mcp'] }), false);        // no server signal
  assert.equal(npm.isLikelyMcpServer({ name: 'unrelated', keywords: ['http'] }), false);        // no mcp keyword
});

test('extractRepo pulls owner/repo from various repository url shapes', () => {
  assert.equal(npm.extractRepo({ links: { repository: 'https://github.com/Owner/Repo' } }), 'github:owner/repo');
  assert.equal(npm.extractRepo({ repository: { url: 'git+https://github.com/o/r.git' } }), 'github:o/r');
  assert.equal(npm.extractRepo({ repository: 'github.com/a/b' }), 'github:a/b');
  assert.equal(npm.extractRepo({}), null);
});

test('parseNpmSearch emits candidate mcp caps for likely servers only', () => {
  const json = { objects: [
    { package: { name: 'cool-mcp-server', description: 'An MCP server', keywords: ['mcp', 'server'], links: { repository: 'https://github.com/o/r' } } },
    { package: { name: 'random-lib', description: 'x', keywords: ['http'] } } // filtered out
  ] };
  const caps = npm.parseNpmSearch(json, { now: NOW });
  assert.equal(caps.length, 1);
  const c = caps[0];
  assert.equal(c.kind, 'mcp');
  assert.equal(c.name, 'cool-mcp-server');
  assert.equal(c.source.marketplace, 'npm');
  assert.equal(c.source.discoveredVia, 'npm');
  assert.equal(c.source.repo, 'github:o/r');
  assert.equal(c.install.method, 'mcp');
  assert.equal(c.install.package, 'cool-mcp-server');
  assert.equal(c.install.command, 'claude mcp add cool-mcp-server -- npx -y cool-mcp-server');
});

test('scoped package gets a specific server name (scope folded in, not bare last segment)', () => {
  // @ai-sdk/mcp must NOT register as the generic name "mcp" (which collides with
  // "claude mcp list" empty-state text); fold the scope into the name.
  const json = { objects: [{ package: { name: '@ai-sdk/mcp', description: 'd', keywords: ['mcp', 'server'] } }] };
  const caps = npm.parseNpmSearch(json, { now: NOW });
  assert.equal(caps.length, 1);
  assert.equal(caps[0].install.command, 'claude mcp add ai-sdk-mcp -- npx -y @ai-sdk/mcp');
  assert.equal(caps[0].install.package, '@ai-sdk/mcp');   // package keeps the full scoped id
});

test('parseNpmSearch skips packages with unsafe names (injection defense)', () => {
  const json = { objects: [
    { package: { name: 'good-mcp', description: 'd', keywords: ['mcp', 'server'] } },
    { package: { name: 'evil && rm -rf /', description: 'd', keywords: ['mcp', 'server'] } }
  ] };
  const caps = npm.parseNpmSearch(json, { now: NOW });
  assert.deepEqual(caps.map((c) => c.name), ['good-mcp']);
});

test('collect fetches search and parses', async () => {
  const json = { objects: [{ package: { name: 'x-mcp', description: 'd', keywords: ['mcp', 'server'] } }] };
  const res = await npm.collect({ fetchJson: async () => json, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 1);
});

test('collect returns ok:false when the search call fails', async () => {
  const res = await npm.collect({ fetchJson: async () => null, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
