import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionFor, classifyRisk, directiveFor, planExecution } from '../lib/execution.js';

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

test('classifyRisk: read-only allow-list entries are read-only', () => {
  for (const name of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) {
    assert.equal(classifyRisk({ kind: 'builtin-tool', name }), 'read-only');
  }
  for (const name of ['Explore', 'Plan']) {
    assert.equal(classifyRisk({ kind: 'builtin-agent', name }), 'read-only');
  }
  for (const name of ['/review', '/security-review', '/code-review']) {
    assert.equal(classifyRisk({ kind: 'slash', name }), 'read-only');
  }
});

test('classifyRisk: bang and mutating builtin tools are side-effecting', () => {
  assert.equal(classifyRisk({ kind: 'bang', name: 'shell' }), 'side-effecting');
  for (const name of ['Write', 'Edit', 'Bash', 'Task']) {
    assert.equal(classifyRisk({ kind: 'builtin-tool', name }), 'side-effecting');
  }
  for (const name of ['general-purpose', 'code-reviewer']) {
    assert.equal(classifyRisk({ kind: 'builtin-agent', name }), 'side-effecting');
  }
});

test('classifyRisk: installable kinds are side-effecting', () => {
  assert.equal(classifyRisk({ kind: 'skill', name: 'whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'agent', name: 'whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'command', name: '/whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'mcp', name: 'whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'plugin', name: 'whatever' }), 'side-effecting');
});

test('classifyRisk: unrecognized builtin name is side-effecting (fail-safe)', () => {
  assert.equal(classifyRisk({ kind: 'builtin-tool', name: 'FutureTool' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'builtin-agent', name: 'future-agent' }), 'side-effecting');
});

test('classifyRisk: prototype-key kinds are side-effecting (no crash)', () => {
  assert.equal(classifyRisk({ kind: '__proto__', name: 'Read' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'constructor', name: 'call' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'toString', name: 'x' }), 'side-effecting');
});

test('actionFor: prototype-key kinds fall back to use_directly (no leak)', () => {
  assert.equal(actionFor('__proto__'), 'use_directly');
  assert.equal(actionFor('constructor'), 'use_directly');
  assert.equal(actionFor('toString'), 'use_directly');
});

const MAP = { capabilities: [
  { id: 'builtin::core::bang::shell', kind: 'bang', name: 'shell' },
  { id: 'builtin::core::builtin-tool::Grep', kind: 'builtin-tool', name: 'Grep' },
  { id: 'mp::p::skill::s', kind: 'skill', name: 's' }
] };

test('directiveFor returns an action-appropriate hint', () => {
  assert.match(directiveFor({ name: 'shell' }, 'run_shell'), /shell command/i);
  assert.match(directiveFor({ name: 'Grep' }, 'use_tool'), /Grep/);
  assert.match(directiveFor({ name: 'Explore' }, 'dispatch_agent'), /Explore/);
  assert.match(directiveFor({ name: 'foo' }, 'invoke_skill'), /foo/);
});

test('planExecution maps chosen capabilities to ordered steps with risk', () => {
  const decision = { decision: 'use_existing', capabilities: ['mp::p::skill::s', 'builtin::core::builtin-tool::Grep'] };
  const steps = planExecution(decision, MAP);
  assert.equal(steps.length, 2);
  // order preserved
  assert.deepEqual(steps.map((s) => s.id), ['mp::p::skill::s', 'builtin::core::builtin-tool::Grep']);
  assert.equal(steps[0].action, 'invoke_skill');
  assert.equal(steps[0].risk, 'side-effecting');
  assert.equal(steps[1].action, 'use_tool');
  assert.equal(steps[1].risk, 'read-only');
  assert.ok(typeof steps[0].directive === 'string' && steps[0].directive.length > 0);
});

test('planExecution skips ids not in the map (defense)', () => {
  const decision = { decision: 'use_existing', capabilities: ['mp::p::skill::s', 'ghost::id::x::y'] };
  const steps = planExecution(decision, MAP);
  assert.deepEqual(steps.map((s) => s.id), ['mp::p::skill::s']);
});

test('planExecution returns [] for no_capability_needed or empty', () => {
  assert.deepEqual(planExecution({ decision: 'no_capability_needed', capabilities: [] }, MAP), []);
  assert.deepEqual(planExecution(null, MAP), []);
});
