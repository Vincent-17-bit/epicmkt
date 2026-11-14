import { isListed } from "../availability.js";
import { relevance } from "../similar.js";

// "Goes with" ranking for the Recommend tab. Pure: no I/O, so the live adapter and the demo backend rank the same way.
//
// Where "Similar items" answers "more of this", this answers "what do I buy with it": a soundbar goes with a smart TV, cables and
// speakers. A candidate qualifies only through the admin-managed relations (product_relations) or by sharing the item's
// department or product type; an unrelated item never fills a page.
//
// Score (higher first):
//   relation   type->type 100, type->department 80, department->type 70, department->department 50, plus the relation's weight
//              (0-10). Only the strongest matching relation counts.
//   same type  +15, same department +20 (a weak nudge: the same department is not "goes with" on its own)
//   similarity up to +10 from the name relevance used by Similar items, so near-duplicates of the item rank a little higher
// Ties break on newer, then id, so the order is the same on every call.
//
// Shops: any shop may appear, but at least 1 in 5 results of every page come from the shop being viewed (rounded up, and never
// more than that shop has). A page is never padded: a shop with one item simply has no "From this shop" results.

export const DEFAULT_PAGE_SIZE = 10;
export const SAME_SHOP_SHARE = 5; // one in five
const RELATION_SCORE = { "type>type": 100, "type>department": 80, "department>type": 70, "department>department": 50 };
const SAME_TYPE = 15;
const SAME_DEPARTMENT = 20;
const SIMILARITY_CAP = 10;

const id = (value) => (value === null || value === undefined || value === "" ? null : String(value));
const typeOf = (entry) => id(entry?.productTypeId ?? entry?.productType);
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
  const sameType = typeOf(item) !== null && typeOf(item) === typeOf(candidate);
  const sameDepartment = departmentOf(item) !== null && departmentOf(item) === departmentOf(candidate);
  if (!relation && !sameType && !sameDepartment) return 0;
  const similarity = Math.min(SIMILARITY_CAP, Math.round(relevance(item, candidate).score / 10));
  return relation + (sameType ? SAME_TYPE : 0) + (sameDepartment ? SAME_DEPARTMENT : 0) + similarity;
}

const byScore = (a, b) => b.score - a.score || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) || (a.id < b.id ? -1 : 1);

/**
 * @param {object} item          the item being viewed: { id, businessId, productTypeId, departmentId, name, brand, section, price }
 * @param {object[]} candidates  other items, same fields plus availability and createdAt
 * @param {{ relations?: object[], page?: number, pageSize?: number }} [opts]  page counts from 1
 * @returns {{ items: object[], page: number, pageSize: number, hasMore: boolean, total: number }}
 *   items: the candidates on that page, each as given plus `fromThisShop`; total: how many qualify in all.
 */
export function rankRelated(item, candidates, { relations = [], page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : DEFAULT_PAGE_SIZE;
  const wanted = Number.isInteger(page) && page > 0 ? page : 1;
  const seen = new Set();
  const pool = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = id(candidate?.id);
    if (key === null || key === id(item?.id) || seen.has(key) || !isListed(candidate)) continue;
    seen.add(key);
    const score = relatedScore(item, candidate, relations);
    if (score > 0) pool.push({ candidate, id: key, score, createdAt: String(candidate.createdAt ?? ""), mine: sameShop(item, candidate) });
  }
  pool.sort(byScore);

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
      const takeMine = mine.length > 0 && (rest.length === 0 || byScore(mine[0], rest[0]) < 0);
      chosen.push(takeMine ? mine.shift() : rest.shift());
    }
    pages.push(chosen.sort(byScore));
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
