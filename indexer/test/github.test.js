import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as github from '../src/sources/github.js';

const NOW = '2026-06-25T00:00:00Z';

const CODE_SEARCH = {
  items: [
    { repository: { full_name: 'Owner/Repo' }, path: '.claude-plugin/marketplace.json' },
    { repository: { full_name: 'Owner/Repo' }, path: '.claude-plugin/marketplace.json' }, // dup
    { repository: { full_name: 'a/b' }, path: '.claude-plugin/marketplace.json' },
    { path: 'no-repo.json' } // malformed, skipped
  ]
};
const MANIFEST = { name: 'cool-mp', plugins: [{ name: 'sec-audit', description: 'Audit security' }] };

test('source name is "github"', () => {
  assert.equal(github.name, 'github');
});

test('parseCodeSearch dedupes repos and skips malformed items', () => {
  const repos = github.parseCodeSearch(CODE_SEARCH);
  assert.deepEqual(repos.map((r) => r.fullName), ['Owner/Repo', 'a/b']);
  assert.deepEqual(repos[0], { owner: 'Owner', repo: 'Repo', fullName: 'Owner/Repo', path: '.claude-plugin/marketplace.json' });
});

test('rawManifestUrl builds a HEAD raw URL', () => {
  assert.equal(
    github.rawManifestUrl({ fullName: 'Owner/Repo', path: '.claude-plugin/marketplace.json' }),
    'https://raw.githubusercontent.com/Owner/Repo/HEAD/.claude-plugin/marketplace.json'
  );
});

test('collect fetches search + manifests and emits candidate plugin caps', async () => {
  const fetchJson = async (url) => {
    if (url.includes('/search/code')) return CODE_SEARCH;
    if (url.includes('raw.githubusercontent.com/Owner/Repo')) return MANIFEST;
    return null; // a/b has no manifest -> skipped
  };
  const res = await github.collect({ fetchJson, now: NOW, githubToken: null });
  assert.equal(res.ok, true);
  assert.equal(res.capabilities.length, 1);
  const c = res.capabilities[0];
  assert.equal(c.kind, 'plugin');
  assert.equal(c.name, 'sec-audit');
  assert.equal(c.source.discoveredVia, 'github');
  assert.equal(c.source.repo, 'github:owner/repo');
  assert.equal(c.install.method, 'plugin');
  assert.equal(c.install.command, 'claude plugin marketplace add Owner/Repo && claude plugin install sec-audit@cool-mp');
});

test('collect returns ok:false when the search call fails', async () => {
  const res = await github.collect({ fetchJson: async () => null, now: NOW, githubToken: null });
  assert.equal(res.ok, false);
  assert.deepEqual(res.capabilities, []);
});
