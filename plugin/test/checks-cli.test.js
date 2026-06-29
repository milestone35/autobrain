import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { gatherProjectState, runChecks } from '../lib/cli.js';

const ROOT = '/proj';
const j = (...p) => path.join(ROOT, ...p);

test('gatherProjectState: detects CLAUDE.local.md variant', async () => {
  const exists = (p) => p === j('CLAUDE.local.md');
  const readJson = async () => null;
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.equal(s.hasClaudeMd, true);
});

test('gatherProjectState: sums permissions.allow across both settings files', async () => {
  const exists = () => false;
  const readJson = async (p) => {
    if (p === j('.claude', 'settings.json')) return { permissions: { allow: ['a', 'b'] } };
    if (p === j('.claude', 'settings.local.json')) return { permissions: { allow: ['c'] } };
    return null;
  };
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.equal(s.permissionsAllowCount, 3);
  assert.equal(s.hasClaudeMd, false);
});

test('gatherProjectState: detects hooks block', async () => {
  const exists = () => false;
  const readJson = async (p) =>
    p === j('.claude', 'settings.json') ? { hooks: { Stop: [{ hooks: [] }] } } : null;
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.equal(s.hasHooks, true);
});

test('gatherProjectState: fail-soft when settings missing/broken (readJson null)', async () => {
  const exists = () => false;
  const readJson = async () => null;     // missing file or broken JSON both surface as null
  const s = await gatherProjectState({ root: ROOT, exists, readJson });
  assert.deepEqual(s, { hasClaudeMd: false, permissionsAllowCount: 0, hasHooks: false });
});

test('runChecks returns { root, checks } with evaluated statuses', async () => {
  const exists = (p) => p === j('CLAUDE.md');
  const readJson = async () => null;
  const res = await runChecks({ root: ROOT, exists, readJson });
  assert.equal(res.root, ROOT);
  assert.equal(res.checks.find((c) => c.id === 'claude-md').status, 'ok');
  assert.equal(res.checks.find((c) => c.id === 'permissions-allowlist').status, 'missing');
  assert.equal(res.checks.find((c) => c.id === 'hooks').status, 'missing');
});
