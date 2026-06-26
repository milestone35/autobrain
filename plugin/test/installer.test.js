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
  assert.deepEqual(plan, [{ id: 'mp::p::skill::a', command: 'claude plugin install mp::p::skill::a', trust: 'trusted', mode: 'auto', method: 'plugin' }]);
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

import { executeInstalls } from '../lib/installer.js';

// Stateful fake: run() marks a command installed; isInstalled/verify read that state.
function fakeEnv({ approveAll = false, verifyAfterRun = true, preInstalled = [] } = {}) {
  const installed = new Set(preInstalled);            // by command
  const calls = { run: [], approve: [] };
  return {
    calls,
    env: {
      run: async (command) => { calls.run.push(command); if (verifyAfterRun) installed.add(command); },
      isInstalled: async (item) => installed.has(item.command),
      verify: async (item) => installed.has(item.command),
      approve: async (item) => { calls.approve.push(item.id); return approveAll; },
      log: () => {}
    }
  };
}
const item = (id, mode) => ({ id, command: `cmd:${id}`, trust: mode === 'approval' ? 'candidate' : 'trusted', mode });

test('executeInstalls runs an auto item and verifies it installed', async () => {
  const { env, calls } = fakeEnv();
  const res = await executeInstalls([item('a', 'auto')], env);
  assert.deepEqual(res, [{ id: 'a', status: 'installed' }]);
  assert.deepEqual(calls.run, ['cmd:a']);
});

test('executeInstalls reports failed when post-run verify is false', async () => {
  const { env, calls } = fakeEnv({ verifyAfterRun: false });
  const res = await executeInstalls([item('a', 'auto')], env);
  assert.equal(res[0].status, 'failed');
  assert.deepEqual(calls.run, ['cmd:a']);          // it tried
});

test('executeInstalls does NOT run an approval item without approval', async () => {
  const { env, calls } = fakeEnv({ approveAll: false });
  const res = await executeInstalls([item('b', 'approval')], env);
  assert.equal(res[0].status, 'needs-approval');
  assert.deepEqual(calls.run, []);                 // never ran
  assert.deepEqual(calls.approve, ['b']);
});

test('executeInstalls runs an approval item once approved', async () => {
  const { env, calls } = fakeEnv({ approveAll: true });
  const res = await executeInstalls([item('b', 'approval')], env);
  assert.equal(res[0].status, 'installed');
  assert.deepEqual(calls.run, ['cmd:b']);
});

test('executeInstalls skips an already-installed item without running', async () => {
  const { env, calls } = fakeEnv({ preInstalled: ['cmd:a'] });
  const res = await executeInstalls([item('a', 'auto')], env);
  assert.equal(res[0].status, 'already-installed');
  assert.deepEqual(calls.run, []);
});

test('executeInstalls reports skip-mode items without running', async () => {
  const { env, calls } = fakeEnv();
  const res = await executeInstalls([item('a', 'skip')], env);
  assert.equal(res[0].status, 'skipped');
  assert.equal(res[0].command, 'cmd:a');
  assert.deepEqual(calls.run, []);
});

test('executeInstalls catches a throwing run and continues to the next item', async () => {
  const installed = new Set();
  const runCalls = [];
  const env = {
    run: async (command) => { runCalls.push(command); if (command === 'cmd:a') throw new Error('boom'); installed.add(command); },
    isInstalled: async () => false,
    verify: async (it) => installed.has(it.command),
    approve: async () => true,
    log: () => {}
  };
  const res = await executeInstalls([item('a', 'auto'), item('c', 'auto')], env);
  assert.equal(res[0].status, 'failed');
  assert.match(res[0].error, /boom/);
  assert.equal(res[1].status, 'installed');        // continued
  assert.deepEqual(runCalls, ['cmd:a', 'cmd:c']);
});

test('planInstalls skips builtin capabilities (install:null => not runnable)', () => {
  const map = { capabilities: [
    { id: 'builtin::core::bang::shell', trust: 'builtin', install: null },
    { id: 'mp::p::skill::s', trust: 'trusted', install: { command: 'claude plugin install p@mp' } }
  ] };
  const decision = { installs: ['builtin::core::bang::shell', 'mp::p::skill::s'] };
  const plan = planInstalls(decision, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.id), ['mp::p::skill::s']);  // builtin absent
});

test('planInstalls carries install.method (mcp vs plugin)', () => {
  const map = { capabilities: [
    { id: 'npm::x::mcp', trust: 'candidate', install: { method: 'mcp', command: 'claude mcp add x -- npx -y x' } },
    { id: 'mp::p::skill::a', trust: 'trusted', install: { method: 'plugin', command: 'claude plugin install p@mp' } }
  ] };
  const plan = planInstalls({ installs: ['npm::x::mcp', 'mp::p::skill::a'] }, map, { autoInstall: true });
  assert.deepEqual(plan.map((p) => p.method), ['mcp', 'plugin']);
});
