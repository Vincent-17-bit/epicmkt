import { distanceKm } from "./utils.js";
import {
  STOP_WORDS,
  UNIT_WORDS,
  NEVER_HEAD,
  SHORT_NOUNS,
  SYNONYM_GROUPS,
  RELATED_GROUPS,
  NOUNS,
  COMPOUNDS,
  IRREGULAR_PLURALS,
  INVARIANT_WORDS
} from "./similarVocab.js";

// Ranking for "Similar items" on a product page. Pure: no I/O, so the demo backend and the live adapter rank the same way.
//
// An item is shown only when it is clearly the same KIND of thing. The kind is the product's head noun: the last
// significant word of its name once units, pack sizes, models and the brand are stripped ("Brown Bread 400g" is bread,
// "Chocolate Cake" is a cake), folded through plurals and a small synonym list (loaf = bread, sofa = couch). The store's
// category is NOT a qualifier: a bakery sells bread and cake, so the category says nothing about which one this is.
//
//   same     the same head noun                                   qualifies on its own
//   related  a sibling kind (sofa / armchair)                     only in the same section, ranks below `same`
//   opaque   neither head is in the vocabulary (a model name)     only in the same section
//   unknown  one side has no head noun at all ("Item")           only in the same section
//   differs  two different heads, at least one of them known      never ("bread" is never "cake", whatever the section)
//
// Qualifying items must reach MIN_RELEVANCE. They are then ordered by strict tiers, a later tier only mattering when every
// earlier one ties. Continuous values (price, distance) are put into bands first, otherwise they would almost never tie.
//
//   1. Relevance           head match, plus the same section, plus shared modifiers (capped).
//   2. Same category       the store sells the same kind of thing: a weak tie-breaker, never a way in.
//   3. Shared store tags   a weak signal, capped.
//   4. Price band          within 25%, 60%, 2.5x, further; unknown price ranks last.
//   5. Distance band       from the visitor if their position is known, else from the store being viewed.
//   6. Exact tie-breakers  closer price, nearer store, newer item, then id so the order is deterministic.
//
// The row is then composed so no store overpowers the others: one best item per store first, about half the row from
// different featured stores that really have this kind of item, then the rest (see `compose`). A short row is better
// than a wrong one, so nothing is ever added to reach `limit`.

export const MIN_RELEVANCE = 20;
const HEAD_SCORE = { same: 60, related: 30, opaque: 0, unknown: 0 };
const SECTION_SCORE = 20;
const MOD_SCORE = 5;
const MOD_CAP = 3;
const TAG_CAP = 3;
const PRICE_BANDS = [1.25, 1.6, 2.5];
const PRICE_UNKNOWN = 4;
const DISTANCE_BANDS_KM = [3, 10, 25, 60];
const DISTANCE_UNKNOWN = 5;

const STOP = new Set(STOP_WORDS);
const UNITS = new Set(UNIT_WORDS);
const NO_HEAD = new Set(NEVER_HEAD);
const SHORT = new Set(SHORT_NOUNS);
const INVARIANT = new Set(INVARIANT_WORDS);
const COMPOUND_LIST = Object.entries(COMPOUNDS);

// word -> the first word of its synonym group
const CANON = new Map(SYNONYM_GROUPS.flatMap((group) => group.map((word) => [word, group[0]])));
const canonOf = (word) => CANON.get(word) ?? word;
const GROUP_MEMBERS = new Map(SYNONYM_GROUPS.map((group) => [group[0], group]));
// canonical word -> the ids of the related groups it belongs to
const FAMILIES = new Map();
RELATED_GROUPS.forEach((group, index) => {
  for (const word of group) {
    const key = canonOf(word);
    FAMILIES.set(key, new Set([...(FAMILIES.get(key) ?? []), index]));
  }
});
const related = (a, b) => {
  const left = FAMILIES.get(a);
  const right = FAMILIES.get(b);
  if (!left || !right) return false;
  for (const id of left) if (right.has(id)) return true;
  return false;
};
// Heads the vocabulary knows. Two different known heads are never similar; an unknown head falls back to the section.
const KNOWN = new Set([...NOUNS, ...SYNONYM_GROUPS.flat(), ...RELATED_GROUPS.flat()].map(canonOf));

const fold = (value) =>
  typeof value === "string"
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";

/** Folds a plural to its singular: "shoes" -> "shoe", "boxes" -> "box", "berries" -> "berry", "loaves" -> "loaf". */
export const singular = (word) => {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  if (INVARIANT.has(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("ie")) return `${word.slice(0, -2)}y`;
  if (word.length > 4 && /(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
};

// "Brown bread, Brookside 400g" -> "Brown bread" first: what comes after a comma, a dash or a word like "with" or "for"
// describes the product ("Phone case for iPhone 13" is a case) rather than naming it.
const SEGMENTS = /\s[-\u2013\u2014]\s|[,;|()[\]/]|\s(?:with|for|of|in|by|from)\s/;

const tokensOf = (segment, brand) => {
  let text = ` ${fold(segment)} `;
  for (const [from, to] of COMPOUND_LIST) text = text.split(` ${from} `).join(` ${to} `);
  const out = [];
  for (const word of text.split(" ")) {
    if (!word || /\d/.test(word)) continue; // quantities, sizes and model codes: 400g, x6, A15
    if (word.length < 3 && !SHORT.has(word)) continue;
    const one = singular(word);
    if (STOP.has(word) || STOP.has(one) || UNITS.has(word) || UNITS.has(one) || brand.has(word) || brand.has(one)) continue;
    out.push({ word, canon: canonOf(one), floating: NO_HEAD.has(word) || NO_HEAD.has(one) });
  }
  return out;
};

/**
 * What an item name is about.
 * @returns {{ head: string|null, headWord: string|null, known: boolean, tokens: Set<string>, mods: Set<string> }}
 *   head: the product kind, folded (plural and synonyms) so "Loaves" and "Bread" agree; headWord: the word as written
 *   (for a heading such as "Other stores selling bread"); known: the vocabulary recognises the head as a product, so
 *   it is safe to name it to a visitor (a model name such as "Galaxy" is not); mods: the other significant words.
 */
export function analyseName(name, brand = "") {
  const own = new Set();
  for (const word of fold(brand).split(" ")) if (word) own.add(word).add(singular(word));
  const all = [];
  let chosen = null;
  for (const segment of String(name ?? "").toLowerCase().split(SEGMENTS)) {
    const found = tokensOf(segment, own);
    all.push(...found);
    if (!chosen && found.length) chosen = found;
  }
  const pick = chosen ? ([...chosen].reverse().find((token) => !token.floating) ?? chosen[chosen.length - 1]) : null;
  const tokens = new Set(all.map((token) => token.canon));
  const mods = new Set(tokens);
  if (pick) mods.delete(pick.canon);
  return { head: pick?.canon ?? null, headWord: pick?.word ?? null, known: pick ? KNOWN.has(pick.canon) : false, tokens, mods };
}

/** Every significant word of a name, folded. Kept for callers that only want the words. */
export const nameTokens = (value) => analyseName(value).tokens;

const forms = (word, out) => {
  out.add(word);
  out.add(`${word}s`);
  out.add(`${word}es`);
  if (word.endsWith("y")) out.add(`${word.slice(0, -1)}ies`);
  for (const [plural, one] of Object.entries(IRREGULAR_PLURALS)) if (one === word) out.add(plural);
};

/**
 * Every way the product kind of `name` is written (head noun, its synonyms, and their plurals), for a word search in the
 * database. Empty when the name has no head noun. The vocabulary lives here, in one place, and the database only matches.
 */
export function similarTerms(name, brand = "") {
  const { head, headWord } = analyseName(name, brand);
  if (!head) return [];
  const out = new Set();
  for (const word of GROUP_MEMBERS.get(head) ?? [head]) forms(word, out);
  if (headWord) {
    out.add(headWord);
    forms(singular(headWord), out);
  }
  return [...out].filter((word) => /^[a-z0-9]{2,30}$/.test(word)).sort();
}

const profileOf = (entry) => {
  const base = analyseName(entry?.name, entry?.brand);
  const type = fold(entry?.productType).split(" ").filter(Boolean).pop();
  if (!type) return base;
  const head = canonOf(singular(type));
  const mods = new Set(base.tokens);
  mods.delete(head);
  return { ...base, head, mods };
};

const sectionOf = (entry) => fold(entry?.section);

const judge = (a, b, inSection) => {
  let state;
  if (a.head && b.head) {
    if (a.head === b.head) state = "same";
    else if (related(a.head, b.head)) state = inSection ? "related" : "differs";
    else if (KNOWN.has(a.head) || KNOWN.has(b.head)) state = "differs";
    else state = inSection ? "opaque" : "differs";
  } else {
    state = inSection ? "unknown" : "differs";
  }
  if (state === "differs") return { state, score: 0, qualifies: false, inSection };
  const shared = state === "same" || state === "related" ? Math.min(MOD_CAP, overlap(a.mods, b.mods)) : 0;
  const score = HEAD_SCORE[state] + (inSection ? SECTION_SCORE : 0) + shared * MOD_SCORE;
  return { state, score, qualifies: score >= MIN_RELEVANCE, inSection };
};

/**
 * How relevant `candidate` is to `current`: { state, score, qualifies }. `qualifies` is the gate: nothing below it is
 * ever shown, however empty the row is.
 */
export const relevance = (current, candidate) => {
  const section = sectionOf(current);
  return judge(profileOf(current), profileOf(candidate), Boolean(section) && section === sectionOf(candidate));
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
 * @param {object} args.current   { id, businessId, categoryId?, name, brand?, productType?, section, price, tags, lat, lng }
 * @param {object[]} args.candidates each { id, businessId, featured?, categoryId?, name, brand?, productType?, section, price, tags, lat, lng, createdAt }
 * @param {{lat:number,lng:number}|null} [args.origin] the visitor's position when known
 * @param {number} [args.limit]
 * @param {number} [args.perStore]
 * @returns the candidates, best first, never including the current item or any item of the current store, and never
 *   anything that fails the relevance gate: the row can be shorter than `limit`, or empty.
 */
export function rankSimilar({ current, candidates, origin = null, limit = 12, perStore = 2 }) {
  if (!current || !Array.isArray(candidates)) return [];
  const section = sectionOf(current);
  const profile = profileOf(current);
  const tags = tagSet(current.tags);
  const unitPrice = priceOf(current);
  const from = point(origin) ?? point(current);

  const seen = new Set();
  const scored = [];
  for (const candidate of candidates) {
    if (!candidate || candidate.id === current.id || seen.has(candidate.id)) continue;
    if (current.businessId && candidate.businessId === current.businessId) continue;
    seen.add(candidate.id);
    const verdict = judge(profile, profileOf(candidate), Boolean(section) && section === sectionOf(candidate));
    if (!verdict.qualifies) continue;
    const price = priceOf(candidate);
    const km = from && point(candidate) ? distanceKm(from, point(candidate)) : null;
    scored.push({
      candidate,
      strong: verdict.state === "same",
      score: verdict.score,
      sameCategory: current.categoryId && candidate.categoryId === current.categoryId ? 0 : 1,
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
      b.score - a.score ||
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
//     kind of item (the same head noun, not just a shared section). Featured is a priority, never a way to put in an unrelated
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
  const featured = best.filter((row) => row.candidate.featured === true && row.strong).slice(0, quota);
  const taken = new Set(featured);
  const others = [];
  const surplus = [];
  for (const row of best) {
    if (taken.has(row)) continue;
    if (row.candidate.featured === true && row.strong) surplus.push(row);
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
