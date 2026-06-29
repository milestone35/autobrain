import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { countListed, runInstalledCount } from '../lib/cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

test('countListed counts plugins from `claude plugin list` output', () => {
  assert.equal(countListed('plugin', read('plugin-list.sample.txt')), 3);
});
test('countListed counts mcp servers from `claude mcp list` output', () => {
  assert.equal(countListed('mcp', read('mcp-list.sample.txt')), 2);
});
test('countListed returns 0 on mcp empty-state help text', () => {
  assert.equal(countListed('mcp', 'No MCP servers configured. Use `claude mcp add` to add a server.'), 0);
});
test('countListed returns 0 on empty plugin output', () => {
  assert.equal(countListed('plugin', ''), 0);
});
test('runInstalledCount sums plugin+mcp via injected probe', async () => {
  const probe = async (cmd) => ({
    ok: true,
    text: cmd.includes('plugin') ? read('plugin-list.sample.txt') : read('mcp-list.sample.txt')
  });
  assert.deepEqual(await runInstalledCount({ probe }), { plugins: 3, mcp: 2, total: 5 });
});
test('runInstalledCount fail-soft: probe failure => 0, no throw', async () => {
  const probe = async () => ({ ok: false, text: '' });
  assert.deepEqual(await runInstalledCount({ probe }), { plugins: 0, mcp: 0, total: 0 });
});
test('runInstalledCount fail-soft: throwing probe => 0, no throw', async () => {
  const probe = async () => { throw new Error('unavailable'); };
  assert.deepEqual(await runInstalledCount({ probe }), { plugins: 0, mcp: 0, total: 0 });
});
