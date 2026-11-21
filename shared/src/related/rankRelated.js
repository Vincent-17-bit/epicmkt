import { isListed } from "../availability.js";
import { complementGroupOf, complementWeight, seededKey } from "./complements.js";
import { hasNoTypeEvidence } from "../productType/other.js";

// "Goes well with this" ranking. Pure: no I/O, so the live adapter and the demo backend rank the same way.
//
// Where "Similar items" answers "more of this" (pilau at another cafe), this answers "what do I buy with it" (a soda or a mango
// juice with the pilau, a regulator with the gas cylinder). A candidate qualifies only as a COMPLEMENT:
//   - the built-in complement map (complements.js): the item's group lists the candidate's group as a partner, or
//   - an admin relation (product_relations, the Relations page) from the item's type or department to the candidate's.
// The same kind of thing never qualifies through the map (that is "similar"), and an item whose group has no partners (a haircut,
// a medicine) gets nothing: the section is not shown.
//
// Score (higher first):
//   relation    type->type 100, type->department 80, department->type 70, department->department 50, plus its weight (0-10)
//   complement  40 + 5 x the pairing's weight (1-10), so 45-90
//   The better of the two counts.
// Order within the same strength: with a `seed` (one per visit), a shuffle that is the same for the whole visit, so nobody's
// product is always first but the list does not jump while someone browses or pages; without one, newest then id.
//
// Variety: at most 3 of the same group (three sodas, then a juice) come first; the rest follow. A partner priced over 10x the item
// loses 15 points.
//
// Shops: any shop may appear, but at least 1 in 5 results of every page come from the shop being viewed (rounded up, and never
// more than that shop has). A page is never padded: a shop with one item simply has no "From this shop" results.

export const DEFAULT_PAGE_SIZE = 10;
export const SAME_SHOP_SHARE = 5; // one in five
const RELATION_SCORE = { "type>type": 100, "type>department": 80, "department>type": 70, "department>department": 50 };
const COMPLEMENT_BASE = 40;
const COMPLEMENT_STEP = 5;
const GROUP_CAP = 3;
const PRICE_RATIO = 10;
const PRICE_PENALTY = 15;

const id = (value) => (value === null || value === undefined || value === "" ? null : String(value));
// "Other" says no type fits, so it never matches an admin relation that names a type.
const typeOf = (entry) => { const value = id(entry?.productTypeId ?? entry?.productType); return value === null || hasNoTypeEvidence(value) ? null : value; };
const departmentOf = (entry) => id(entry?.departmentId ?? entry?.department);

/** A relation row as stored: { fromKind, fromId, toKind, toId, weight?, active? }. Inactive rows are ignored. */
const relationScore = (item, candidate, relations) => {
  const from = { type: typeOf(item), department: departmentOf(item) };
  const to = { type: typeOf(candidate), department: departmentOf(candidate) };
  let best = 0;
  for (const r of relations) {
    if (!r || r.active === false) continue;
    if (id(r.fromId) === null || from[r.fromKind] !== id(r.fromId) || to[r.toKind] !== id(r.toId)) continue;
    const weight = Math.min(10, Math.max(0, Number.isFinite(Number(r.weight)) ? Math.trunc(Number(r.weight)) : 0));
    best = Math.max(best, (RELATION_SCORE[`${r.fromKind}>${r.toKind}`] ?? 0) + weight);
  }
  return best;
};

const sameShop = (item, candidate) => id(item.businessId) !== null && id(item.businessId) === id(candidate.businessId);

/** One candidate's score, or 0 when it does not qualify. Exported for the admin preview and the tests. */
export function relatedScore(item, candidate, relations = []) {
  const relation = relationScore(item, candidate, relations);
  const weight = complementWeight(item, candidate);
  const score = Math.max(relation, weight > 0 ? COMPLEMENT_BASE + COMPLEMENT_STEP * weight : 0);
  const from = Number(item?.price);
  const to = Number(candidate?.price);
  return score > 0 && from > 0 && to > from * PRICE_RATIO ? Math.max(1, score - PRICE_PENALTY) : score;
}

const newest = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) || (a.id < b.id ? -1 : 1);
const orderBy = (seed) => (a, b) => b.score - a.score || (seed === null ? newest(a, b) : a.key - b.key || (a.id < b.id ? -1 : 1));

/**
 * @param {object} item          the item being viewed: { id, businessId, productTypeId, departmentId, name, brand, section, price }
 * @param {object[]} candidates  other items, same fields plus availability and createdAt
 * @param {{ relations?: object[], page?: number, pageSize?: number, seed?: string|number }} [opts]  page counts from 1; the
 *   seed is one per visit (see above)
 * @returns {{ items: object[], page: number, pageSize: number, hasMore: boolean, total: number }}
 *   items: the candidates on that page, each as given plus `fromThisShop`; total: how many qualify in all.
 */
export function rankRelated(item, candidates, { relations = [], page = 1, pageSize = DEFAULT_PAGE_SIZE, seed = null } = {}) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : DEFAULT_PAGE_SIZE;
  const wanted = Number.isInteger(page) && page > 0 ? page : 1;
  const seen = new Set();
  const pool = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = id(candidate?.id);
    if (key === null || key === id(item?.id) || seen.has(key) || !isListed(candidate)) continue;
    seen.add(key);
    const score = relatedScore(item, candidate, relations);
    if (score > 0) pool.push({ candidate, id: key, score, key: seed === null ? 0 : seededKey(seed, key), createdAt: String(candidate.createdAt ?? ""), mine: sameShop(item, candidate) });
  }
  const byScore = orderBy(seed === null || seed === undefined || seed === "" ? null : String(seed));
  pool.sort(byScore);
  // Variety first: the first time a product appears (by name) it keeps its place; the same product from more shops comes after
  // every distinct one, still in order. A soda row reads "Coca-Cola, Fanta, mango juice, water..." before the third Coca-Cola.
  const seenName = new Set();
  const perGroup = new Map();
  const firsts = [];
  const repeats = [];
  for (const row of pool) {
    const name = String(row.candidate.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const group = complementGroupOf(row.candidate) ?? "";
    const used = perGroup.get(group) ?? 0;
    const crowded = group !== "" && used >= GROUP_CAP;
    const repeat = crowded || (name && seenName.has(name));
    (repeat ? repeats : firsts).push(row);
    if (!repeat) perGroup.set(group, used + 1);
    if (name) seenName.add(name);
  }
  pool.length = 0;
  pool.push(...firsts, ...repeats);
  firsts.concat(repeats).forEach((row, index) => { row.rank = index; });

  // Build the pages in order so page N never repeats or skips what page N-1 showed. Each page: its quota of this shop's best
  // items first, then the best of what is left (any shop), shown in score order.
  const mine = pool.filter((row) => row.mine);
  const rest = pool.filter((row) => !row.mine);
  const pages = [];
  while (mine.length + rest.length > 0 && pages.length < wanted) {
    const count = Math.min(size, mine.length + rest.length);
    const quota = Math.min(Math.ceil(count / SAME_SHOP_SHARE), mine.length);
    const chosen = mine.splice(0, quota);
    while (chosen.length < count) {
      // the next best of everything left; this shop's surplus items compete on score with the other shops'
      const takeMine = mine.length > 0 && (rest.length === 0 || mine[0].rank < rest[0].rank);
      chosen.push(takeMine ? mine.shift() : rest.shift());
    }
    pages.push(chosen.sort((a, b) => a.rank - b.rank));
  }
  const shown = pages[wanted - 1] ?? [];
  return {
    items: shown.map((row) => ({ ...row.candidate, fromThisShop: row.mine })),
    page: wanted,
    pageSize: size,
    hasMore: mine.length + rest.length > 0,
    total: pool.length
  };
}
