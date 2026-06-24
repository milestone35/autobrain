import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionFor } from '../lib/execution.js';

test('actionFor maps each kind to its execution action', () => {
  assert.equal(actionFor('bang'), 'run_shell');
  assert.equal(actionFor('builtin-tool'), 'use_tool');
  assert.equal(actionFor('slash'), 'invoke_slash');
  assert.equal(actionFor('builtin-agent'), 'dispatch_agent');
  assert.equal(actionFor('agent'), 'dispatch_agent');
  assert.equal(actionFor('skill'), 'invoke_skill');
  assert.equal(actionFor('command'), 'invoke_slash');
  assert.equal(actionFor('mcp'), 'call_mcp');
  assert.equal(actionFor('plugin'), 'use_directly');
});

test('actionFor falls back to use_directly for unknown kinds', () => {
  assert.equal(actionFor('nonsense'), 'use_directly');
  assert.equal(actionFor(undefined), 'use_directly');
});
