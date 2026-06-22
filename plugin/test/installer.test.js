import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInstalls } from '../lib/installer.js';

function mapWith(caps) {
  return { schemaVersion: 1, capabilities: caps };
}
function cap(id, trust, command = `claude plugin install ${id}`) {
  return { id, trust, install: command ? { method: 'plugin', command, package: null } : null };
}

test('planInstalls marks trusted as auto when autoInstall is on', () => {
  const map = mapWith([cap('mp::p::skill::a', 'trusted')]);
  const plan = planInstalls({ installs: ['mp::p::skill::a'] }, map, { autoInstall: true });
  assert.deepEqual(plan, [{ id: 'mp::p::skill::a', command: 'claude plugin install mp::p::skill::a', trust: 'trusted', mode: 'auto' }]);
});

test('planInstalls marks trusted as skip when autoInstall is off', () => {
  const map = mapWith([cap('mp::p::skill::a', 'trusted')]);
  const plan = planInstalls({ installs: ['mp::p::skill::a'] }, map, { autoInstall: false });
  assert.equal(plan[0].mode, 'skip');
});

test('planInstalls marks candidate and unknown as approval', () => {
  const map = mapWith([cap('mp::c::skill::b', 'candidate'), cap('mp::u::skill::c', 'unknown')]);
  const plan = planInstalls({ installs: ['mp::c::skill::b', 'mp::u::skill::c'] }, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.mode), ['approval', 'approval']);
});

test('planInstalls skips ids absent from the map and items without a command', () => {
  const map = mapWith([cap('mp::p::skill::a', 'trusted'), cap('mp::p::skill::nocmd', 'trusted', '')]);
  const plan = planInstalls({ installs: ['mp::ghost::skill::x', 'mp::p::skill::a', 'mp::p::skill::nocmd'] }, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.id), ['mp::p::skill::a']);
});

test('planInstalls returns [] for empty/missing installs', () => {
  assert.deepEqual(planInstalls({ installs: [] }, mapWith([]), { autoInstall: true }), []);
  assert.deepEqual(planInstalls({}, mapWith([]), { autoInstall: true }), []);
});
