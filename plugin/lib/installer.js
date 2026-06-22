export function planInstalls(decision, map, { autoInstall = true } = {}) {
  const ids = Array.isArray(decision?.installs) ? decision.installs : [];
  const byId = new Map((map?.capabilities || []).map((c) => [c.id, c]));
  const plan = [];
  for (const id of ids) {
    const cap = byId.get(id);
    if (!cap) continue;                       // not in map -> skip (defense; SP3 already strips)
    const command = cap.install?.command ?? null;
    if (!command) continue;                   // nothing runnable
    const mode = cap.trust === 'trusted'
      ? (autoInstall ? 'auto' : 'skip')
      : 'approval';                           // candidate | unknown
    plan.push({ id, command, trust: cap.trust, mode });
  }
  return plan;
}
