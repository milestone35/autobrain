// Minimal JSON fetch wrapper. fetchImpl is injected so tests never hit the network.
// Returns parsed JSON on 2xx, or null on any failure (non-2xx, network error, bad JSON).
export function makeFetchJson(fetchImpl = globalThis.fetch) {
  return async function fetchJson(url, { headers = {} } = {}) {
    let res;
    try {
      res = await fetchImpl(url, { headers: { 'User-Agent': 'cc-autopilot', ...headers } });
    } catch {
      return null;
    }
    if (!res || !res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  };
}
