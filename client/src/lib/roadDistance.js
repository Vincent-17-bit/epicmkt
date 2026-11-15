// Distance by road between the shop and the buyer, from an OSRM-compatible routing service when one is configured (VITE_ROUTING_URL, for example
// https://router.example.com). With none configured nothing is sent anywhere and the page uses the straight line times 1.3 (shared deliveryReach).
// Only the two points go to the service (the buyer's is already rounded to about 1 km by the location store), with no cookies and no identifiers.

const cache = new Map();
const key = (a, b) => [a.lat, a.lng, b.lat, b.lng].map((n) => Number(n).toFixed(3)).join(",");

/** { km } of the fastest driving route, or null when the service is not configured, is slow, or has no route. Never throws. */
export async function fetchRoadKm(from, to, { url = import.meta.env?.VITE_ROUTING_URL, fetchFn = globalThis.fetch, timeoutMs = 4000 } = {}) {
  if (!url || !from || !to || typeof fetchFn !== "function") return null;
  const k = key(from, to);
  if (cache.has(k)) return cache.get(k);
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const base = String(url).replace(/\/+$/, "");
    const res = await fetchFn(`${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`, { signal: ctl?.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const body = await res.json();
    const meters = body?.routes?.[0]?.distance;
    const out = Number.isFinite(meters) && meters >= 0 ? Math.round(meters / 100) / 10 : null;
    if (out !== null) cache.set(k, out);
    return out;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const clearRoadCache = () => cache.clear();
