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
