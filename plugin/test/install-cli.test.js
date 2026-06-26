import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall, pluginListed, realEnv, verifyCmdFor, mcpListed, listed } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.sample.json');
async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-install-')); }
async function writeDecision(dir, obj) {
  const f = path.join(dir, 'decision.json');
  await writeFile(f, JSON.stringify(obj), 'utf8');
  return f;
}
function fakeEnv() {
  const installed = new Set();
  const calls = { run: [] };
  return {
    calls,
    env: {
      run: async (c) => { calls.run.push(c); installed.add(c); },
      isInstalled: async () => false,
      verify: async () => true,
      approve: async () => false,
      log: () => {}
    }
  };
}

test('runInstall installs a trusted capability (auto) via injected env', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, { decision: 'install_then_use', installs: ['mp::api-sec::skill::api-audit'], capabilities: ['mp::api-sec::skill::api-audit'], method: 'x', rationale: 'r', confidence: 0.9 });
  const { env, calls } = fakeEnv();
  const res = await runInstall({ decisionFile: f, mapFile: FIXT, config: loadConfig({ autoInstall: true }), now: '2026-06-25T00:00:00Z', env });
  assert.equal(res.results[0].status, 'installed');
  assert.equal(calls.run.length, 1);
  assert.match(res.lines.join('\n'), /installed|kuruldu/i);
  await rm(dir, { recursive: true, force: true });
});

test('runInstall reports skip (no run) when autoInstall is off', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, { decision: 'install_then_use', installs: ['mp::api-sec::skill::api-audit'], capabilities: ['mp::api-sec::skill::api-audit'], method: 'x', rationale: 'r', confidence: 0.9 });
  const { env, calls } = fakeEnv();
  const res = await runInstall({ decisionFile: f, mapFile: FIXT, config: loadConfig({ autoInstall: false }), now: '2026-06-25T00:00:00Z', env });
  assert.equal(res.results[0].status, 'skipped');
  assert.deepEqual(calls.run, []);
  await rm(dir, { recursive: true, force: true });
});

test('runInstall does NOT install a below-threshold decision (gate not bypassed)', async () => {
  const dir = await tmp();
  // Same trusted id, but low confidence — normalizeDecision must downgrade to no_capability_needed.
  const f = await writeDecision(dir, { decision: 'install_then_use', installs: ['mp::api-sec::skill::api-audit'], capabilities: ['mp::api-sec::skill::api-audit'], method: 'x', rationale: 'r', confidence: 0.3 });
  const { env, calls } = fakeEnv();
  const res = await runInstall({ decisionFile: f, mapFile: FIXT, config: loadConfig({ autoInstall: true, confidenceThreshold: 0.6 }), now: '2026-06-25T00:00:00Z', env });
  assert.deepEqual(res.results, []);          // empty plan -> nothing executed
  assert.deepEqual(calls.run, []);            // never installed
  await rm(dir, { recursive: true, force: true });
});

test('runInstall fails soft when the decision file is missing', async () => {
  const { env } = fakeEnv();
  const res = await runInstall({ decisionFile: '/no/such/decision.json', mapFile: FIXT, config: loadConfig({}), now: '2026-06-25T00:00:00Z', env });
  assert.deepEqual(res.results, []);
  assert.match(res.lines.join('\n'), /okunamad|kurulmad/i);
});

test('pluginListed matches the qualified install ref and is collision-safe', () => {
  // exact qualified ref present
  assert.equal(pluginListed('api-security-testing@claude-plugins-official\n', 'claude-plugins-official::api-security-testing::skill::x'), true);
  // plain plugin name on a word boundary
  assert.equal(pluginListed('installed: api-security-testing (desc)', 'claude-plugins-official::api-security-testing::skill::x'), true);
  // substring collision must NOT match: plugin "ai" vs "aikido" in the list
  assert.equal(pluginListed('aikido@mp\n', 'mp::ai::skill::x'), false);
  // absent
  assert.equal(pluginListed('something-else@mp', 'mp::ai::skill::x'), false);
});

test('realEnv.approve gates strictly on approvedIds (autonomy boundary wiring)', async () => {
  const env = realEnv(new Set(['mp::c::skill::ok']), () => {});
  assert.equal(await env.approve({ id: 'mp::c::skill::ok' }), true);
  assert.equal(await env.approve({ id: 'mp::c::skill::nope' }), false);
});

test('verifyCmdFor maps install method to the right list command', () => {
  assert.equal(verifyCmdFor('plugin'), 'claude plugin list');
  assert.equal(verifyCmdFor('mcp'), 'claude mcp list');
  assert.equal(verifyCmdFor('other'), null);          // unknown -> trust exit code
});

test('mcpListed matches the registered mcp name from the add command, collision-safe', () => {
  const item = { command: 'claude mcp add my-server -- npx -y @scope/pkg' };
  assert.equal(mcpListed('my-server  npx ...\n', item), true);
  assert.equal(mcpListed('my-server-extra\n', item), false);   // word boundary, no substring collision
  assert.equal(mcpListed('something-else', item), false);
});

test('mcpListed treats the "no servers configured" empty-state as not-installed', () => {
  // Regression: a generic server name (e.g. "mcp") must not match the empty-state
  // help text "No MCP servers configured. Use `claude mcp add` ...".
  const item = { command: 'claude mcp add mcp -- npx -y @ai-sdk/mcp' };
  assert.equal(mcpListed('No MCP servers configured. Use `claude mcp add` to add a server.', item), false);
});

test('listed dispatches by method (mcp vs plugin)', () => {
  const mcpItem = { method: 'mcp', command: 'claude mcp add srv -- npx -y p' };
  const pluginItem = { method: 'plugin', id: 'mp::api-sec::skill::x' };
  assert.equal(listed('mcp', 'srv\n', mcpItem), true);
  assert.equal(listed('plugin', 'api-sec@mp\n', pluginItem), true);
});
