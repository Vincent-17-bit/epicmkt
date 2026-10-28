import { distanceKm } from "./utils.js";

// Ranking for "Similar items" on a product page. Pure: no I/O, so the demo backend and the live adapter rank the same way.
//
// Candidates are listed, public items from OTHER stores, any category: a bread on one page should find every bread.
// An item only qualifies when it is clearly the same kind of thing: it shares a word with the name, sits in the same
// section, or belongs to a store of the same category. Qualifying items are ordered by strict tiers, a later tier only
// mattering when every earlier one ties. Continuous values (price, distance) are put into bands first, otherwise they
// would almost never tie and the tiers below them could never act.
//
//   1. Match               shares a name word or the section (0) beats merely being in the same category (1).
//   2. Name words          the more words shared with the item name, the closer the product (capped).
//   3. Same section        the seller's own grouping ("Sofas").
//   4. Same category       the store sells the same kind of thing.
//   5. Shared store tags   a weak signal, capped.
//   6. Price band          within 25%, 60%, 2.5x, further; unknown price ranks last.
//   7. Distance band       from the visitor if their position is known, else from the store being viewed.
//   8. Exact tie-breakers  closer price, nearer store, newer item, then id so the order is deterministic.
//
// The row is then composed so no store overpowers the others: one best item per store first, about half the row from
// different featured stores that really have this kind of item, then the rest (see `compose`).

const STOP = new Set(["the", "and", "for", "with", "pack", "pcs", "set", "new", "size", "from", "your", "our", "best"]);
const NAME_CAP = 4;
const TAG_CAP = 3;
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

export const nameTokens = (value) => {
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
 * @param {object} args.current   { id, businessId, categoryId?, name, section, price, tags, lat, lng }
 * @param {object[]} args.candidates each { id, businessId, featured?, categoryId?, name, section, price, tags, lat, lng, createdAt }
 * @param {{lat:number,lng:number}|null} [args.origin] the visitor's position when known
 * @param {number} [args.limit]
 * @param {number} [args.perStore]
 * @returns the candidates, best first, never including the current item or any item of the current store
 */
export function rankSimilar({ current, candidates, origin = null, limit = 12, perStore = 2 }) {
  if (!current || !Array.isArray(candidates)) return [];
  const section = fold(current.section);
  const words = nameTokens(current.name);
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
    const named = Math.min(NAME_CAP, overlap(words, nameTokens(candidate.name)));
    const inSection = Boolean(section) && fold(candidate.section) === section;
    const inCategory = !current.categoryId || candidate.categoryId === current.categoryId;
    if (!named && !inSection && !inCategory) continue;
    scored.push({
      candidate,
      match: named || inSection ? 0 : 1,
      named,
      sameSection: inSection ? 0 : 1,
      sameCategory: inCategory ? 0 : 1,
      tagged: Math.min(TAG_CAP, overlap(tags, tagSet(candidate.tags))),
      band: priceBand(unitPrice, price),
      near: distanceBand(km),
      gap: unitPrice !== null && price !== null ? Math.abs(Math.log(price / unitPrice)) : Infinity,
      km: km ?? Infinity,
      made: Date.parse(candidate.createdAt) || 0
    });
  }

  scored.sort(
    (a, b) =>
      a.match - b.match ||
      b.named - a.named ||
      a.sameSection - b.sameSection ||
      a.sameCategory - b.sameCategory ||
      b.tagged - a.tagged ||
      a.band - b.band ||
      a.near - b.near ||
      a.gap - b.gap ||
      a.km - b.km ||
      b.made - a.made ||
      (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)
  );

  return compose(scored, Math.max(0, limit), Math.max(1, perStore)).map((row) => row.candidate);
}

// Builds the row from the ranked list so no store can overpower the others:
//   - each store contributes its single best item first;
//   - about half the row (`ceil(limit / 2)`) goes to DIFFERENT featured stores, but only ones that genuinely have this
//     kind of item (a shared name word or the section). Featured is a priority, never a way to put in an unrelated
//     product, so with fewer such stores the row simply has fewer featured cards;
//   - the rest is every other store's best item, in rank order;
//   - if that is still short, second items are added (at most `perStore` per store), then any remaining ones;
//   - finally featured and other cards alternate, featured first, so each screenful shows a mix at any width.
function compose(scored, limit, perStore) {
  const quota = Math.ceil(limit / 2);
  const shops = new Set();
  const best = [];
  const rest = [];
  for (const row of scored) {
    if (shops.has(row.candidate.businessId)) {
      rest.push(row);
    } else {
      shops.add(row.candidate.businessId);
      best.push(row);
    }
  }
  const featured = best.filter((row) => row.candidate.featured === true && row.match === 0).slice(0, quota);
  const taken = new Set(featured);
  const others = [];
  const surplus = [];
  for (const row of best) {
    if (taken.has(row)) continue;
    if (row.candidate.featured === true && row.match === 0) surplus.push(row);
    else if (featured.length + others.length < limit) others.push(row);
  }
  // Featured stores beyond the quota only fill space the other stores leave, so they never crowd them out.
  for (const row of surplus) {
    if (featured.length + others.length >= limit) break;
    others.push(row);
  }
  const perShop = new Map();
  for (const row of [...featured, ...others]) perShop.set(row.candidate.businessId, 1);
  const total = () => featured.length + others.length;
  for (const row of rest) {
    if (total() >= limit) break;
    const used = perShop.get(row.candidate.businessId) ?? 0;
    if (used < perStore) {
      perShop.set(row.candidate.businessId, used + 1);
      others.push(row);
    }
  }
  for (const row of rest) {
    if (total() >= limit) break;
    if (!others.includes(row)) others.push(row);
  }
  const out = [];
  for (let i = 0; i < Math.max(featured.length, others.length); i += 1) {
    if (featured[i]) out.push(featured[i]);
    if (others[i]) out.push(others[i]);
  }
  return out.slice(0, limit);
}
