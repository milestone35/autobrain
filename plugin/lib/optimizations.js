// Project optimization checklist for autobrain's /autobrain-tune.
// Pure + side-effect-free: each check detects a signal in a pre-gathered `state`
// object and declares how to remediate it. Detection I/O lives in cli.js (DI'd).
// `remediation.kind`: 'slash' (run a slash command), 'skill' (invoke a skill),
// or 'advisory' (just inform — no canonical auto-fix). `risk`: 'side-effect' | 'none'.
export const CHECKS = [
  {
    id: 'claude-md',
    title: 'CLAUDE.md (proje yönergeleri)',
    detect: (s) => Boolean(s.hasClaudeMd),
    remediation: { kind: 'slash', target: '/init', risk: 'side-effect' }
  },
  {
    id: 'permissions-allowlist',
    title: 'İzin allowlist (.claude/settings.json)',
    detect: (s) => (s.permissionsAllowCount || 0) > 0,
    remediation: { kind: 'skill', target: 'fewer-permission-prompts', risk: 'side-effect' }
  },
  {
    id: 'hooks',
    title: 'Hook yapılandırması',
    detect: (s) => Boolean(s.hasHooks),
    remediation: { kind: 'advisory', target: 'update-config', risk: 'none' }
  }
];

// Evaluate every check against the gathered state. Safe on a missing/partial state
// (a missing field reads as falsy => 'missing'); never throws.
export function evaluateChecks(state) {
  const s = state || {};
  return CHECKS.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.detect(s) ? 'ok' : 'missing',
    remediation: c.remediation
  }));
}
