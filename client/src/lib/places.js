import { TOWNS, normalizeText } from "@epicmkt/shared";

const cache = new Map();
const MAX_SHOWN = 8;

const get = async (query, { signal, fetchFn = globalThis.fetch, timeoutMs = 4000 } = {}) => {
  if (typeof fetchFn !== "function") return [];
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const stop = () => ctl?.abort();
  signal?.addEventListener?.("abort", stop);
  const timer = ctl ? setTimeout(stop, timeoutMs) : null;
  try {
    const res = await fetchFn(`/api/geocode?${query}`, { signal: ctl?.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.results) ? body.results : [];
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.("abort", stop);
  }
};

/** Towns from the built-in list that match what was typed (start of the name first, then anywhere in it or its county). */
export function matchTowns(text, towns = TOWNS) {
  const q = normalizeText(text);
  if (q.length < 1) return [];
  const rows = towns.map((t) => ({ t, name: normalizeText(t.name), county: normalizeText(t.county) }));
  const starts = rows.filter((r) => r.name.startsWith(q));
  const within = rows.filter((r) => !r.name.startsWith(q) && (r.name.includes(q) || r.county.startsWith(q)));
  return [...starts, ...within].map(({ t }) => ({ name: t.name, label: t.name === t.county ? t.name : `${t.name}, ${t.county}`, lat: t.lat, lng: t.lng, kind: "town" }));
}

/** Join towns and online results: a place the list already has (same name) is shown once, the online one only when it adds something. */
export function mergePlaces(local, remote) {
  const seen = new Set(local.map((p) => normalizeText(p.name)));
  const extra = remote.filter((p) => !seen.has(normalizeText(p.name)) && !seen.has(normalizeText(p.label)));
  const keys = new Set();
  return [...local.slice(0, 3), ...extra, ...local.slice(3)].filter((p) => {
    const k = normalizeText(p.label);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  }).slice(0, MAX_SHOWN);
}

/** Kenyan areas for what was typed: [{ name, label, lat, lng, kind }]. Never throws; an offline or failed lookup gives []. */
export async function searchPlaces(text, options) {
  const q = String(text ?? "").trim();
  if (q.length < 2) return [];
  const key = normalizeText(q);
  if (cache.has(key)) return cache.get(key);
  const found = await get(`q=${encodeURIComponent(q)}`, options);
  if (found.length) cache.set(key, found);
  return found;
}

/** The area name for a position ("Kilimani, Nairobi"), or null when it cannot be told. Never throws. */
export async function reversePlace({ lat, lng }, options) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  const found = (await get(`lat=${lat}&lng=${lng}`, options))[0] ?? null;
  const label = found?.label ? String(found.label) : null;
  if (label) cache.set(key, label);
  return label;
}

export const clearPlaceCache = () => cache.clear();
