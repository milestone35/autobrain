export const DEFAULTS = Object.freeze({
  enabled: true,
  mapSource: '../indexer/data/capability-map.json',
  topN: 5,
  scoreFloor: 0,
  staleDays: 14
});

const isBool = (v) => typeof v === 'boolean';
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
const isPosInt = (v) => Number.isInteger(v) && v > 0;
const isNonNegNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function loadConfig(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: isBool(r.enabled) ? r.enabled : DEFAULTS.enabled,
    mapSource: isStr(r.mapSource) ? r.mapSource : DEFAULTS.mapSource,
    topN: isPosInt(r.topN) ? r.topN : DEFAULTS.topN,
    scoreFloor: isNonNegNum(r.scoreFloor) ? r.scoreFloor : DEFAULTS.scoreFloor,
    staleDays: isNonNegInt(r.staleDays) ? r.staleDays : DEFAULTS.staleDays
  };
}
