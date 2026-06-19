const DECISIONS = new Set(['use_existing', 'install_then_use', 'no_capability_needed']);

export function validateDecision(obj = {}) {
  const errs = [];
  if (!DECISIONS.has(obj?.decision)) errs.push(`decision must be one of ${[...DECISIONS].join('|')}`);
  if (!Array.isArray(obj?.capabilities) || !obj.capabilities.every((x) => typeof x === 'string'))
    errs.push('capabilities must be a string[]');
  if (!Array.isArray(obj?.installs) || !obj.installs.every((x) => typeof x === 'string'))
    errs.push('installs must be a string[]');
  if (typeof obj?.confidence !== 'number' || !Number.isFinite(obj.confidence) || obj.confidence < 0 || obj.confidence > 1)
    errs.push('confidence must be a number in [0,1]');
  if (typeof obj?.rationale !== 'string') errs.push('rationale must be a string');
  return errs;
}

function fallback(reason, confidence) {
  return { decision: 'no_capability_needed', capabilities: [], installs: [], method: '', rationale: reason, confidence };
}

export function normalizeDecision(obj, { confidenceThreshold = 0.6, knownIds = null } = {}) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const confidence = (typeof o.confidence === 'number' && Number.isFinite(o.confidence))
    ? Math.min(1, Math.max(0, o.confidence)) : 0;
  const method = typeof o.method === 'string' ? o.method : '';
  const rationale = typeof o.rationale === 'string' ? o.rationale : '';
  const filterIds = (arr) => {
    const a = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    return knownIds ? a.filter((id) => knownIds.has(id)) : a;
  };
  const capabilities = filterIds(o.capabilities);
  let installs = filterIds(o.installs);
  const decision = DECISIONS.has(o.decision) ? o.decision : 'no_capability_needed';

  if (confidence < confidenceThreshold) return fallback('confidence below threshold', confidence);

  if (decision === 'use_existing' || decision === 'no_capability_needed') installs = [];
  if (decision === 'use_existing' && capabilities.length === 0) return fallback('use_existing with no known capabilities', confidence);
  if (decision === 'install_then_use' && installs.length === 0) return fallback('install_then_use with no installs', confidence);

  return { decision, capabilities, installs, method, rationale, confidence };
}
