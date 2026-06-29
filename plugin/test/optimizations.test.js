import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecks, CHECKS } from '../lib/optimizations.js';

test('CHECKS has the three expected ids in order', () => {
  assert.deepEqual(CHECKS.map((c) => c.id), ['claude-md', 'permissions-allowlist', 'hooks']);
});

test('evaluateChecks: all present => all ok', () => {
  const res = evaluateChecks({ hasClaudeMd: true, permissionsAllowCount: 3, hasHooks: true });
  assert.deepEqual(res.map((c) => c.status), ['ok', 'ok', 'ok']);
});

test('evaluateChecks: claude-md missing => /init slash remediation', () => {
  const res = evaluateChecks({ hasClaudeMd: false, permissionsAllowCount: 3, hasHooks: true });
  const cm = res.find((c) => c.id === 'claude-md');
  assert.equal(cm.status, 'missing');
  assert.deepEqual(cm.remediation, { kind: 'slash', target: '/init', risk: 'side-effect' });
});

test('evaluateChecks: permissions empty => fewer-permission-prompts skill remediation', () => {
  const res = evaluateChecks({ hasClaudeMd: true, permissionsAllowCount: 0, hasHooks: true });
  const p = res.find((c) => c.id === 'permissions-allowlist');
  assert.equal(p.status, 'missing');
  assert.equal(p.remediation.kind, 'skill');
  assert.equal(p.remediation.target, 'fewer-permission-prompts');
});

test('evaluateChecks: hooks missing => advisory remediation (no side-effect)', () => {
  const res = evaluateChecks({ hasClaudeMd: true, permissionsAllowCount: 3, hasHooks: false });
  const h = res.find((c) => c.id === 'hooks');
  assert.equal(h.status, 'missing');
  assert.equal(h.remediation.kind, 'advisory');
  assert.equal(h.remediation.risk, 'none');
});

test('evaluateChecks: undefined state => all missing, no throw', () => {
  const res = evaluateChecks(undefined);
  assert.deepEqual(res.map((c) => c.status), ['missing', 'missing', 'missing']);
});
