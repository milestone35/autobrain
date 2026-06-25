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
  assert.equal(c.marketplace, 'npm');
  assert.equal(c.source.discoveredVia, 'npm');
  assert.equal(c.source.repo, 'github:o/r');
  assert.equal(c.install.method, 'mcp');
  assert.equal(c.install.package, 'cool-mcp-server');
  assert.equal(c.install.command, 'claude mcp add cool-mcp-server -- npx -y cool-mcp-server');
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
