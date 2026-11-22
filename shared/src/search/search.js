// Product search: match the words, work out what kind of product each result is, read its filter values, count every
// filter option (each one counted as if the shopper ticked it, the way Amazon counts), filter, rank, sort and page.
// Pure functions over a product list, so the demo, the browser fallback and the /api/products endpoint all agree.
import { understandQuery, placePhrases } from "./understand.js";
import { closestWords } from "./fuzzy.js";
import { normalizeText } from "../utils.js";
import { LOCAL_SYNONYMS } from "./localWords.js";
import { normalizeValueKey } from "../openValues.js";
import { deliveryInfo } from "../delivery.js";
import { COLOURS, COMMON_FACETS, FACETS, KINDS, KIND_BY_ID, KIND_BY_TYPE, SERVICE_CATEGORIES, readNumber, readers } from "./data/facetCatalog.js";

const SERVICE_KINDS = KINDS.filter((k) => k.service);
const GOODS_KINDS = KINDS.filter((k) => !k.service);

export const SEARCH_PAGE_SIZE = 16;
export const SEARCH_SORTS = [
  { id: "featured", label: "Best match" },
  { id: "price_asc", label: "Price: Low to High" },
  { id: "price_desc", label: "Price: High to Low" },
  { id: "newest", label: "Newest Arrivals" },
  { id: "discount", label: "Biggest discount" }
];

export const PRICE_PRESETS = [
  { id: "0-1000", label: "Under KES 1,000", min: 0, max: 1000 },
  { id: "1000-5000", label: "KES 1,000 to 5,000", min: 1000, max: 5000 },
  { id: "5000-20000", label: "KES 5,000 to 20,000", min: 5000, max: 20000 },
  { id: "20000-50000", label: "KES 20,000 to 50,000", min: 20000, max: 50000 },
  { id: "50000-", label: "KES 50,000 & above", min: 50000, max: null }
];

const CONDITIONS = [
  { id: "new", label: "New" },
  { id: "refurbished", label: "Renewed / refurbished" },
  { id: "used", label: "Used" }
];

const BASE_SYNONYMS = {
  tv: ["television"], television: ["tv"], phone: ["smartphone"], smartphone: ["phone"], fridge: ["refrigerator"], soda: ["soft drink"],
  sofa: ["couch", "seater"], couch: ["sofa"], perfume: ["fragrance", "cologne", "parfum"], earphone: ["earbud", "headphone"],
  earbud: ["earphone"], laptop: ["notebook"], speaker: ["soundbar", "sound"], soundbar: ["speaker"], shoe: ["sneaker", "sandal"],
  trouser: ["pant", "jean"], jean: ["denim", "trouser"], cooker: ["jiko"], jiko: ["cooker"], mabati: ["iron sheet"], tyre: ["tire"],
  usb: ["flash"], flash: ["usb"], carpet: ["rug"], rug: ["carpet"], massage: ["spa"], cyber: ["printing", "photocopy"], chocolate: ["sweet"],
  wood: ["timber"], timber: ["wood"], bulb: ["light"]
};

const SYNONYMS = (() => {
  const merged = { ...BASE_SYNONYMS };
  for (const [word, more] of Object.entries(LOCAL_SYNONYMS)) merged[word] = [...new Set([...(merged[word] ?? []), ...more])];
  return merged;
})();

// "speakers" -> "speaker", "batteries" -> "battery", "shoes" -> "shoe"; short words stay as they are.
export const stem = (word) => {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes)$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
};
// What the catalogue calls things: its words, and the pairs it writes apart ("power bank"), so a shopper's "powerbank" finds
// "Power bank" and "i phone" finds "iPhone", whichever way each side spaces it.
const vocabs = new WeakMap();
function vocabOf(products) {
  let v = vocabs.get(products);
  if (v) return v;
  v = { words: new Set(), pairs: new Map() };
  for (const p of products) {
    const words = [...describe(p).name];
    for (let i = 0; i < words.length; i++) {
      v.words.add(words[i]);
      if (words[i + 1] && words[i].length >= 3 && words[i + 1].length >= 3) v.pairs.set(words[i] + words[i + 1], [words[i], words[i + 1]]);
    }
  }
  vocabs.set(products, v);
  return v;
}
function refineTokens(tokens, products) {
  if (!tokens.length) return tokens;
  const v = vocabOf(products);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (next && !v.words.has(t) && v.words.has(t + next)) {
      out.push(t + next);
      i++;
    } else if (!v.words.has(t) && v.pairs.has(t)) out.push(...v.pairs.get(t));
    else out.push(t);
  }
  return out;
}

const tokensOf = (text) => normalizeText(text).split(" ").filter(Boolean).map(stem);

// ---- reading one product ------------------------------------------------------------------------------------------
const cache = new WeakMap();

// The name plus the values of spec rows that say what the product is: "Type", "Item", or a row named like the filter.
const TYPE_ROW = /^(?:type|item|kind|product|style|treatment|service|what is made|main|flowers|wood|pen type|drink|clothing|table|bed|carpet|appliance|arrangement|stationery|board)$/i;
const ownText = (p, label) => `${p.name ?? ""} · ${(p.specs ?? []).filter((s) => TYPE_ROW.test(String(s.label ?? "").trim()) || String(s.label ?? "").trim().toLowerCase() === String(label).toLowerCase()).map((s) => s.value).join(" · ")}`;
const specText = (p) => (p.specs ?? []).map((s) => `${s.label ?? ""}: ${s.value ?? ""}`).join(" · ");
const priceOf = (p) => {
  if (p.priceRange && Number.isFinite(p.priceRange.min)) return p.priceRange.min;
  const sale = p.pricing?.salePrice;
  if (Number.isFinite(sale)) return sale;
  return Number.isFinite(p.regularPrice) ? p.regularPrice : null;
};

// Words that say "this is work done for you", whatever the shop: "dress making", "phone repair", "tent hire".
const SERVICE_WORDS = /\b(?:making|made[- ]to[- ]measure|custom[- ]made|alterations?|repairs?|servic(?:e|ing)|install(?:ation)?|hire|lessons?|tuition|treatments?|consultation|appointment|per session|wash(?:ing)?|cleaning|refill|rides?|courier|transport(?:ation)?|relocation|movers|lodging|accommodation|per night|to let|for rent)\b/i;

/**
 * The kind of a product, used for its department and its filters. In order:
 *   1. its product type: every seeded type belongs to exactly one kind;
 *   2. the words in its name and section: among the kinds that match, one its shop's category sells wins, else the first;
 *      a service (or anything in a service shop) looks at service kinds first;
 *   3. its shop's category.
 */
export function kindOf(p) {
  const typed = p.productTypeId ? KIND_BY_TYPE[p.productTypeId] : null;
  if (typed) return typed;
  const head = `${p.name ?? ""} ${p.section ?? ""}`;
  const cat = p.business?.categoryId ?? null;
  const serviceFirst = p.kind === "service" || (p.kind !== "product" && (SERVICE_CATEGORIES.has(cat) || SERVICE_WORDS.test(head)));
  const pools = p.kind === "service" ? [SERVICE_KINDS] : p.kind === "product" ? [GOODS_KINDS] : serviceFirst ? [SERVICE_KINDS, GOODS_KINDS] : [GOODS_KINDS, SERVICE_KINDS];
  const hits = pools.flatMap((pool) => pool.filter((k) => k.id !== "services" && k.re.test(head)));
  const pick = hits.find((k) => k.cats.includes(cat)) ?? hits[0];
  if (pick) return pick;
  for (const pool of pools) {
    const byShop = pool.find((k) => k.cats.includes(cat));
    if (byShop) return byShop;
  }
  return p.kind === "service" || KIND_BY_ID.services.re.test(head) ? KIND_BY_ID.services : null;
}

/** The colour ids a product comes in (its swatches, else a colour spec, else its name), whole words only. */
export function coloursOf(p) {
  const found = new Set();
  const add = (text) => {
    for (const c of COLOURS) if (c.re.test(text)) found.add(c.id);
  };
  if (Array.isArray(p.swatches) && p.swatches.length) {
    for (const s of p.swatches) add(s.label);
    return found;
  }
  for (const s of p.specs ?? []) if (/colou?r/i.test(s.label ?? "")) add(s.value ?? "");
  add(p.name ?? "");
  return found;
}

// Products only: services have no stock, so "In stock" and "Only a few left" never describe a haircut.
const PRE_ORDER = /\bpre-?orders?\b|made to order|order in advance|on order|\bimport(?:ed)? on order/i;
function availabilityOf(p, text, listing) {
  if (listing !== "product") return [];
  const out = [];
  if (p.availability === "available" || p.availability === "limited_stock" || !p.availability) out.push("instock");
  if (p.availability === "limited_stock") out.push("low");
  if (PRE_ORDER.test(text)) out.push("preorder");
  return out;
}
const BULK = /\bwholesale\b|\bbulk\b|\bcarton of\b|\bbale\b|\bper (?:bag|sack|bale|crate|carton|dozen)\b|\bdozen\b|\bcrate of\b/i;

function conditionOf(p, text, k) {
  if (p.kind === "service" || k?.service || (k && !k.condition)) return null;
  if (/refurbished|renewed|grade a|ex-?uk/i.test(text)) return "refurbished";
  if (/\bused\b|mitumba|second[- ]hand|pre-?owned/i.test(text)) return "used";
  return "new";
}

/** Everything search needs to know about one product, worked out once. */
export function describe(p) {
  const hit = cache.get(p);
  if (hit) return hit;
  const text = `${p.name ?? ""} · ${p.brand ?? ""} · ${p.section ?? ""} · ${p.shortDescription ?? ""} · ${p.description ?? ""} · ${specText(p)} · ${(p.optionValues ?? []).join(" · ")} · ${(p.highlights ?? []).map((h) => (typeof h === "string" ? h : `${h.label ?? ""} ${h.value ?? ""}`)).join(" · ")} · ${p.hay ?? ""}`;
  const k = kindOf(p);
  const facetValues = {};
  // A number filter keeps the number itself too ("0.5" kg), so a shopper's own min and max work, not only the ranges.
  const numbers = {};
  for (const id of k?.facets ?? []) {
    const f = FACETS[id];
    if (!f) continue;
    if (f.type === "range") {
      const n = readNumber(readers[f.reader], p);
      const bucket = n === null ? null : f.values.find((v) => n >= v.min && (v.max === null || n <= v.max));
      facetValues[id] = bucket ? new Set([bucket.id]) : new Set();
      if (n !== null) numbers[id] = n;
    } else {
      // "What is it" filters read the name and the product's own type rows; a value marked onName reads the name only.
      const own = f.on === "name" ? ownText(p, f.label) : text;
      facetValues[id] = new Set(f.values.filter((v) => v.re.test(v.onName ? p.name ?? "" : own)).map((v) => v.id));
    }
  }
  // A service the shop marked "by appointment" is booked, whatever its words say.
  if (facetValues.booking && p.availability === "by_appointment") facetValues.booking.add("appointment");
  const listing = p.kind === "service" || (p.kind !== "product" && (k ? k.service : SERVICE_CATEGORIES.has(p.business?.categoryId))) ? "service" : "product";
  const delivery = deliveryInfo(p.business);
  const brand = p.brand ?? (p.specs ?? []).find((s) => /^brand$/i.test(s.label ?? ""))?.value ?? null;
  const d = {
    kind: k,
    text,
    name: new Set(tokensOf(p.name)),
    hay: new Set(tokensOf(`${p.name} ${brand ?? ""} ${p.section ?? ""} ${p.shortDescription ?? ""} ${p.description ?? ""} ${specText(p)} ${(p.optionValues ?? []).join(" ")} ${p.business?.name ?? ""} ${p.business?.town ?? ""} ${k ? `${k.label} ${k.noun}` : ""}`)),
    brandKey: normalizeValueKey(brand) || null,
    brand,
    price: priceOf(p),
    colours: coloursOf(p),
    // Colour is a filter only for things that come in colours (clothes, phones, sofas), never for bread or meat.
    colourable: Boolean(k?.facets.includes("colour")),
    condition: conditionOf(p, text, k),
    facetValues,
    numbers,
    listing,
    avail: availabilityOf(p, text, listing),
    onSale: Boolean(p.pricing?.savings > 0) || Boolean(p.flash),
    flash: Boolean(p.flash),
    offer: Boolean(p.offer),
    bulk: BULK.test(`${p.name ?? ""} ${p.unit ?? ""} ${p.shortDescription ?? ""}`),
    delivers: delivery.offers,
    freeDelivery: delivery.offers && delivery.fee === 0,
    county: normalizeText(p.business?.county ?? "")
  };
  cache.set(p, d);
  return d;
}

// ---- the query ----------------------------------------------------------------------------------------------------
// `type` is the listing type: "" for everything, "product" or "service". `ranges` holds a shopper's own min and max for a number
// filter ({ weight: { min: 0.5, max: 2 } }), in the filter's own unit (kg, L, GB, cc ...).
export const EMPTY_SEARCH = Object.freeze({
  q: "", kind: "", type: "", brands: [], colours: [], conditions: [], deals: [], delivery: false, freeDelivery: false, shops: [], towns: [], counties: [],
  store: [], avail: [], min: null, max: null, price: "", facets: {}, ranges: {}, sort: "featured", page: 1
});
export const LISTING_TYPES = ["product", "service"];

const LIST_KEYS = { brands: "brand", colours: "colour", conditions: "cond", deals: "deal", shops: "shop", towns: "town", counties: "county", store: "store", avail: "av" };
const list = (v) => (v ? String(v).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40) : []);
const amount = (v) => (/^\d{1,9}$/.test(String(v ?? "")) ? Number(v) : null);
// "0.5-2", "0.5-" or "-2": a number range in the address. Anything else is ignored.
const decimal = (v) => (/^\d{1,7}(?:\.\d{1,3})?$/.test(v) ? Number(v) : null);
function rangeOf(v) {
  const m = /^([\d.]*)-([\d.]*)$/.exec(String(v ?? ""));
  if (!m) return null;
  let min = m[1] ? decimal(m[1]) : null;
  let max = m[2] ? decimal(m[2]) : null;
  if ((m[1] && min === null) || (m[2] && max === null) || (min === null && max === null)) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { min, max };
}
const rangeText = (r) => `${r.min ?? ""}-${r.max ?? ""}`;

/** Reads a search from page address parameters (URLSearchParams or a plain object). */
export function parseSearch(params) {
  const get = (k) => (typeof params.get === "function" ? params.get(k) : params[k]) ?? null;
  const out = { ...EMPTY_SEARCH, facets: {} };
  out.q = String(get("q") ?? "").slice(0, 100);
  out.kind = KIND_BY_ID[get("k")] ? get("k") : "";
  out.type = LISTING_TYPES.includes(get("t")) ? get("t") : "";
  for (const [field, key] of Object.entries(LIST_KEYS)) out[field] = list(get(key));
  out.delivery = get("dlv") === "1";
  out.freeDelivery = get("fdlv") === "1";
  out.min = amount(get("min"));
  out.max = amount(get("max"));
  out.price = PRICE_PRESETS.some((p) => p.id === get("price")) ? get("price") : "";
  out.sort = SEARCH_SORTS.some((s) => s.id === get("sort")) ? get("sort") : "featured";
  out.page = Math.min(500, Math.max(1, Math.round(Number(get("page"))) || 1));
  const keys = typeof params.keys === "function" ? [...params.keys()] : Object.keys(params);
  out.ranges = {};
  for (const key of keys) {
    const m = /^f_([a-zA-Z]+)$/.exec(key);
    if (m && FACETS[m[1]]) out.facets[m[1]] = list(get(key));
    const r = /^r_([a-zA-Z]+)$/.exec(key);
    if (r && FACETS[r[1]]?.type === "range") {
      const value = rangeOf(get(key));
      if (value) out.ranges[r[1]] = value;
    }
  }
  return out;
}

/** Writes a search to address parameters, leaving defaults out so links stay short and shareable. */
export function writeSearch(search) {
  const p = new URLSearchParams();
  if (search.q) p.set("q", search.q);
  if (search.kind) p.set("k", search.kind);
  if (search.type) p.set("t", search.type);
  for (const [field, key] of Object.entries(LIST_KEYS)) if (search[field]?.length) p.set(key, search[field].join(","));
  if (search.delivery) p.set("dlv", "1");
  if (search.freeDelivery) p.set("fdlv", "1");
  if (search.price) p.set("price", search.price);
  if (search.min !== null && search.min !== undefined) p.set("min", String(search.min));
  if (search.max !== null && search.max !== undefined) p.set("max", String(search.max));
  for (const [id, values] of Object.entries(search.facets ?? {})) if (values?.length) p.set(`f_${id}`, values.join(","));
  for (const [id, r] of Object.entries(search.ranges ?? {})) if (r && (r.min !== null || r.max !== null)) p.set(`r_${id}`, rangeText(r));
  if (search.sort && search.sort !== "featured") p.set("sort", search.sort);
  if (search.page > 1) p.set("page", String(search.page));
  return p;
}

// ---- matching -----------------------------------------------------------------------------------------------------
// A search word matches a product word when they are the same word, or the product word only adds an ending ("print" finds
// "printing" and "printer"). A longer word that merely starts the same is a different thing: "table" is not "tablets",
// "pen" is not "pencil" or "pendant", "cup" is not "cupcake", "bed" is not "bedsheet".
const ENDING = /^(?:e?s|ing|ed|er|ers|y|ies|ly)$/;
const wordMatches = (word, wanted) => word === wanted || (word.startsWith(wanted) && ENDING.test(word.slice(wanted.length)));
function textScore(d, tokens) {
  if (!tokens.length) return 1;
  let score = 0;
  for (const t of tokens) {
    const options = [t, ...(SYNONYMS[t] ?? []).map(stem)];
    // The word itself in the name counts most; a synonym in the name ("light" for "bulb") less; anywhere else least.
    const exactName = [...d.name].some((w) => wordMatches(w, t));
    const inName = exactName || options.some((o) => [...d.name].some((w) => wordMatches(w, o)));
    const inHay = inName || options.some((o) => [...d.hay].some((w) => wordMatches(w, o)));
    if (!inHay) return 0;
    score += exactName ? 3 : inName ? 2 : 1;
    if (d.brandKey && options.some((o) => d.brandKey.startsWith(o))) score += 2;
  }
  return score;
}

const priceWindow = (search) => {
  const preset = PRICE_PRESETS.find((p) => p.id === search.price);
  let min = search.min ?? preset?.min ?? null;
  let max = search.max ?? preset?.max ?? null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { min, max };
};

// Each filter as a test; `skip` leaves one filter out so its own options can be counted.
const DEAL_TEST = { sale: (d) => d.onSale, flash: (d) => d.flash, offer: (d) => d.offer, bulk: (d) => d.bulk };
const STORE_TEST = { open: (p) => p.business?.isOpen, open24: (p) => p.business?.open24, verified: (p) => p.business?.verified, featured: (p) => p.business?.featured };

function passes(p, d, search, skip = null) {
  if (skip !== "type" && search.type && d.listing !== search.type) return false;
  if (skip !== "kind" && search.kind && d.kind?.id !== search.kind) return false;
  if (skip !== "brand" && search.brands.length && !search.brands.includes(d.brandKey)) return false;
  if (skip !== "colour" && search.colours.length && !search.colours.some((c) => d.colours.has(c))) return false;
  if (skip !== "condition" && search.conditions.length && !search.conditions.includes(d.condition)) return false;
  if (skip !== "deals" && search.deals.length && !search.deals.every((x) => DEAL_TEST[x]?.(d))) return false;
  if (skip !== "delivery" && ((search.delivery && !d.delivers) || (search.freeDelivery && !d.freeDelivery))) return false;
  if (skip !== "avail" && search.avail.length && !search.avail.some((a) => d.avail.includes(a))) return false;
  if (skip !== "shop" && search.shops.length && !search.shops.includes(p.business?.slug)) return false;
  if (skip !== "town" && search.towns.length && !search.towns.includes(normalizeText(p.business?.town))) return false;
  if (skip !== "county" && search.counties.length && !search.counties.includes(d.county)) return false;
  if (skip !== "store") {
    for (const s of search.store) if (STORE_TEST[s] && !STORE_TEST[s](p)) return false;
  }
  if (skip !== "price") {
    const { min, max } = priceWindow(search);
    if (min !== null || max !== null) {
      if (d.price === null) return false;
      if (min !== null && d.price < min) return false;
      if (max !== null && d.price > max) return false;
    }
  }
  for (const [id, wanted] of Object.entries(search.facets)) {
    if (skip === id || !wanted.length) continue;
    const have = d.facetValues[id];
    if (!have || !wanted.some((w) => have.has(w))) return false;
  }
  for (const [id, r] of Object.entries(search.ranges)) {
    if (skip === id || !r) continue;
    const n = d.numbers[id];
    if (n === undefined || (r.min !== null && n < r.min) || (r.max !== null && n > r.max)) return false;
  }
  return true;
}

const SORTERS = {
  featured: (a, b) => b.score - a.score || Number(Boolean(b.p.business?.featured)) - Number(Boolean(a.p.business?.featured)) || String(b.p.createdAt ?? "").localeCompare(String(a.p.createdAt ?? "")),
  price_asc: (a, b) => (a.d.price ?? Infinity) - (b.d.price ?? Infinity),
  price_desc: (a, b) => (b.d.price ?? -Infinity) - (a.d.price ?? -Infinity),
  newest: (a, b) => String(b.p.createdAt ?? "").localeCompare(String(a.p.createdAt ?? "")),
  discount: (a, b) => (b.p.pricing?.discountPercent ?? 0) - (a.p.pricing?.discountPercent ?? 0) || b.score - a.score
};

// ---- facets for the sidebar ---------------------------------------------------------------------------------------
function countBy(rows, fn) {
  const counts = new Map();
  for (const r of rows) for (const key of fn(r)) if (key !== null && key !== undefined && key !== "") counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

// A strong match names the thing searched for (in its name, or its kind is called that: "phone" finds the Tecno Spark). The
// filters follow the strong matches, so a word in a description ("print from your phone") does not decide what is shown.
const kindWordCache = new Map();
const kindWords = (k) => {
  if (!k) return [];
  if (!kindWordCache.has(k.id)) kindWordCache.set(k.id, tokensOf(`${k.label} ${k.noun}`));
  return kindWordCache.get(k.id);
};
// A search word that names one of the product's own filter values ("soda" for a drink whose type is "Soda and soft drinks",
// "gel" for a gel pen) is a sign it is the thing wanted: +1 per such word.
const valueWordCache = new Map();
const valueWords = (facetId, value) => {
  const key = `${facetId}:${value.id}`;
  if (!valueWordCache.has(key)) valueWordCache.set(key, tokensOf(value.label));
  return valueWordCache.get(key);
};
function valueBonus(d, tokens) {
  let bonus = 0;
  for (const t of tokens) {
    const hit = Object.entries(d.facetValues).some(([id, have]) => FACETS[id]?.type !== "range" && FACETS[id].values.some((v) => have.has(v.id) && valueWords(id, v).some((w) => wordMatches(w, t))));
    if (hit) bonus += 1;
  }
  return bonus;
}

const isStrong = (d, tokens) =>
  !tokens.length ||
  tokens.some((t) => {
    const options = [t, ...(SYNONYMS[t] ?? []).map(stem)];
    return options.some((o) => [...d.name].some((w) => wordMatches(w, o)) || kindWords(d.kind).some((w) => wordMatches(w, o)));
  });

function dominantKinds(all, search) {
  if (search.kind) return [KIND_BY_ID[search.kind]];
  const strong = all.filter((r) => r.strong);
  const rows = strong.length ? strong : all;
  // A shopper typing a word usually wants the thing: a service with the same word ("sugar test") counts half.
  const counts = new Map();
  for (const r of rows) if (r.d.kind) counts.set(r.d.kind.id, (counts.get(r.d.kind.id) ?? 0) + (r.d.kind.service ? 0.5 : 1));
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .filter(([, n], i) => n / total >= (i === 0 ? 0.3 : 0.35))
    .slice(0, 2)
    .map(([id]) => KIND_BY_ID[id]);
}

// ---- the filter column ------------------------------------------------------------------------------------------
// Three layers, as on Amazon and eBay: the listing type and department; the filters of the kind of thing found (only
// those its kind has: no colour on bread, no size on a haircut), most used first; then the filters every listing has
// (availability, deals, delivery, the shop, the town). A filter that would offer fewer than two different values in these
// results is left out, unless the shopper is using it, so the column never shows a choice that changes nothing.

// The order of a kind's filters: its own list (most used first: size for clothes, make and model for parts, cut and
// weight for meat), with Brand and Price where the kind puts them, else straight after its first three.
function orderFor(k) {
  const ids = [...k.facets];
  if (!ids.includes("price")) ids.splice(Math.min(3, ids.length), 0, "price");
  if (!ids.includes("brand")) ids.splice(ids.indexOf("price"), 0, "brand");
  return ids;
}
const GLOBAL_ORDER = ["condition", "avail", "deals", "delivery", "store", "shop", "town", "county"];
// How many filters the quick chips above the results show (eBay's row of "Size", "Brand", "Price" ...).
export const QUICK_FILTERS = 5;

// The unit a number filter's own min and max are typed in.
const READER_UNIT = {
  litres: "L", kg: "kg", gb: "GB", ramGb: "GB", ml: "ml", minutes: "min", hours: "h", watts: "W", inches: "in", smallInches: "in", mah: "mAh", metres: "m", feet: "ft",
  thickInch: "in", count: "pcs", hz: "Hz", mm2: "mm²", gsm: "gsm", cc: "cc", months: "months", abv: "%", channels: "cameras", mp: "MP", guests: "guests", seats: "seats",
  bedrooms: "bedrooms", shoeEu: "EU", year: ""
};
export const unitOf = (id) => {
  const f = FACETS[id];
  return f ? (READER_UNIT[f.reader] ?? f.unit ?? "") : "";
};

const AVAIL = [
  { id: "instock", label: "In stock" },
  { id: "low", label: "Only a few left" },
  { id: "preorder", label: "Pre-order / made to order" }
];
const DEALS = [
  { id: "sale", label: "On sale" },
  { id: "flash", label: "Flash sale now" },
  { id: "offer", label: "Shop offers" },
  { id: "bulk", label: "Wholesale and bulk" }
];
const STORE = [
  { id: "open", label: "Open now" },
  { id: "open24", label: "Open 24 hours" },
  { id: "verified", label: "Verified shops" },
  { id: "featured", label: "Featured shops" }
];

// A yes/no filter ("Open now") only helps when some results have it and some do not.
const splits = (values, total) => values.filter((v) => v.selected || (v.count > 0 && v.count < total));

function buildFacets(matched, search, kinds) {
  const memo = new Map();
  const others = (skip) => {
    if (!memo.has(skip)) memo.set(skip, matched.filter((r) => passes(r.p, r.d, search, skip)));
    return memo.get(skip);
  };
  const facetOn = (id) => (search.facets[id] ?? []).length > 0;
  const built = new Map();
  const show = (facet, visible) => {
    if (visible) built.set(facet.id, facet);
  };
  const atLeastTwo = (facet) => facet.values.length >= 2 || facet.values.some((v) => v.selected);

  const builders = {
    kind() {
      const counts = countBy(others("kind"), (r) => [r.d.kind?.id]);
      const facet = {
        id: "kind", label: "Department", type: "links",
        values: [...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: KIND_BY_ID[id].label, count, selected: search.kind === id }))
      };
      show(facet, atLeastTwo(facet) || Boolean(search.kind));
    },
    brand() {
      const rows = others("brand");
      const names = new Map();
      for (const r of rows) if (r.d.brandKey && !names.has(r.d.brandKey)) names.set(r.d.brandKey, r.d.brand.trim());
      const facet = {
        id: "brand", label: "Brand", type: "checkbox",
        values: [...countBy(rows, (r) => [r.d.brandKey])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, count]) => ({ id, label: names.get(id), count, selected: search.brands.includes(id) }))
      };
      show(facet, atLeastTwo(facet));
    },
    price() {
      const priced = others("price").map((r) => r.d.price).filter((n) => n !== null);
      const active = Boolean(search.price) || search.min !== null || search.max !== null;
      const facet = {
        id: "price", label: "Price", type: "price", unit: "KES",
        bounds: priced.length ? { min: Math.min(...priced), max: Math.max(...priced) } : null,
        values: splits(PRICE_PRESETS.map((pr) => ({ ...pr, count: priced.filter((n) => n >= pr.min && (pr.max === null || n <= pr.max)).length, selected: search.price === pr.id })), priced.length)
      };
      show(facet, active || new Set(priced).size >= 2);
    },
    colour() {
      const rows = others("colour").filter((r) => r.d.colourable);
      const counts = countBy(rows, (r) => [...r.d.colours]);
      const facet = {
        id: "colour", label: "Colour", type: "swatch",
        values: COLOURS.filter((c) => counts.get(c.id) || search.colours.includes(c.id)).map((c) => ({ id: c.id, label: c.label, hex: c.hex, count: counts.get(c.id) ?? 0, selected: search.colours.includes(c.id) }))
      };
      show(facet, atLeastTwo(facet));
    },
    condition() {
      const counts = countBy(others("condition"), (r) => [r.d.condition]);
      const facet = { id: "condition", label: "Condition", type: "checkbox", values: CONDITIONS.filter((c) => counts.get(c.id)).map((c) => ({ ...c, count: counts.get(c.id), selected: search.conditions.includes(c.id) })) };
      show(facet, atLeastTwo(facet));
    },
    avail() {
      const rows = others("avail").filter((r) => r.d.listing === "product");
      const facet = {
        id: "avail", label: "Availability", type: "checkbox", toggle: true,
        values: splits(AVAIL.map((a) => ({ ...a, count: rows.filter((r) => r.d.avail.includes(a.id)).length, selected: search.avail.includes(a.id) })), rows.length)
      };
      show(facet, facet.values.length > 0);
    },
    deals() {
      const rows = others("deals");
      const facet = {
        id: "deals", label: "Deals & discounts", type: "checkbox", toggle: true,
        values: splits(DEALS.map((x) => ({ ...x, count: rows.filter((r) => DEAL_TEST[x.id](r.d)).length, selected: search.deals.includes(x.id) })), rows.length)
      };
      show(facet, facet.values.length > 0);
    },
    delivery() {
      const rows = others("delivery");
      const facet = {
        id: "delivery", label: "Delivery", type: "checkbox", toggle: true,
        values: splits([
          { id: "1", label: "Shop delivers", count: rows.filter((r) => r.d.delivers).length, selected: search.delivery },
          { id: "free", label: "Free delivery", count: rows.filter((r) => r.d.freeDelivery).length, selected: search.freeDelivery }
        ], rows.length)
      };
      show(facet, facet.values.length > 0);
    },
    store() {
      const rows = others("store");
      const facet = {
        id: "store", label: "Shop", type: "checkbox", toggle: true,
        values: splits(STORE.map((x) => ({ ...x, count: rows.filter((r) => STORE_TEST[x.id](r.p)).length, selected: search.store.includes(x.id) })), rows.length)
      };
      show(facet, facet.values.length > 0);
    },
    shop() {
      const rows = others("shop");
      const names = new Map(rows.map((r) => [r.p.business?.slug, r.p.business?.name]));
      const facet = {
        id: "shop", label: "Seller", type: "checkbox",
        values: [...countBy(rows, (r) => [r.p.business?.slug])].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: names.get(id), count, selected: search.shops.includes(id) }))
      };
      show(facet, atLeastTwo(facet));
    },
    town() {
      const rows = others("town");
      const names = new Map(rows.map((r) => [normalizeText(r.p.business?.town), r.p.business?.town]));
      const facet = {
        id: "town", label: "Town", type: "checkbox",
        values: [...countBy(rows, (r) => [normalizeText(r.p.business?.town)])].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: names.get(id), count, selected: search.towns.includes(id) }))
      };
      show(facet, atLeastTwo(facet));
    },
    county() {
      const rows = others("county");
      const names = new Map(rows.map((r) => [r.d.county, r.p.business?.county]));
      const facet = {
        id: "county", label: "County", type: "checkbox",
        values: [...countBy(rows, (r) => [r.d.county])].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: names.get(id), count, selected: search.counties.includes(id) }))
      };
      show(facet, atLeastTwo(facet));
    }
  };

  // A filter of the kind itself: labels as checkboxes, numbers as ranges with their unit and the shopper's own min and max.
  const kindFacet = (id, k) => {
    const f = FACETS[id];
    if (!f) return;
    const rows = others(id);
    const counts = countBy(rows, (r) => [...(r.d.facetValues[id] ?? [])]);
    const wanted = search.facets[id] ?? [];
    if (f.type === "range") {
      const numbers = rows.map((r) => r.d.numbers[id]).filter((n) => n !== undefined);
      const own = search.ranges[id] ?? null;
      const unit = unitOf(id);
      const facet = {
        id, label: f.label, type: "range", kind: k.id, unit,
        bounds: numbers.length ? { min: Math.min(...numbers), max: Math.max(...numbers) } : null,
        range: own ? { ...own, text: rangeLabel(id, own) } : null,
        values: f.values.filter((v) => counts.get(v.id) || wanted.includes(v.id)).map((v) => ({ id: v.id, label: v.label, count: counts.get(v.id) ?? 0, selected: wanted.includes(v.id) }))
      };
      show(facet, new Set(numbers).size >= 2 || wanted.length > 0 || Boolean(own));
      return;
    }
    // Model follows Make: with Toyota ticked, only Toyota models are offered.
    const makes = f.follows ? search.facets[f.follows] ?? [] : [];
    const facet = {
      id, label: f.label, type: "checkbox", kind: k.id, ...(f.sizes ? { sizes: true } : {}),
      values: f.values
        .filter((v) => (counts.get(v.id) || wanted.includes(v.id)) && (!makes.length || !v.make || makes.includes(v.make) || wanted.includes(v.id)))
        .map((v) => ({ id: v.id, label: v.label, count: counts.get(v.id) ?? 0, selected: wanted.includes(v.id) }))
    };
    show(facet, atLeastTwo(facet) || facetOn(id));
  };

  builders.kind();
  const order = [];
  for (const k of kinds) {
    for (const id of orderFor(k)) {
      if (order.includes(id)) continue;
      order.push(id);
      if (builders[id]) builders[id]();
      else kindFacet(id, k);
    }
  }
  if (!kinds.length) {
    order.push("brand", "price");
    builders.brand();
    builders.price();
  }
  for (const id of GLOBAL_ORDER) {
    order.push(id);
    builders[id]();
  }
  return ["kind", ...order].filter((id) => built.has(id)).map((id) => built.get(id));
}

// "0.5 to 2 kg", "From 128 GB", "Up to 150 cc": a shopper's own range, as a chip says it.
function rangeLabel(id, r) {
  const f = FACETS[id];
  const text = (n) => amountText(n, f);
  if (r.min !== null && r.max !== null) return `${text(r.min)} to ${text(r.max)}`;
  return r.min !== null ? `From ${text(r.min)}` : `Up to ${text(r.max)}`;
}

// "Related searches" under the results: the kind's own words with the leading brands and filter values, nearby kinds.
function relatedSearches(rows, search) {
  const out = [];
  const add = (q) => {
    const clean = q.trim().replace(/\s+/g, " ").toLowerCase();
    if (clean && clean !== search.q.trim().toLowerCase() && !out.includes(clean)) out.push(clean);
  };
  const [top] = dominantKinds(rows, { ...search, kind: "" });
  if (top) {
    const conn = countBy(rows.filter((r) => r.d.kind === top), (r) => [...(r.d.facetValues.connectivity ?? [])]);
    if (conn.get("bluetooth")) add(`bluetooth ${top.noun}`);
    for (const [brandKey] of [...countBy(rows, (r) => (r.d.kind === top ? [r.d.brandKey] : []))].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
      const name = rows.find((r) => r.d.brandKey === brandKey)?.d.brand;
      if (name) add(`${name} ${top.noun}`);
    }
    for (const sib of KINDS.filter((k) => k.department === top.department && k !== top).slice(0, 2)) add(sib.noun);
    const town = [...countBy(rows, (r) => [r.p.business?.town])].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (town) add(`${top.noun} in ${town}`);
    add(`${top.noun} with delivery`);
  }
  return out.slice(0, 6);
}

// ---- what the shopper meant -----------------------------------------------------------------------------------------
// The words the catalogue itself uses (with how many listings use each), the towns it covers and the numbers that are part of product
// names. Built once per product list; spelling fixes, place names and "is this number a price?" are all decided against it.
const lexicons = new WeakMap();
function lexiconOf(products) {
  let lex = lexicons.get(products);
  if (lex) return lex;
  lex = { words: new Map(), raw: new Map(), rawFirst: new Map(), byFirst: new Map(), places: new Set(), numbers: new Set() };
  for (const p of products) {
    const d = describe(p);
    for (const w of d.hay) {
      if (w.length < 2) continue;
      lex.words.set(w, (lex.words.get(w) ?? 0) + 1);
      if (/^\d+$/.test(w)) lex.numbers.add(w);
    }
    for (const w of d.name) lex.words.set(w, (lex.words.get(w) ?? 0) + 2);
    // The words as they are written (not cut back to a stem): spelling is fixed against these, since a shopper types "ladies".
    const own = new Set(normalizeText(`${p.name} ${p.brand ?? ""} ${p.section ?? ""} ${p.shortDescription ?? ""} ${p.business?.name ?? ""}`).split(" "));
    for (const w of own) if (w.length >= 3 && /^[a-z]+$/.test(w)) lex.raw.set(w, (lex.raw.get(w) ?? 0) + (d.name.has(stem(w)) ? 3 : 1));
    for (const raw of [p.business?.town, p.business?.county]) if (raw) lex.places.add(raw);
  }
  for (const w of lex.words.keys()) {
    const k = w[0];
    if (!lex.byFirst.has(k)) lex.byFirst.set(k, []);
    lex.byFirst.get(k).push(w);
  }
  for (const w of lex.raw.keys()) {
    if (!lex.rawFirst.has(w[0])) lex.rawFirst.set(w[0], []);
    lex.rawFirst.get(w[0]).push(w);
  }
  lexicons.set(products, lex);
  return lex;
}
// Would this word find anything as typed? Itself, an ending on it, or one of its synonyms.
const isKnown = (lex, t) => (lex.byFirst.get(t[0]) ?? []).some((w) => wordMatches(w, t)) || (SYNONYMS[t] ?? []).some((o) => lex.words.has(stem(o)));

/**
 * Fixes what was mistyped: "iphon" -> "iphone" (an unfinished last word), "harcut" -> "haircut" (a slip). Works on the words as typed,
 * against the words as the catalogue writes them. Returns the fixed words, what changed, and for each change the other candidates
 * (for "dary": dairy, dry) so a guess that finds nothing can be swapped for the next.
 */
function mend(rawWords, lex, products) {
  const pairs = vocabOf(products).pairs;
  const changes = [];
  const alternatives = [];
  const words = rawWords.map((w, i) => {
    const t = stem(w);
    if (w.length < 3 || /[^a-z]/.test(w) || SYNONYMS[t] || isKnown(lex, t) || pairs.has(t)) return w;   // a word we know as a real thing is never "fixed" into another
    let options = [];
    if (i === rawWords.length - 1) {
      options = (lex.rawFirst.get(w[0]) ?? []).filter((c) => c.length > w.length && c.startsWith(w)).sort((a, b) => (lex.raw.get(b) ?? 0) - (lex.raw.get(a) ?? 0) || a.length - b.length).slice(0, 4);
    }
    if (!options.length) options = closestWords(w, lex.raw, 4);
    if (!options.length) return w;
    changes.push({ from: w, to: options[0] });
    alternatives.push({ index: i, options });
    return options[0];
  });
  return { words, changes, alternatives };
}

const placeKey = (p) => `${normalizeText(p.business?.town ?? "")} ${normalizeText(p.business?.county ?? "")} ${normalizeText(p.business?.address ?? "")}`;
const inPlace = (p, place) => ` ${placeKey(p)} `.includes(` ${place} `);

/**
 * Reads the query (see understand.js) and turns it into what the ranking needs: groups of words (alternatives), exact words, words to
 * leave out and the extra filters the shopper typed in plain words. Typed filters never override one the shopper set by hand.
 */
function interpret(products, s) {
  const lex = lexiconOf(products);
  const u = understandQuery(s.q, { places: placePhrases([...lex.places]), modelNumbers: lex.numbers });
  const search = { ...s };
  if (search.min === null && u.min !== null) search.min = u.min;
  if (search.max === null && u.max !== null) search.max = u.max;
  if (search.sort === "featured" && u.sort) search.sort = u.sort;
  search.conditions = [...new Set([...s.conditions, ...u.conditions])];
  search.deals = [...new Set([...s.deals, ...u.deals])];
  search.store = [...new Set([...s.store, ...u.store])];
  search.delivery = s.delivery || u.delivery;
  search.freeDelivery = s.freeDelivery || u.freeDelivery;
  const changes = [];
  const rawGroups = u.groups.map((g) => normalizeText(g).split(" ").filter(Boolean));
  const mended = rawGroups.map((g) => mend(g, lex, products));
  for (const m of mended) changes.push(...m.changes);
  const groups = mended.map((m) => refineTokens(m.words.map(stem), products));
  // Every other way of reading the slips, one change at a time, for when the first reading finds nothing.
  const variants = [];
  mended.forEach((m, gi) => {
    for (const alt of m.alternatives) for (const option of alt.options.slice(1)) {
      const words = [...m.words];
      words[alt.index] = option;
      variants.push(groups.map((g, i) => (i === gi ? refineTokens(words.map(stem), products) : g)));
    }
  });
  return {
    search,
    groups: groups.length ? groups : [[]],
    exact: u.exact.map(stem),
    exclude: u.exclude.map(stem),
    places: u.places,
    chips: u.chips,
    changes,
    variants,
    plain: u.groups.join(" "),
    // Nothing but filler ("best", "can") or a place: the literal words are the fallback, so a brand named like a town still searches.
    literal: refineTokens(tokensOf(s.q), products),
    fillerOnly: !u.groups.length && !u.chips.length && !u.exact.length,
    onlyPlaces: !u.groups.length && u.places.length > 0 && u.chips.every((c) => c.id === "place")
  };
}

// partial: a product may miss some of the words, as long as it has at least half of them and one that is not a number.
function rank(products, tokens, { partial = false, exact = [], exclude = [] } = {}) {
  const matched = [];
  for (const p of products) {
    const d = describe(p);
    if (exclude.length && exclude.some((w) => [...d.hay].some((h) => wordMatches(h, w)))) continue;
    if (exact.length && !exact.every((w) => d.hay.has(w))) continue;
    let score = textScore(d, tokens);
    let missed = 0;
    if (!score && partial && tokens.length > 2) {
      const hits = tokens.filter((t) => textScore(d, [t]) > 0);
      missed = tokens.length - hits.length;
      if (hits.length >= 2 && hits.length * 2 >= tokens.length && hits.some((t) => !/^\d/.test(t))) score = hits.reduce((n, t) => n + textScore(d, [t]), 0) / tokens.length;
    }
    score += score && d.kind && tokens.some((t) => stem(d.kind.noun.split(" ").pop()) === t) ? 2 : 0;
    // Among equal matches, a fuller listing ranks first: more photos, a video, colour choices, a price.
    const quality = Math.min((p.images ?? []).length, 6) * 0.08 + ((p.videos ?? []).length ? 0.4 : 0) + Math.min((p.swatches ?? []).length, 5) * 0.05 + (d.price !== null ? 0.2 : 0);
    if (score > 0) matched.push({ p, d, score: score + quality + valueBonus(d, tokens), strong: isStrong(d, tokens), missed });
  }
  return matched;
}

// Alternatives ("samsung or tecno phone"): a listing counts once, at its best group.
function rankGroups(products, groups, options) {
  if (groups.length === 1) return rank(products, groups[0], options);
  const best = new Map();
  for (const g of groups) for (const r of rank(products, g, options)) if (!best.has(r.p) || best.get(r.p).score < r.score) best.set(r.p, r);
  return [...best.values()];
}

/**
 * Runs a search. Returns { total, page, pageSize, pages, items, facets, quick, listing, related } where each item is the
 * product plus `search`: { kind, listing, price, facts } for its card. `facets` is the filter column in order (hidden filters
 * left out), `quick` the ids of the first few for the chips above the results, `listing` the products and services found.
 * `itemsOnly` skips the filters: the next page of a list already on screen needs only its cards.
 */
export function searchProducts(products, search = EMPTY_SEARCH, { pageSize = SEARCH_PAGE_SIZE, itemsOnly = false } = {}) {
  const given = { ...EMPTY_SEARCH, ...search, facets: { ...(search.facets ?? {}) }, ranges: { ...(search.ranges ?? {}) } };
  const read = interpret(products, given);
  let s = read.search;
  const options = { exact: read.exact, exclude: read.exclude };
  // The places named that the catalogue has shops in; one it does not cover is dropped (and said) instead of emptying the page.
  const placeHits = read.places.filter((pl) => products.some((p) => inPlace(p, pl)));
  const relaxed = read.places.filter((pl) => !placeHits.includes(pl)).map((pl) => ({ id: "missing-place", label: `no shops in ${pl} yet` }));
  const inPlaces = (r) => !placeHits.length || placeHits.some((pl) => inPlace(r.p, pl));

  let matched = rankGroups(products, read.groups, options);
  let partial = false;
  if (read.onlyPlaces && !placeHits.length) {
    // "mumias" with no shop in Mumias: it is a word (a sugar brand), not a place.
    relaxed.length = 0;
    read.places.length = 0;
    matched = rank(products, read.literal, options);
  } else if (read.fillerOnly && read.literal.length) {
    matched = rank(products, read.literal, options);
    if (!matched.length) matched = rank(products, [], options);   // "best": no listing says it, so show everything, best first
  }
  const run = (search) => {
    const [first, second] = dominantKinds(matched, { ...search, kind: "" });
    for (const r of matched) {
      r.boosted ??= (r.score += r.d.kind && r.d.kind === first ? 1.5 : r.d.kind && r.d.kind === second ? 0.75 : 0);
      r.primary = Boolean(read.groups[0]?.length && r.d.kind && r.d.kind === first);
    }
    return matched.filter((r) => passes(r.p, r.d, search) && (!search.__places || inPlaces(r)));
  };
  let search1 = { ...s, __places: true };
  let kept = run(search1);
  // Nothing: loosen what the shopper typed in plain words, one thing at a time, and say which. Their own filter choices stay.
  const ladder = [
    ["place", (x) => ({ ...x, __places: false }), () => placeHits.length > 0, `the place (${placeHits.join(", ")})`],
    ["price", (x) => ({ ...x, min: given.min, max: given.max }), () => s.min !== given.min || s.max !== given.max, "the price limit"],
    ["condition", (x) => ({ ...x, conditions: given.conditions }), () => s.conditions.length !== given.conditions.length, "the condition"],
    ["deals", (x) => ({ ...x, deals: given.deals, store: given.store, delivery: given.delivery, freeDelivery: given.freeDelivery }), () => s.deals.length !== given.deals.length || s.store.length !== given.store.length || s.delivery !== given.delivery || s.freeDelivery !== given.freeDelivery, "the offer, shop or delivery filter"]
  ];
  if (!kept.length) {
    for (const [id, loosen, applies, label] of ladder) {
      if (!applies()) continue;
      search1 = loosen(search1);
      relaxed.push({ id, label });
      kept = run(search1);
      if (kept.length) break;
    }
  }
  // Still nothing: the next reading of a slip ("dary meal" as dairy, not dry).
  if (!kept.length) {
    for (const groups of read.variants) {
      const again = rankGroups(products, groups, options);
      if (!again.length) continue;
      matched = again;
      read.groups = groups;
      kept = run(search1);
      if (kept.length) break;
    }
  }
  // Still nothing: a listing with most of the words is better than an empty page.
  if (!kept.length && read.groups.some((g) => g.length > 2)) {
    matched = rankGroups(products, read.groups, { ...options, partial: true });
    kept = run(search1);
    partial = kept.length > 0;
  }
  s = search1;
  if (s.__places) matched = matched.filter(inPlaces);   // the filters beside the results count what the results show
  // Whatever the order asked for, listings that are about the words come before listings that only mention them (a shop called
  // "Phones" selling a sack of sugar): "cheapest phone" must not start with the cheapest thing in that shop.
  const sorter = SORTERS[s.sort] ?? SORTERS.featured;
  kept.sort((a, b) => Number(b.strong) - Number(a.strong) || Number(b.primary) - Number(a.primary) || sorter(a, b));
  const pages = Math.max(1, Math.ceil(kept.length / pageSize));
  const page = Math.min(s.page, pages);
  const items = kept.slice((page - 1) * pageSize, page * pageSize).map(({ p, d }) => ({ ...p, search: rowFacts(p, d) }));
  // Nothing even so: the single words that do find something, so the page can say "Try: tv".
  const alternatives = [];
  if (!kept.length) {
    const seen = new Set();
    for (const t of read.groups.flat()) {
      if (seen.has(t) || t.length < 3 || /^\d/.test(t)) continue;
      seen.add(t);
      const n = rank(products, [t], {}).filter((r) => passes(r.p, r.d, { ...s, min: null, max: null, price: "" })).length;
      if (n) alternatives.push({ q: t, total: n });
    }
    alternatives.sort((a, b) => b.total - a.total);
  }
  const understood = {
    alternatives: alternatives.slice(0, 4),
    sort: s.sort !== given.sort ? s.sort : null,
    // A chip for a part that had to be loosened stays (it is what was typed) but says it is not applied.
    chips: read.chips
      .filter((c) => c.id !== "nearMe")
      .filter((c) => c.id !== "place" || placeHits.some((pl) => normalizeText(c.label).endsWith(pl)))
      .map((c) => ({ ...c, applied: !relaxed.some((r) => r.id === c.id || (r.id === "deals" && ["deals", "delivery", "store"].includes(c.id))) })),
    changes: read.changes,
    relaxed,
    partial,
    nearMe: false
  };
  const base = { total: kept.length, matched: matched.length, page, pageSize, pages, items, understood, ...(read.changes.length ? { corrected: read.groups.map((g) => g.join(" ")).join(" or ") } : {}) };
  if (itemsOnly) return base;
  // The filters follow the listing type picked: services show service filters, products product ones.
  const typed = s.type ? matched.filter((r) => r.d.listing === s.type) : matched;
  const facets = buildFacets(matched, s, dominantKinds(typed, s));
  const byType = countBy(matched.filter((r) => passes(r.p, r.d, s, "type")), (r) => [r.d.listing]);
  return {
    ...base,
    facets,
    quick: facets.filter((f) => f.id !== "kind").slice(0, QUICK_FILTERS).map((f) => f.id),
    listing: { product: byType.get("product") ?? 0, service: byType.get("service") ?? 0 },
    related: relatedSearches(matched, s)
  };
}

// The short facts a result row shows under the title ("30 W · 12 h · IP67 waterproof"), read from the same filter values.
// A number as a buyer reads it: 0.5 litres is "500 ml", 0.25 kg is "250 g", 64 on a storage filter is "64 GB", 60 minutes is "60 min".
const UNIT_OF = { gb: "GB", ramGb: "GB RAM", minutes: "min", count: "pcs", feet: "ft", seats: "seats", hz: "Hz", mm2: "mm²", thickInch: "in", shoeEu: "", gsm: "gsm", cc: "cc", mp: "MP", guests: "guests", channels: "cameras" };
function amountText(n, f) {
  const fmt = (x) => x.toLocaleString("en-KE", { maximumFractionDigits: 2 });
  if (f.reader === "litres") return n < 1 ? `${fmt(n * 1000)} ml` : `${fmt(n)} L`;
  if (f.reader === "kg") return n < 1 ? `${fmt(n * 1000)} g` : `${fmt(n)} kg`;
  if (f.reader === "gb" && n >= 1024) return `${fmt(n / 1024)} TB`;
  if (f.reader === "shoeEu") return `EU ${fmt(n)}`;
  if (f.reader === "year") return String(Math.round(n));
  if (f.reader === "abv") return `${fmt(n)}%`;
  if (f.reader === "months") return n >= 12 && n % 12 === 0 ? `${n / 12} yr${n > 12 ? "s" : ""}` : `${fmt(n)} months`;
  if (f.reader === "bedrooms") return n === 0 ? "Bedsitter" : `${fmt(n)} bedroom${n === 1 ? "" : "s"}`;
  const unit = f.unit || UNIT_OF[f.reader] || "";
  return `${fmt(n)}${unit ? ` ${unit}` : ""}`;
}

function rowFacts(p, d) {
  const facts = [];
  for (const id of d.kind?.facets ?? []) {
    const f = FACETS[id];
    const have = d.facetValues[id];
    if (!f || !have?.size) continue;
    if (f.type === "range") {
      const n = readNumber(readers[f.reader], p);
      if (n !== null) facts.push(`${amountText(n, f)}${id === "battery" ? " playtime" : id === "warranty" ? " warranty" : ""}`);
    } else {
      const on = f.values.filter((v) => have.has(v.id));
      // Sizes read as a span ("S to XL"); anything else shows its first value.
      const text = f.sizes && on.length > 1 ? `${on[0].label} to ${on[on.length - 1].label}` : on[0]?.label;
      const clean = text?.replace(/ \(.*\)$/, "");
      if (clean && facts.length < 4 && !facts.includes(clean)) facts.push(clean);
    }
    if (facts.length >= 4) break;
  }
  return {
    kind: d.kind ? { id: d.kind.id, label: d.kind.label } : null,
    listing: d.listing,
    // A service that comes to you says so on its card instead of "Pick up".
    comesToYou: Boolean(d.facetValues.homeService?.has("home")),
    price: d.price,
    condition: d.condition,
    delivers: d.delivers,
    facts
  };
}

export { COMMON_FACETS };
