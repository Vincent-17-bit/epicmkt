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

import { COMPLEMENTS, DEVICE_ACCESSORIES, DEVICE_WORDS, LOCKED_GROUPS, NO_PARTNERS, PHRASES, TYPE_GROUPS } from "./data/complementMap.js";

export { COMPLEMENTS, NO_PARTNERS };

const phraseRe = (p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]*")}(?:e?s)?($|[^a-z0-9])`);
const PATTERNS = PHRASES.map(([group, phrases]) => [group, phrases.map(phraseRe)]);
const DEVICES = DEVICE_WORDS.map(phraseRe);
const ACCESSORIES = DEVICE_ACCESSORIES.map(([group, words]) => [group, words.map(phraseRe)]);

// A key such as "constructor" or "toString" (a product type id, or a word in a name) must never find Object.prototype.
const ownValue = (table, key) => (typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined);

const norm = (text) =>
  String(text ?? "")
    .slice(0, 200) // names are at most 120 characters in the database
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ");

/**
 * The group of an item: { name, productTypeId? } -> "restaurant-meal", "gas-accessory", ... or null when nothing is known.
 *   1. A product type in a locked group (services, medicine, school uniform, pet accessories...) wins: a typed "Sofa cleaning" is
 *      a service, never a sofa.
 *   2. Otherwise the name decides, the most specific phrase first ("Gas regulator" is a gas accessory even if the seller filed it
 *      under cooking gas). A phone or tablet brand next to an accessory word ("iPhone 13 case") is the accessory, not the device.
 *   3. Otherwise the product type is the fallback.
 */
export function complementGroupOf(item) {
  const type = item?.productTypeId ?? item?.productType ?? null;
  const typeGroup = type ? ownValue(TYPE_GROUPS, type) ?? String(type) : null;
  if (typeGroup && LOCKED_GROUPS.has(typeGroup)) return typeGroup;
  const name = norm(item?.name);
  let group = null;
  if (name) {
    for (const [g, patterns] of PATTERNS) if (patterns.some((re) => re.test(name))) { group = g; break; }
    if ((group === null || group === "phone" || group === "tablet") && DEVICES.some((re) => re.test(name))) {
      for (const [g, patterns] of ACCESSORIES) if (patterns.some((re) => re.test(name))) { group = g; break; }
    }
  }
  return group ?? typeGroup;
}

/** The groups that go with `group`, strongest first: [{ group, weight }]. [] when nothing does. */
export function complementsOf(group) {
  return (ownValue(COMPLEMENTS, group) ?? []).map(([g, weight]) => ({ group: g, weight })).sort((a, b) => b.weight - a.weight);
}

/** Whether anything at all goes with this item: decides if the section is worth asking for. */
export const hasComplements = (item) => complementsOf(complementGroupOf(item)).length > 0;

/** The weight (1-10) with which `candidate` goes with `item`, or 0. Never for the same group (that is "similar", not "goes with"). */
export function complementWeight(item, candidate) {
  const from = complementGroupOf(item);
  const to = complementGroupOf(candidate);
  if (!from || !to || from === to) return 0;
  return (ownValue(COMPLEMENTS, from) ?? []).find(([g]) => g === to)?.[1] ?? 0;
}

/**
 * Single words to look partner items up by name (the live database searches item names word by word). For a meal: soda, coca,
 * cola, fanta, juice, water... Only words long enough to be useful, at most `max` of them, strongest partners first.
 */
export function complementSearchWords(group, max = 24) {
  // Words that say nothing about what a product is: they would only fill the pool with unrelated rows.
  const VAGUE = new Set(["soft", "drink", "drinks", "red", "energy", "minute", "maid", "bull", "fresh", "set", "pack", "special", "top", "with", "and", "for", "the"]);
  const lists = complementsOf(group).map(({ group: partner }) => {
    // A group can be listed twice (an early entry for words that must win over other groups): use all its words, main list first.
    const lists = PHRASES.filter(([g]) => g === partner);
    const phrases = lists.length ? [...lists].reverse().flatMap(([, p]) => p) : [partner.replace(/-/g, " ")];
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
