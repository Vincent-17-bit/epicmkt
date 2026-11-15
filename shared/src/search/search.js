// Product search: match the words, work out what kind of product each result is, read its filter values, count every
// filter option (each one counted as if the shopper ticked it, the way Amazon counts), filter, rank, sort and page.
// Pure functions over a product list, so the demo, the browser fallback and the /api/products endpoint all agree.
import { normalizeText } from "../utils.js";
import { normalizeValueKey } from "../openValues.js";
import { COLOURS, COMMON_FACETS, FACETS, KINDS, KIND_BY_ID, KIND_BY_TYPE, SERVICE_CATEGORIES, readNumber, readers } from "./data/facetCatalog.js";

const SERVICE_KINDS = KINDS.filter((k) => k.service);
const GOODS_KINDS = KINDS.filter((k) => !k.service);

export const SEARCH_PAGE_SIZE = 16;
export const SEARCH_SORTS = [
  { id: "featured", label: "Featured" },
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

const SYNONYMS = {
  tv: ["television"], television: ["tv"], phone: ["smartphone"], smartphone: ["phone"], fridge: ["refrigerator"], soda: ["soft drink"],
  sofa: ["couch", "seater"], couch: ["sofa"], perfume: ["fragrance", "cologne", "parfum"], earphone: ["earbud", "headphone"],
  earbud: ["earphone"], laptop: ["notebook"], speaker: ["soundbar", "sound"], soundbar: ["speaker"], shoe: ["sneaker", "sandal"],
  trouser: ["pant", "jean"], jean: ["denim", "trouser"], cooker: ["jiko"], jiko: ["cooker"], mabati: ["iron sheet"], tyre: ["tire"],
  usb: ["flash"], flash: ["usb"], carpet: ["rug"], rug: ["carpet"], massage: ["spa"], cyber: ["printing", "photocopy"], chocolate: ["sweet"],
  wood: ["timber"], timber: ["wood"], bulb: ["light"]
};

// "speakers" -> "speaker", "batteries" -> "battery", "shoes" -> "shoe"; short words stay as they are.
export const stem = (word) => {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes)$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
};
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
const SERVICE_WORDS = /\b(?:making|made[- ]to[- ]measure|custom[- ]made|alterations?|repairs?|servic(?:e|ing)|install(?:ation)?|hire|lessons?|tuition|treatments?|consultation|appointment|per session|wash(?:ing)?|cleaning|refill)\b/i;

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
  for (const id of k?.facets ?? []) {
    const f = FACETS[id];
    if (!f) continue;
    if (f.type === "range") {
      const n = readNumber(readers[f.reader], p);
      const bucket = n === null ? null : f.values.find((v) => n >= v.min && (v.max === null || n <= v.max));
      facetValues[id] = bucket ? new Set([bucket.id]) : new Set();
    } else {
      // "What is it" filters read the name and the product's own type rows; a value marked onName reads the name only.
      const own = f.on === "name" ? ownText(p, f.label) : text;
      facetValues[id] = new Set(f.values.filter((v) => v.re.test(v.onName ? p.name ?? "" : own)).map((v) => v.id));
    }
  }
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
    condition: conditionOf(p, text, k),
    facetValues,
    onSale: Boolean(p.pricing?.savings > 0) || Boolean(p.flash),
    flash: Boolean(p.flash),
    delivers: p.business?.delivery?.offers === true
  };
  cache.set(p, d);
  return d;
}

// ---- the query ----------------------------------------------------------------------------------------------------
export const EMPTY_SEARCH = Object.freeze({
  q: "", kind: "", brands: [], colours: [], conditions: [], deals: [], delivery: false, shops: [], towns: [], store: [],
  min: null, max: null, price: "", facets: {}, sort: "featured", page: 1
});

const LIST_KEYS = { brands: "brand", colours: "colour", conditions: "cond", deals: "deal", shops: "shop", towns: "town", store: "store" };
const list = (v) => (v ? String(v).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40) : []);
const amount = (v) => (/^\d{1,9}$/.test(String(v ?? "")) ? Number(v) : null);

/** Reads a search from page address parameters (URLSearchParams or a plain object). */
export function parseSearch(params) {
  const get = (k) => (typeof params.get === "function" ? params.get(k) : params[k]) ?? null;
  const out = { ...EMPTY_SEARCH, facets: {} };
  out.q = String(get("q") ?? "").slice(0, 100);
  out.kind = KIND_BY_ID[get("k")] ? get("k") : "";
  for (const [field, key] of Object.entries(LIST_KEYS)) out[field] = list(get(key));
  out.delivery = get("dlv") === "1";
  out.min = amount(get("min"));
  out.max = amount(get("max"));
  out.price = PRICE_PRESETS.some((p) => p.id === get("price")) ? get("price") : "";
  out.sort = SEARCH_SORTS.some((s) => s.id === get("sort")) ? get("sort") : "featured";
  out.page = Math.min(500, Math.max(1, Math.round(Number(get("page"))) || 1));
  const keys = typeof params.keys === "function" ? [...params.keys()] : Object.keys(params);
  for (const key of keys) {
    const m = /^f_([a-zA-Z]+)$/.exec(key);
    if (m && FACETS[m[1]]) out.facets[m[1]] = list(get(key));
  }
  return out;
}

/** Writes a search to address parameters, leaving defaults out so links stay short and shareable. */
export function writeSearch(search) {
  const p = new URLSearchParams();
  if (search.q) p.set("q", search.q);
  if (search.kind) p.set("k", search.kind);
  for (const [field, key] of Object.entries(LIST_KEYS)) if (search[field]?.length) p.set(key, search[field].join(","));
  if (search.delivery) p.set("dlv", "1");
  if (search.price) p.set("price", search.price);
  if (search.min !== null && search.min !== undefined) p.set("min", String(search.min));
  if (search.max !== null && search.max !== undefined) p.set("max", String(search.max));
  for (const [id, values] of Object.entries(search.facets ?? {})) if (values?.length) p.set(`f_${id}`, values.join(","));
  if (search.sort && search.sort !== "featured") p.set("sort", search.sort);
  if (search.page > 1) p.set("page", String(search.page));
  return p;
}

// ---- matching -----------------------------------------------------------------------------------------------------
// A search word matches a product word when they are the same word, or the product word only adds an ending ("print" finds
// "printing" and "printer"). A longer word that merely starts the same is a different thing: "table" is not "tablets",
// "pen" is not "pencil" or "pendant", "cup" is not "cupcake", "bed" is not "bedsheet".
const ENDING = /^(?:e?s|ing|ed|er|ers|y|ies)$/;
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
function passes(p, d, search, skip = null) {
  if (skip !== "kind" && search.kind && d.kind?.id !== search.kind) return false;
  if (skip !== "brand" && search.brands.length && !search.brands.includes(d.brandKey)) return false;
  if (skip !== "colour" && search.colours.length && !search.colours.some((c) => d.colours.has(c))) return false;
  if (skip !== "condition" && search.conditions.length && !search.conditions.includes(d.condition)) return false;
  if (skip !== "deals" && search.deals.length && !search.deals.every((x) => (x === "flash" ? d.flash : d.onSale))) return false;
  if (skip !== "delivery" && search.delivery && !d.delivers) return false;
  if (skip !== "shop" && search.shops.length && !search.shops.includes(p.business?.slug)) return false;
  if (skip !== "town" && search.towns.length && !search.towns.includes(normalizeText(p.business?.town))) return false;
  if (skip !== "store") {
    for (const s of search.store) {
      if (s === "open" && !p.business?.isOpen) return false;
      if (s === "verified" && !p.business?.verified) return false;
      if (s === "featured" && !p.business?.featured) return false;
    }
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

const isStrong = (d, tokens) => !tokens.length || tokens.some((t) => [...d.name].some((w) => wordMatches(w, t)) || kindWords(d.kind).some((w) => wordMatches(w, t)));

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

function buildFacets(matched, search) {
  const others = (skip) => matched.filter((r) => passes(r.p, r.d, search, skip));
  const facets = [];
  const push = (facet) => {
    if (facet.values.length) facets.push(facet);
  };
  const kindCounts = countBy(others("kind"), (r) => [r.d.kind?.id]);
  push({
    id: "kind", label: "Department", type: "links",
    values: [...kindCounts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: KIND_BY_ID[id].label, count, selected: search.kind === id }))
  });
  const brandRows = others("brand");
  const brandNames = new Map();
  for (const r of brandRows) if (r.d.brandKey && !brandNames.has(r.d.brandKey)) brandNames.set(r.d.brandKey, r.d.brand.trim());
  push({
    id: "brand", label: "Brands", type: "checkbox",
    values: [...countBy(brandRows, (r) => [r.d.brandKey])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, count]) => ({ id, label: brandNames.get(id), count, selected: search.brands.includes(id) }))
  });
  for (const k of dominantKinds(matched, search)) {
    for (const id of k.facets) {
      const f = FACETS[id];
      if (!f || facets.some((x) => x.id === id)) continue;
      const counts = countBy(others(id), (r) => [...(r.d.facetValues[id] ?? [])]);
      push({
        id, label: f.label, type: "checkbox", kind: k.id,
        values: f.values.filter((v) => counts.get(v.id)).map((v) => ({ id: v.id, label: v.label, count: counts.get(v.id), selected: (search.facets[id] ?? []).includes(v.id) }))
      });
    }
  }
  const priceRows = others("price");
  const priced = priceRows.map((r) => r.d.price).filter((n) => n !== null);
  push({
    id: "price", label: "Price", type: "price",
    bounds: priced.length ? { min: Math.min(...priced), max: Math.max(...priced) } : null,
    values: PRICE_PRESETS.map((pr) => ({ ...pr, count: priced.filter((n) => n >= pr.min && (pr.max === null || n <= pr.max)).length, selected: search.price === pr.id })).filter((v) => v.count > 0)
  });
  const dealRows = others("deals");
  push({
    id: "deals", label: "Deals & discounts", type: "checkbox",
    values: [
      { id: "sale", label: "On sale", count: dealRows.filter((r) => r.d.onSale).length, selected: search.deals.includes("sale") },
      { id: "flash", label: "Flash sale now", count: dealRows.filter((r) => r.d.flash).length, selected: search.deals.includes("flash") }
    ].filter((v) => v.count > 0)
  });
  const colourCounts = countBy(others("colour"), (r) => [...r.d.colours]);
  push({
    id: "colour", label: "Colour", type: "swatch",
    values: COLOURS.filter((c) => colourCounts.get(c.id)).map((c) => ({ id: c.id, label: c.label, hex: c.hex, count: colourCounts.get(c.id), selected: search.colours.includes(c.id) }))
  });
  const condCounts = countBy(others("condition"), (r) => [r.d.condition]);
  push({ id: "condition", label: "Condition", type: "checkbox", values: CONDITIONS.filter((c) => condCounts.get(c.id)).map((c) => ({ ...c, count: condCounts.get(c.id), selected: search.conditions.includes(c.id) })) });
  const deliveryCount = others("delivery").filter((r) => r.d.delivers).length;
  push({ id: "delivery", label: "Delivery", type: "checkbox", values: deliveryCount ? [{ id: "1", label: "Shop delivers", count: deliveryCount, selected: search.delivery }] : [] });
  const shopRows = others("shop");
  const shopNames = new Map(shopRows.map((r) => [r.p.business?.slug, r.p.business?.name]));
  push({
    id: "shop", label: "Seller", type: "checkbox",
    values: [...countBy(shopRows, (r) => [r.p.business?.slug])].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: shopNames.get(id), count, selected: search.shops.includes(id) }))
  });
  const townRows = others("town");
  const townNames = new Map(townRows.map((r) => [normalizeText(r.p.business?.town), r.p.business?.town]));
  push({
    id: "town", label: "Town", type: "checkbox",
    values: [...countBy(townRows, (r) => [normalizeText(r.p.business?.town)])].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: townNames.get(id), count, selected: search.towns.includes(id) }))
  });
  const storeRows = others("store");
  push({
    id: "store", label: "Shop", type: "checkbox",
    values: [
      { id: "open", label: "Open now", count: storeRows.filter((r) => r.p.business?.isOpen).length },
      { id: "verified", label: "Verified shops", count: storeRows.filter((r) => r.p.business?.verified).length },
      { id: "featured", label: "Featured shops", count: storeRows.filter((r) => r.p.business?.featured).length }
    ].filter((v) => v.count > 0).map((v) => ({ ...v, selected: search.store.includes(v.id) }))
  });
  return facets;
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
    const conn = countBy(rows, (r) => [...(r.d.facetValues.connectivity ?? [])]);
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

/**
 * Runs a search. Returns { total, page, pageSize, pages, items, facets, related, kinds } where each item is the product plus
 * `search`: { kind, price, colours, highlights } for the result row.
 */
export function searchProducts(products, search = EMPTY_SEARCH, { pageSize = SEARCH_PAGE_SIZE } = {}) {
  const s = { ...EMPTY_SEARCH, ...search, facets: { ...(search.facets ?? {}) } };
  const tokens = tokensOf(s.q);
  const matched = [];
  for (const p of products) {
    const d = describe(p);
    const score = textScore(d, tokens) + (tokens.length && d.kind && tokens.some((t) => stem(d.kind.noun.split(" ").pop()) === t) ? 2 : 0);
    // Among equal matches, a fuller listing ranks first: more photos, a video, colour choices, a price.
    const quality = Math.min((p.images ?? []).length, 6) * 0.08 + ((p.videos ?? []).length ? 0.4 : 0) + Math.min((p.swatches ?? []).length, 5) * 0.05 + (d.price !== null ? 0.2 : 0);
    if (score > 0) matched.push({ p, d, score: score + quality + valueBonus(d, tokens), strong: isStrong(d, tokens) });
  }
  // What the search is mostly about ranks first among equal matches: "sugar" puts the sugar before the sugar test.
  const [first, second] = dominantKinds(matched, { ...s, kind: "" });
  for (const r of matched) r.score += r.d.kind && r.d.kind === first ? 1.5 : r.d.kind && r.d.kind === second ? 0.75 : 0;
  const kept = matched.filter((r) => passes(r.p, r.d, s));
  kept.sort(SORTERS[s.sort] ?? SORTERS.featured);
  const pages = Math.max(1, Math.ceil(kept.length / pageSize));
  const page = Math.min(s.page, pages);
  const items = kept.slice((page - 1) * pageSize, page * pageSize).map(({ p, d }) => ({ ...p, search: rowFacts(p, d) }));
  return { total: kept.length, matched: matched.length, page, pageSize, pages, items, facets: buildFacets(matched, s), related: relatedSearches(matched, s) };
}

// The short facts a result row shows under the title ("30 W · 12 h · IP67 waterproof"), read from the same filter values.
// A number as a buyer reads it: 0.5 litres is "500 ml", 0.25 kg is "250 g", 64 on a storage filter is "64 GB", 60 minutes is "60 min".
const UNIT_OF = { gb: "GB", ramGb: "GB RAM", minutes: "min", count: "pcs", feet: "ft", seats: "seats", hz: "Hz", mm2: "mm²", thickInch: "in", shoeEu: "" };
function amountText(n, f) {
  const fmt = (x) => x.toLocaleString("en-KE", { maximumFractionDigits: 2 });
  if (f.reader === "litres") return n < 1 ? `${fmt(n * 1000)} ml` : `${fmt(n)} L`;
  if (f.reader === "kg") return n < 1 ? `${fmt(n * 1000)} g` : `${fmt(n)} kg`;
  if (f.reader === "gb" && n >= 1024) return `${fmt(n / 1024)} TB`;
  if (f.reader === "shoeEu") return `EU ${fmt(n)}`;
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
      if (n !== null) facts.push(`${amountText(n, f)}${id === "battery" ? " playtime" : ""}`);
    } else {
      const on = f.values.filter((v) => have.has(v.id));
      // Sizes read as a span ("S to XL"); anything else shows its first value.
      const text = f.sizes && on.length > 1 ? `${on[0].label} to ${on[on.length - 1].label}` : on[0]?.label;
      const clean = text?.replace(/ \(.*\)$/, "");
      if (clean && facts.length < 4 && !facts.includes(clean)) facts.push(clean);
    }
    if (facts.length >= 4) break;
  }
  return { kind: d.kind ? { id: d.kind.id, label: d.kind.label } : null, price: d.price, condition: d.condition, delivers: d.delivers, facts };
}

export { COMMON_FACETS };
