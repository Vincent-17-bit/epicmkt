// Suggests a product type from an item name, for the seller's "add item" flow and for the one-off backfill of old untyped items.
//
// The seller's choice is the strongest signal the recommendation rows have, so this only SUGGESTS: the seller confirms in one tap, and
// the backfill writes only when exactly one type is clearly ahead. A wrong suggestion that is written is worse than none, so the bar for
// "high" is deliberately high and everything else goes to a review list.
//
// Evidence, strongest first (the numbers are the score each adds):
//   - the head noun of the item (analyseName) is the head noun of one of the type's phrases           2
//   - and the whole phrase is in the name as well                                                    +1, and +1 for each word beyond one
//   - the phrase is in the name but is not its head ("Egg tray" holds "egg" but is a tray)           1, never enough alone
//   - the complement group the name falls in is the group the type belongs to (TYPE_GROUPS)          1
//   - the shop's own category is one this type belongs to (a laundry's "shirt" is laundry)           2
// A type's "own names" are its name without the brackets and each example inside the brackets: "Clothing (dress, top, skirt)" is
// clothing, dress, top and skirt. Types are plain objects as the seller api returns them: { id, name, kind?, categoryIds?, restrictedTo? }.

import { analyseName, singular } from "../similar.js";
import { complementGroupOf } from "../related/complements.js";
import { TYPE_GROUPS } from "../related/data/complementMap.js";

import { hasNoTypeEvidence } from "./other.js";

export { OTHER_TYPE_ID, hasNoTypeEvidence } from "./other.js";

export const HIGH_SCORE = 3;
export const HIGH_MARGIN = 1;
const LOW_SCORE = 2;

const fold = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const wordsOf = (value) => fold(value).split(" ").filter(Boolean).map(singular);
// Words that name no product: a phrase made only of these says nothing.
const FILLER = new Set(["and", "or", "the", "of", "for", "with", "other", "item", "service", "product", "general", "all", "type"]);
const meaningful = (words) => words.filter((w) => w.length > 1 && !FILLER.has(w));

const inside = (hay, needle) => {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i += 1) if (needle.every((w, k) => hay[i + k] === w)) return true;
  return false;
};

const cache = new WeakMap();
/** The phrases a type is known by: [{ words, head }]. Cached per type object. */
function phrasesOf(type) {
  const hit = cache.get(type);
  if (hit) return hit;
  const name = String(type.name ?? "");
  const match = /^(.*?)\s*\((.*)\)\s*$/.exec(name);
  const raw = [match ? match[1] : name, ...(match ? match[2].split(/,|;|\//) : [])];
  // "Dress shirt" is one phrase, "Wine and spirits" is two: split a name on "and" / "or" into the things it lists.
  const parts = raw.flatMap((p) => p.split(/\band\b|\bor\b|&/i));
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const words = meaningful(wordsOf(part));
    const key = words.join(" ");
    if (!words.length || seen.has(key)) continue;
    seen.add(key);
    // The head noun of the phrase, read the same way as the head noun of an item name, so "loaves" and "bread" agree.
    out.push({ words, head: analyseName(part).head ?? words[words.length - 1] });
  }
  cache.set(type, out);
  return out;
}

// How many types use each phrase. A phrase used by many types ("kit", "chair", "shirt") does not point at one of them.
const SPECIFIC_MAX = 2;
const frequency = new WeakMap();
function phraseFrequency(types) {
  const hit = frequency.get(types);
  if (hit) return hit;
  const table = new Map();
  for (const type of types) {
    if (!type || typeof type.name !== "string") continue;
    for (const key of new Set(phrasesOf(type).map((p) => p.words.join(" ")))) table.set(key, (table.get(key) ?? 0) + 1);
  }
  frequency.set(types, table);
  return table;
}

/**
 * Scores every type for an item name.
 * @param {string} name
 * @param {object[]} types  the types the shop may sell, as the seller api returns them
 * @param {{ categoryId?: string, brand?: string }} [opts]
 * @returns {{ type: object, score: number, whole: boolean }[]} best first, only types with some evidence; whole: a full phrase of the type
 *   is in the name and is its head noun (a head noun alone, "kit" or "chair", is a hint, never a proof)
 */
export function scoreTypes(name, types, { categoryId = "", brand = "" } = {}) {
  // Sizes, pack counts and model codes ("400g", "a15") and the brand are not part of what the item is.
  const own = new Set(wordsOf(brand));
  const words = wordsOf(name).filter((w) => !/\d/.test(w) && !own.has(w));
  if (!meaningful(words).length || !Array.isArray(types)) return [];
  const { head } = analyseName(name, brand);
  const group = complementGroupOf({ name });
  const used = phraseFrequency(types);
  const rows = [];
  for (const type of types) {
    if (!type || typeof type.id !== "string" || hasNoTypeEvidence(type.id)) continue;
    let score = 0;
    let whole = false;
    for (const p of phrasesOf(type)) {
      const headMatch = Boolean(head) && p.head === head;
      const phraseIn = inside(words, p.words);
      // An unknown head is a model name: it still matches a type that lists that very word, but a bare modifier never starts a match.
      const here = headMatch ? (phraseIn ? 3 + (p.words.length - 1) : 2) : phraseIn ? 1 : 0;
      // One generic word inside a longer name ("Drip kit" holds "kit", "Egg tray" holds "egg") is a hint, not a proof: "whole" needs a
      // phrase of several words, or a phrase that is all the name says, and not a phrase many types share.
      const alone = meaningful(words).every((w) => p.words.includes(w));
      if (headMatch && phraseIn && (p.words.length >= 2 || alone) && (used.get(p.words.join(" ")) ?? 1) <= SPECIFIC_MAX) whole = true;
      score = Math.max(score, here);
    }
    if (score < 2) continue; // a modifier alone (1) is no evidence; the group and the category only support a match, they never start one
    if (group && (TYPE_GROUPS[type.id] ?? type.id) === group) score += 1;
    if (categoryId && type.categoryIds?.includes(categoryId)) score += 2;
    rows.push({ type, score, whole });
  }
  return rows.sort((a, b) => b.score - a.score || String(a.type.name).localeCompare(String(b.type.name)));
}

/**
 * The suggestion for a name.
 * @returns {{ typeId: string|null, confidence: "high"|"low"|"none", candidates: { typeId: string, score: number }[] }}
 *   high: one type is clearly ahead (safe to pre-fill and to backfill); low: a likely type, but ask; none: nothing to go on.
 *   candidates: up to three types, best first, for a "did you mean" row. typeId is set for high and low.
 */
export function suggestProductType(name, types, opts = {}) {
  const rows = scoreTypes(name, types, opts);
  const candidates = rows.slice(0, 3).map(({ type, score }) => ({ typeId: type.id, score }));
  const [first, second] = rows;
  if (!first || first.score < LOW_SCORE) return { typeId: null, confidence: "none", candidates };
  const margin = first.score - (second?.score ?? 0);
  // Two types that both hold the whole phrase ('shirt' for clothing and for laundry) are a tie in meaning, whatever the points say.
  const high = first.whole && !rows.slice(1).some((r) => r.whole) && first.score >= HIGH_SCORE && margin >= HIGH_MARGIN;
  return { typeId: first.type.id, confidence: high ? "high" : "low", candidates };
}
