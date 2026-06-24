const KIND_ACTION = new Map([
  ['bang', 'run_shell'],
  ['builtin-tool', 'use_tool'],
  ['slash', 'invoke_slash'],
  ['builtin-agent', 'dispatch_agent'],
  ['agent', 'dispatch_agent'],
  ['skill', 'invoke_skill'],
  ['command', 'invoke_slash'],
  ['mcp', 'call_mcp'],
  ['plugin', 'use_directly']
]);

// Map.get never walks the prototype chain, so prototype keys (__proto__, etc.) fall back safely.
export function actionFor(kind) {
  return KIND_ACTION.get(kind) ?? 'use_directly';
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

export function directiveFor(cap, action) {
  const name = cap?.name ?? '';
  switch (action) {
    case 'run_shell': return "Compose and run the single shell command that fulfills the user's request.";
    case 'use_tool': return `Use the ${name} tool to fulfill the request.`;
    case 'invoke_slash': return `Invoke the ${name} command.`;
    case 'dispatch_agent': return `Dispatch the ${name} agent via the Task tool.`;
    case 'invoke_skill': return `Invoke the ${name} skill.`;
    case 'call_mcp': return `Call the ${name} MCP tool.`;
    default: return `Use ${name} directly as appropriate.`;
  }
}

export function planExecution(decision, map) {
  if (!decision || decision.decision === 'no_capability_needed') return [];
  const byId = new Map((map?.capabilities || []).map((c) => [c.id, c]));
  const steps = [];
  for (const id of decision.capabilities || []) {
    const cap = byId.get(id);
    if (!cap) continue;
    const action = actionFor(cap.kind);
    const risk = classifyRisk({ kind: cap.kind, name: cap.name });
    steps.push({ id, name: cap.name, kind: cap.kind, action, risk, directive: directiveFor(cap, action) });
  }
  return steps;
}
