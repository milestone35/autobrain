const KIND_ACTION = {
  bang: 'run_shell',
  'builtin-tool': 'use_tool',
  slash: 'invoke_slash',
  'builtin-agent': 'dispatch_agent',
  agent: 'dispatch_agent',
  skill: 'invoke_skill',
  command: 'invoke_slash',
  mcp: 'call_mcp',
  plugin: 'use_directly'
};

export function actionFor(kind) {
  return KIND_ACTION[kind] ?? 'use_directly';
}

const READ_ONLY = new Map([
  ['builtin-tool', new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])],
  ['builtin-agent', new Set(['Explore', 'Plan'])],
  ['slash', new Set(['/review', '/security-review', '/code-review'])]
]);

// "Not recognized as definitely read-only" => side-effecting (fail-safe).
// Map.get never walks the prototype chain, so prototype keys (__proto__, etc.) are safe.
export function classifyRisk(step) {
  const ro = READ_ONLY.get(step?.kind);
  return ro && ro.has(step?.name) ? 'read-only' : 'side-effecting';
}
