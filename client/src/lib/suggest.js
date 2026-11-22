// Type-ahead suggestions over a plain product list: the fallback for search_suggest (migration 0128) when the dictionary is
// not there yet or the endpoint cannot be reached, and the whole answer in demo mode. Same answer shape as the database:
//   { terms: [{ label }], products: [{ id, name, slug, image, price }], stores: [{ label, slug }], categories: [], corrected }
// Same rules too: what a name starts with ("brookside", "brookside fresh"), every real word of it ("milk"), brands and sections;
// tier 3 = starts with what was typed, tier 2 = a word in it does (from 3 letters); nothing found = the closest known word.
// Pure: runs in the edge function and in the browser.

// Words that say nothing about what a product is (joining words and units): never offered on their own.
import { distance } from "../../../shared/src/search/fuzzy.js";
import { understandQuery } from "../../../shared/src/search/understand.js";
import { LOCAL_SYNONYMS } from "../../../shared/src/search/localWords.js";

const STOP = new Set([
  "and", "the", "for", "with", "from", "pcs", "pack", "set", "new", "per", "pieces", "piece", "size", "free",
  "min", "mins", "hrs", "hour", "hours", "ltr", "litre", "litres", "liter", "liters", "inch", "inches", "kgs", "gms", "gram", "grams"
]);
const EMPTY = Object.freeze({ terms: [], products: [], stores: [], categories: [], corrected: null });

/** The JS twin of search_key(): lower case, accents dropped, anything else one space. */
export const suggestKey = (text) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const hasPicture = (p) => Boolean(p.imagePath || p.imageUrl || p.images?.length);
const pictureOf = (p) => p.imagePath ?? p.imageUrl ?? p.images?.[0]?.url ?? null;
const priceOf = (p) => p.pricing?.priceMin ?? p.pricing?.salePrice ?? p.regularPrice ?? null;
// The example product of a term: one with a picture first, then the newest.
const better = (a, b) => (hasPicture(a) !== hasPicture(b) ? hasPicture(a) : String(a.createdAt ?? "") > String(b.createdAt ?? ""));

/** Builds the dictionary once per product list (the endpoint keeps it with its snapshot). */
export function buildSuggestIndex(products) {
  const terms = new Map();
  const stores = new Map();
  const add = (key, weight, example = null) => {
    if (key.length < 2 || key.length > 80) return;
    const t = terms.get(key);
    if (!t) terms.set(key, { key, weight, example });
    else {
      t.weight += weight;
      if (example && (!t.example || better(example, t.example))) t.example = example;
    }
  };
  for (const p of products) {
    const words = suggestKey(p.name).split(" ").filter(Boolean);
    const keys = new Set();
    for (let h = 1; h <= Math.min(3, words.length); h += 1) keys.add(words.slice(0, h).join(" "));
    for (const w of words) if (w.length >= 3 && /[a-z]/.test(w) && !STOP.has(w)) keys.add(w);
    for (const k of keys) add(k, 1, p);
    if (p.brand) add(suggestKey(p.brand), 1.5);
    if (p.section) add(suggestKey(p.section), 1.5);
    const shop = p.business;
    if (shop?.slug && shop?.name && !stores.has(shop.slug)) stores.set(shop.slug, { key: suggestKey(shop.name), label: shop.name, slug: shop.slug, featured: shop.featured === true });
  }
  return { terms: [...terms.values()], stores: [...stores.values()] };
}

/** Edit distance, for spelling: "mlik" is 2 edits from "milk". */
export const editDistance = distance;

/** The closest known single word for a word nothing starts with (same first letter, a few edits away), else null. */
export function correctWord(index, word) {
  // A word we know as a real thing ("sofa", "fix") is never "corrected" into a different one ("soda", "fit"): it is just not stocked.
  if (word.length < 3 || /^\d+$/.test(word) || LOCAL_SYNONYMS[word] || index.terms.some((t) => t.key.startsWith(word))) return null;
  const allowed = word.length <= 6 ? 1 : word.length <= 9 ? 2 : 3;
  let best = null;
  for (const t of index.terms) {
    if (t.key.includes(" ") || t.key[0] !== word[0] || Math.abs(t.key.length - word.length) > 2) continue;
    const d = editDistance(t.key, word);
    if (d <= allowed && (!best || d < best.d || (d === best.d && t.weight > best.weight))) best = { key: t.key, d, weight: t.weight };
  }
  return best?.key ?? null;
}

export function suggestFrom(index, prefix, { limit = 8 } = {}) {
  let q = suggestKey(String(prefix ?? "").slice(0, 60));
  if (q.length < 2 || !index) return { ...EMPTY };
  // "cheap iphone under 20k", "where can i find a plumber": suggest for the words, not for the request around them.
  const read = understandQuery(prefix);
  const said = read.groups[0] ? suggestKey(read.groups[0]) : "";
  if (said.length >= 2 && said !== q && (read.chips.length || read.groups[0].split(" ").length < q.split(" ").length)) q = said;
  const tierOf = (key) => (key.startsWith(q) ? 3 : q.length >= 3 && ` ${key}`.includes(` ${q}`) ? 2 : 0);
  let corrected = null;
  let hits = index.terms.filter((t) => tierOf(t.key) > 0);
  if (!hits.length && q.length >= 3) {
    const fixed = q.split(" ").map((w) => correctWord(index, w) ?? w).join(" ");
    if (fixed !== q) {
      corrected = fixed;
      q = fixed;
      hits = index.terms.filter((t) => tierOf(t.key) > 0);
    }
  }
  // Nothing starts with it, but a word it means does ("kinyozi" -> haircut, barber): offer those.
  if (!hits.length && q.length >= 3) {
    const mates = new Set(q.split(" ").flatMap((w) => LOCAL_SYNONYMS[w] ?? []).map(suggestKey));
    hits = index.terms.filter((t) => mates.has(t.key) || [...mates].some((m) => t.key.startsWith(`${m} `)));
  }
  const ranked = hits.map((t) => ({ t, tier: tierOf(t.key) })).sort((a, b) => b.tier - a.tier || b.t.weight - a.t.weight || a.t.key.length - b.t.key.length || (a.t.key < b.t.key ? -1 : 1));
  const products = [];
  const seen = new Set();
  for (const { t } of [...ranked].sort((a, b) => b.tier - a.tier || hasPicture(b.t.example ?? {}) - hasPicture(a.t.example ?? {}) || b.t.weight - a.t.weight)) {
    const p = t.example;
    if (!p || seen.has(p.id)) continue;
    const slug = p.business?.slug ?? p.businessSlug;
    if (!slug) continue;
    seen.add(p.id);
    products.push({ id: p.id, name: p.name, slug, image: pictureOf(p), price: priceOf(p) });
    if (products.length === 4) break;
  }
  const stores = index.stores
    .map((s) => ({ s, tier: tierOf(s.key) }))
    .filter((x) => x.tier > 0)
    .sort((a, b) => b.tier - a.tier || Number(b.s.featured) - Number(a.s.featured) || a.s.label.localeCompare(b.s.label))
    .slice(0, 4)
    .map(({ s }) => ({ label: s.label, slug: s.slug }));
  return { terms: ranked.slice(0, limit).map(({ t }) => ({ label: t.key })), products, stores, categories: [], corrected };
}

/** Categories whose name starts with, or has a word starting with, what was typed. They are few and already loaded. */
export function matchCategories(categories, prefix, limit = 3) {
  const q = suggestKey(prefix);
  if (q.length < 2) return [];
  return (categories ?? [])
    .map((c) => ({ c, key: suggestKey(c.name) }))
    .filter(({ key }) => key.startsWith(q) || ` ${key}`.includes(` ${q}`))
    .sort((a, b) => Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map(({ c }) => ({ label: c.name, id: c.id }));
}
