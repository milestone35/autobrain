import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as pypi from '../src/sources/pypi.js';

const NOW = '2026-06-26T00:00:00Z';

const GIT_PKG = {
  info: {
    name: 'mcp-server-git',
    summary: 'A Git MCP server',
    keywords: 'git, mcp, llm',
    home_page: null,
    project_urls: { Homepage: 'https://modelcontextprotocol.io', Repository: 'https://github.com/Owner/Repo.git' }
  }
};

test('source name is "pypi"', () => {
  assert.equal(pypi.name, 'pypi');
});

test('serverName folds non-alphanumerics into a collision-safe token', () => {
  assert.equal(pypi.serverName('mcp-server-git'), 'mcp-server-git');
  assert.equal(pypi.serverName('awslabs.core-mcp-server'), 'awslabs-core-mcp-server');
  assert.equal(pypi.serverName('///'), 'mcp');
});

test('parsePypiSeeds keeps safe string names and drops unsafe/non-string', () => {
  const seeds = pypi.parsePypiSeeds({ packages: ['mcp-server-git', 'bad name!', '-rf', 42, '', 'ok.pkg_1'] });
  assert.deepEqual(seeds, ['mcp-server-git', 'ok.pkg_1']);
});

test('parsePypiSeeds returns [] when packages is missing or not an array', () => {
  assert.deepEqual(pypi.parsePypiSeeds({}), []);
  assert.deepEqual(pypi.parsePypiSeeds({ packages: 'x' }), []);
  assert.deepEqual(pypi.parsePypiSeeds(null), []);
});

test('extractRepo finds github in project_urls or home_page, else null', () => {
  assert.equal(pypi.extractRepo({ project_urls: { Repository: 'https://github.com/Owner/Repo.git' } }), 'github:owner/repo');
  assert.equal(pypi.extractRepo({ project_urls: { Homepage: 'https://example.com' }, home_page: 'https://github.com/a/b' }), 'github:a/b');
  assert.equal(pypi.extractRepo({ project_urls: { Homepage: 'https://example.com' } }), null);
  assert.equal(pypi.extractRepo({}), null);
});

test('pypiKeywords merges comma/space-split info.keywords with derived terms', () => {
  const kw = pypi.pypiKeywords(GIT_PKG.info);
  assert.ok(kw.includes('git'));
  assert.ok(kw.includes('mcp'));
  assert.ok(kw.includes('llm'));
  assert.ok(kw.includes('server'));
  assert.equal(kw.length, new Set(kw).size);
});

test('buildCap builds a candidate-shaped mcp cap with a uvx command', () => {
  const c = pypi.buildCap(GIT_PKG, { now: NOW });
  assert.equal(c.id, 'pypi::mcp-server-git::mcp');
  assert.equal(c.kind, 'mcp');
  assert.equal(c.source.marketplace, 'pypi');
  assert.equal(c.source.discoveredVia, 'pypi');
  assert.equal(c.source.repo, 'github:owner/repo');
  assert.equal(c.install.method, 'mcp');
  assert.equal(c.install.package, 'mcp-server-git');
  assert.equal(c.install.command, 'claude mcp add mcp-server-git -- uvx mcp-server-git');
  assert.equal(c.lastSeen, NOW);
});

test('buildCap folds a dotted name for the add-name but keeps the real package for uvx', () => {
  const c = pypi.buildCap({ info: { name: 'awslabs.core-mcp-server', summary: 'x' } }, { now: NOW });
  assert.equal(c.install.command, 'claude mcp add awslabs-core-mcp-server -- uvx awslabs.core-mcp-server');
  assert.equal(c.install.package, 'awslabs.core-mcp-server');
});

test('buildCap returns null for missing or unsafe names', () => {
  assert.equal(pypi.buildCap({ info: {} }, { now: NOW }), null);
  assert.equal(pypi.buildCap({ info: { name: '-rf' } }, { now: NOW }), null);
  assert.equal(pypi.buildCap({}, { now: NOW }), null);
});

async function seedFile(packages) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cc-pypi-'));
  const file = path.join(dir, 'pypi-seeds.json');
  await writeFile(file, JSON.stringify({ packages }), 'utf8');
  return { dir, file };
}

test('collect reads seeds and builds caps via injected fetchJson (per-package fail-soft)', async () => {
  const { dir, file } = await seedFile(['mcp-server-git', 'missing-pkg', 'bad name!']);
  const fetchJson = async (url) => (url.includes('/mcp-server-git/') ? GIT_PKG : null);
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: file }, fetchJson, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 1);
  assert.equal(res.capabilities[0].id, 'pypi::mcp-server-git::mcp');
  await rm(dir, { recursive: true, force: true });
});

test('collect returns ok:false when fetchJson is not a function', async () => {
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: '/x' }, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});

test('collect returns ok:false when the seed file is missing', async () => {
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: '/no/such/pypi-seeds.json' }, fetchJson: async () => GIT_PKG, now: NOW });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});

test('collect returns ok:true with [] for an empty seed list', async () => {
  const { dir, file } = await seedFile([]);
  const res = await pypi.collect({ sourcePaths: { pypiSeeds: file }, fetchJson: async () => GIT_PKG, now: NOW });
  assert.equal(res.ok, true);
  assert.deepEqual(res.capabilities, []);
  await rm(dir, { recursive: true, force: true });
});
