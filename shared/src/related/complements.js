// What goes with what ("Goes well with this"). Pure data and two small functions, shared by the demo backend and the live adapter.
//
// "Similar" and "goes with" are different questions. Pilau at one cafe is SIMILAR to pilau at another (same kind of thing, a
// different shop). A soda or a mango juice GOES WITH pilau (a different kind of thing you buy with it). So a complement is never
// the same group as the item, and an item whose group has no partners (a haircut, a medicine) has nothing that goes with it: the
// section is simply not shown.
//
// Every item gets one group: from its words first, because a name is the most specific thing we have ("Gas regulator" is a gas
// accessory even if the seller filed it under cooking gas), then from its product type. Groups are mostly the seeded product
// type ids, plus a few finer ones the types do not have (soda, spreads, gas accessories, bedding...).
//
// Admin relations (product_relations, the Relations page) still apply on top of this map: they can add pairs the map does not know.

import { COMPLEMENTS, PHRASES, TYPE_GROUPS } from "./data/complementMap.js";

export { COMPLEMENTS };

const PATTERNS = PHRASES.map(([group, phrases]) => [
  group,
  phrases.map((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]*")}($|[^a-z0-9])`))
]);

const norm = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ");

/**
 * The group of an item: { name, productTypeId? } -> "restaurant-meal", "gas-accessory", ... or null when nothing is known.
 * The name decides first (it is the most specific); the product type is the fallback.
 */
export function complementGroupOf(item) {
  const name = norm(item?.name);
  if (name) {
    for (const [group, patterns] of PATTERNS) if (patterns.some((re) => re.test(name))) return group;
  }
  const type = item?.productTypeId ?? item?.productType ?? null;
  if (type) return TYPE_GROUPS[type] ?? String(type);
  return null;
}

/** The groups that go with `group`, strongest first: [{ group, weight }]. [] when nothing does. */
export function complementsOf(group) {
  return (COMPLEMENTS[group] ?? []).map(([g, weight]) => ({ group: g, weight })).sort((a, b) => b.weight - a.weight);
}

/** Whether anything at all goes with this item: decides if the section is worth asking for. */
export const hasComplements = (item) => complementsOf(complementGroupOf(item)).length > 0;

/** The weight (1-10) with which `candidate` goes with `item`, or 0. Never for the same group (that is "similar", not "goes with"). */
export function complementWeight(item, candidate) {
  const from = complementGroupOf(item);
  const to = complementGroupOf(candidate);
  if (!from || !to || from === to) return 0;
  return (COMPLEMENTS[from] ?? []).find(([g]) => g === to)?.[1] ?? 0;
}

/**
 * Single words to look partner items up by name (the live database searches item names word by word). For a meal: soda, coca,
 * cola, fanta, juice, water... Only words long enough to be useful, at most `max` of them, strongest partners first.
 */
export function complementSearchWords(group, max = 24) {
  // Words that say nothing about what a product is: they would only fill the pool with unrelated rows.
  const VAGUE = new Set(["soft", "drink", "drinks", "red", "energy", "minute", "maid", "bull", "fresh", "set", "pack", "special", "top", "with", "and", "for", "the"]);
  const lists = complementsOf(group).map(({ group: partner }) => {
    const phrases = PHRASES.find(([g]) => g === partner)?.[1] ?? [partner.replace(/-/g, " ")];
    const out = [];
    for (const phrase of phrases) {
      for (const w of norm(phrase).split(/[^a-z0-9]+/)) if (w.length >= 3 && !/^\d/.test(w) && !VAGUE.has(w) && !out.includes(w)) out.push(w);
    }
    return out;
  });
  // Round robin, strongest partner first: every partner gets words in, so a meal finds water as well as sodas.
  const words = [];
  for (let i = 0; words.length < max && lists.some((l) => i < l.length); i += 1) {
    for (const list of lists) if (i < list.length && !words.includes(list[i]) && words.length < max) words.push(list[i]);
  }
  return words;
}

/** A number from a string, the same on every machine (FNV-1a), for the per-visit order. */
export function seededKey(seed, id) {
  let h = 0x811c9dc5;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
