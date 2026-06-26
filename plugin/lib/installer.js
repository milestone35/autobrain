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
    plan.push({ id, command, trust: cap.trust, mode, method: cap.install?.method ?? 'plugin' });
  }
  return plan;
}

export async function executeInstalls(plan, { run, isInstalled, verify, approve, log = () => {} } = {}) {
  const results = [];
  for (const item of plan) {
    try {
      if (await isInstalled(item)) {
        results.push({ id: item.id, status: 'already-installed' });
        continue;
      }
      if (item.mode === 'skip') {
        results.push({ id: item.id, status: 'skipped', command: item.command });
        continue;
      }
      if (item.mode === 'approval' && !(await approve(item))) {
        results.push({ id: item.id, status: 'needs-approval', command: item.command });
        continue;
      }
      await run(item.command);                       // 'auto' or approved 'approval'
      const ok = await verify(item);
      results.push(ok
        ? { id: item.id, status: 'installed' }
        : { id: item.id, status: 'failed', command: item.command, error: 'doğrulama başarısız (kurulum sonrası görünmüyor)' });
    } catch (e) {
      log(`install ${item.id} failed: ${e.message}`);
      results.push({ id: item.id, status: 'failed', command: item.command, error: e.message });
    }
  }
  return results;
}
