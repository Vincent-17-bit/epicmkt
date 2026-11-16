// One random seed per product per visit, for the order of the recommendation rows (Similar items, Goes well with this, Store
// Selective). The rows rank by how good a match is first; among equally good matches the seed decides, so no shop's product is
// always the first one shown. The seed lives for the browser tab's session: going back to a product, paging a row or reopening
// a tab keeps the same order, so nothing jumps under the visitor's finger. A new visit (a new tab, a new day) gets a new one.
//
// Storage can be missing or blocked (private mode, an embedded preview): then the seed lives in memory for this page load,
// which is still stable while the visitor browses.

const KEY = "epicmkt.visitSeeds";
const MAX = 200;
const memory = new Map();

const random = () => {
  try {
    const buf = new Uint32Array(2);
    globalThis.crypto.getRandomValues(buf);
    return buf[0].toString(36) + buf[1].toString(36);
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
};

const read = () => {
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const write = (map) => {
  try {
    const keys = Object.keys(map);
    // Keep the newest MAX: a long browse never grows the storage without bound.
    const trimmed = keys.length > MAX ? Object.fromEntries(keys.slice(keys.length - MAX).map((k) => [k, map[k]])) : map;
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // storage full or blocked: the in-memory copy still holds for this page load
  }
};

/** The seed for `scope` (a product id) in this visit. The same value every time it is asked for in the same tab session. */
export function visitSeed(scope) {
  const key = String(scope ?? "");
  if (memory.has(key)) return memory.get(key);
  const stored = read();
  const seed = typeof stored[key] === "string" && stored[key] ? stored[key] : random();
  memory.set(key, seed);
  if (stored[key] !== seed) write({ ...stored, [key]: seed });
  return seed;
}

/** For tests: forget the in-memory seeds. */
export function resetVisitSeeds() {
  memory.clear();
}
