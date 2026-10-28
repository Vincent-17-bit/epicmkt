import { distanceKm } from "./utils.js";

// Ranking for "Similar items" on a product page. Pure: no I/O, so the demo backend and the live adapter rank the same way.
//
// Candidates are listed, public items from OTHER stores of the same category (the adapters filter that). This module
// orders them. The criteria are strict tiers, compared in this order; a later tier only matters when every earlier one
// ties. Continuous values (price, distance) are put into bands first, otherwise they would almost never tie and the
// tiers below them could never act.
//
//   1. Same section        the seller's own grouping ("Sofas") is the strongest signal that two items compete.
//   2. Affinity            shared words in the item name (strong) and shared store tags (weak), capped so it is a tier.
//   3. Price band          how close the price is: within 25%, 60%, 2.5x, further; unknown price ranks last.
//   4. Distance band       from the visitor if their position is known, else from the store being viewed.
//   5. Exact tie-breakers  closer price, nearer store, newer item, then id so the order is deterministic.
//
// After ranking, no single store may fill the row: at most `perStore` items per store come first (in rank order), and
// any space left is filled after them from the rest in rank order, so a category with few stores still returns a full row.

const STOP = new Set(["the", "and", "for", "with", "pack", "pcs", "set", "new", "size", "from", "your", "our", "best"]);
const AFFINITY_CAP = 6;
const PRICE_BANDS = [1.25, 1.6, 2.5];
const PRICE_UNKNOWN = 4;
const DISTANCE_BANDS_KM = [3, 10, 25, 60];
const DISTANCE_UNKNOWN = 5;

const fold = (value) =>
  typeof value === "string"
    ? value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";

const stem = (word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

const tokensOf = (value) => {
  const out = new Set();
  for (const word of fold(value).split(" ")) {
    if (word.length < 3 || STOP.has(word)) continue;
    out.add(stem(word));
  }
  return out;
};

const tagSet = (tags) => new Set((Array.isArray(tags) ? tags : []).map(fold).filter(Boolean));

const overlap = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
};

const priceOf = (entry) => {
  const value = entry?.price;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
};

export const priceBand = (a, b) => {
  if (a === null || b === null) return PRICE_UNKNOWN;
  const ratio = Math.max(a, b) / Math.min(a, b);
  const band = PRICE_BANDS.findIndex((limit) => ratio <= limit);
  return band === -1 ? PRICE_BANDS.length : band;
};

export const distanceBand = (km) => {
  if (!Number.isFinite(km)) return DISTANCE_UNKNOWN;
  const band = DISTANCE_BANDS_KM.findIndex((limit) => km <= limit);
  return band === -1 ? DISTANCE_BANDS_KM.length : band;
};

const point = (value) => (value && Number.isFinite(value.lat) && Number.isFinite(value.lng) ? { lat: value.lat, lng: value.lng } : null);

/**
 * @param {object} args
 * @param {object} args.current   { id, businessId, name, section, price, tags, lat, lng }
 * @param {object[]} args.candidates each { id, businessId, name, section, price, tags, lat, lng, createdAt }
 * @param {{lat:number,lng:number}|null} [args.origin] the visitor's position when known
 * @param {number} [args.limit]
 * @param {number} [args.perStore]
 * @returns the candidates, best first, never including the current item or any item of the current store
 */
export function rankSimilar({ current, candidates, origin = null, limit = 12, perStore = 3 }) {
  if (!current || !Array.isArray(candidates)) return [];
  const section = fold(current.section);
  const words = tokensOf(current.name);
  const tags = tagSet(current.tags);
  const unitPrice = priceOf(current);
  const from = point(origin) ?? point(current);

  const seen = new Set();
  const scored = [];
  for (const candidate of candidates) {
    if (!candidate || candidate.id === current.id || seen.has(candidate.id)) continue;
    if (current.businessId && candidate.businessId === current.businessId) continue;
    seen.add(candidate.id);
    const price = priceOf(candidate);
    const km = from && point(candidate) ? distanceKm(from, point(candidate)) : null;
    const affinity = Math.min(AFFINITY_CAP, overlap(words, tokensOf(candidate.name)) * 2 + overlap(tags, tagSet(candidate.tags)));
    scored.push({
      candidate,
      sameSection: section && fold(candidate.section) === section ? 0 : 1,
      affinity,
      band: priceBand(unitPrice, price),
      near: distanceBand(km),
      gap: unitPrice !== null && price !== null ? Math.abs(Math.log(price / unitPrice)) : Infinity,
      km: km ?? Infinity,
      made: Date.parse(candidate.createdAt) || 0
    });
  }

  scored.sort(
    (a, b) =>
      a.sameSection - b.sameSection ||
      b.affinity - a.affinity ||
      a.band - b.band ||
      a.near - b.near ||
      a.gap - b.gap ||
      a.km - b.km ||
      b.made - a.made ||
      (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)
  );

  const cap = Math.max(1, perStore);
  const perShop = new Map();
  const chosen = [];
  const spare = [];
  for (const row of scored) {
    const used = perShop.get(row.candidate.businessId) ?? 0;
    if (used < cap && chosen.length < limit) {
      perShop.set(row.candidate.businessId, used + 1);
      chosen.push(row);
    } else {
      spare.push(row);
    }
  }
  for (const row of spare) {
    if (chosen.length >= limit) break;
    chosen.push(row);
  }
  return chosen.slice(0, Math.max(0, limit)).map((row) => row.candidate);
}
