import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as reg from '../src/sources/mcp-registry.js';

const NOW = '2026-06-26T00:00:00Z';
const FIXT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mcp-registry.sample.json');
async function fixture() { return JSON.parse(await readFile(FIXT, 'utf8')); }

test('source name is "mcp-registry"', () => {
  assert.equal(reg.name, 'mcp-registry');
});

test('serverName folds the whole namespaced name into a collision-safe token', () => {
  assert.equal(reg.serverName('ai.adeu/adeu'), 'ai-adeu-adeu');
  assert.equal(reg.serverName('ac.inference.sh/mcp'), 'ac-inference-sh-mcp');
  assert.equal(reg.serverName('io.github.foo/npm-srv'), 'io-github-foo-npm-srv');
  assert.equal(reg.serverName('///'), 'mcp');                 // degenerate -> fallback
});

test('extractRepo pulls github owner/repo from repository.url', () => {
  assert.equal(reg.extractRepo({ repository: { url: 'https://github.com/Foo/Bar' } }), 'github:foo/bar');
  assert.equal(reg.extractRepo({ repository: { url: 'https://gitlab.com/a/b' } }), null);
  assert.equal(reg.extractRepo({}), null);
});

test('installFor builds npm/pypi package commands (name-first)', () => {
  const npmSrv = { name: 'io.github.foo/npm-srv', packages: [{ registryType: 'npm', identifier: '@foo/npm-srv' }] };
  assert.deepEqual(reg.installFor(npmSrv), { method: 'mcp', command: 'claude mcp add io-github-foo-npm-srv -- npx -y @foo/npm-srv', package: '@foo/npm-srv' });
  const pypiSrv = { name: 'ai.adeu/adeu', packages: [{ registryType: 'pypi', identifier: 'adeu' }] };
  assert.deepEqual(reg.installFor(pypiSrv), { method: 'mcp', command: 'claude mcp add ai-adeu-adeu -- uvx adeu', package: 'adeu' });
});

test('installFor builds remote http/sse commands (flags before name)', () => {
  const http = { name: 'ac.inference.sh/mcp', remotes: [{ type: 'streamable-http', url: 'https://api.inference.sh/mcp' }] };
  assert.deepEqual(reg.installFor(http), { method: 'mcp', command: 'claude mcp add --transport http ac-inference-sh-mcp https://api.inference.sh/mcp', package: null });
  const sse = { name: 'com.example/sse-srv', remotes: [{ type: 'sse', url: 'https://example.com/sse' }] };
  assert.deepEqual(reg.installFor(sse), { method: 'mcp', command: 'claude mcp add --transport sse com-example-sse-srv https://example.com/sse', package: null });
});

test('installFor returns null for oci-only, no-targets, and unsafe values', () => {
  assert.equal(reg.installFor({ name: 'x/y', packages: [{ registryType: 'oci', identifier: 'a/b' }] }), null);
  assert.equal(reg.installFor({ name: 'x/y' }), null);
  assert.equal(reg.installFor({ name: 'x/y', packages: [{ registryType: 'npm', identifier: 'evil && rm -rf /' }] }), null);
  assert.equal(reg.installFor({ name: 'x/y', remotes: [{ type: 'streamable-http', url: 'http://insecure.com/x' }] }), null); // not https
});

test('parseRegistry dedupes to latest, skips non-installable, builds candidate-shaped caps', async () => {
  const caps = reg.parseRegistry(await fixture(), { now: NOW });
  // npm(latest only) + pypi + http + sse = 4; oci/no-targets/injection skipped; npm-srv dup folded
  assert.equal(caps.length, 4);

  const npmCap = caps.find((c) => c.id === 'mcp-registry::io.github.foo/npm-srv::mcp');
  assert.ok(npmCap, 'npm cap present');
  assert.equal(npmCap.kind, 'mcp');
  assert.equal(npmCap.description, 'An npm MCP server (newer)');  // latest version won
  assert.equal(npmCap.source.discoveredVia, 'mcp-registry');
  assert.equal(npmCap.source.repo, 'github:foo/npm-srv');
  assert.equal(npmCap.install.command, 'claude mcp add io-github-foo-npm-srv -- npx -y @foo/npm-srv');
  assert.equal(npmCap.lastSeen, NOW);

  assert.ok(caps.some((c) => c.install.command.includes('--transport http')));
  assert.ok(caps.some((c) => c.install.command.includes('--transport sse')));
});

test('parseRegistry applies the per-source cap', async () => {
  const caps = reg.parseRegistry(await fixture(), { now: NOW, cap: 1 });
  assert.equal(caps.length, 1);
});

test('collect fetches and parses via injected fetchJson', async () => {
  const json = await fixture();
  const res = await reg.collect({ fetchJson: async () => json, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 4);
});

test('collect returns ok:false when the fetch fails', async () => {
  const res = await reg.collect({ fetchJson: async () => null, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});

test('collect returns ok:false when fetchJson is not a function', async () => {
  const res = await reg.collect({ now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
