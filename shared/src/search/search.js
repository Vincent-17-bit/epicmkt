// Product search: match the words, work out what kind of product each result is, read its filter values, count every
// filter option (each one counted as if the shopper ticked it, the way Amazon counts), filter, rank, sort and page.
// Pure functions over a product list, so the demo, the browser fallback and the /api/products endpoint all agree.
import { normalizeText } from "../utils.js";
import { normalizeValueKey } from "../openValues.js";
import { COLOURS, COMMON_FACETS, FACETS, KINDS, KIND_BY_ID, readNumber, readers } from "./facetCatalog.js";

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
  tv: ["television"], television: ["tv"], phone: ["smartphone", "mobile"], mobile: ["phone"], fridge: ["refrigerator"],
  sofa: ["couch", "seater"], couch: ["sofa"], perfume: ["fragrance", "cologne", "parfum"], earphone: ["earbud", "headphone"],
  earbud: ["earphone"], laptop: ["notebook"], speaker: ["soundbar", "sound"], soundbar: ["speaker"], shoe: ["sneaker", "sandal"],
  trouser: ["pant", "jean"], jean: ["denim", "trouser"], cooker: ["jiko"], jiko: ["cooker"], mabati: ["iron sheet"], tyre: ["tire"]
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

const specText = (p) => (p.specs ?? []).map((s) => `${s.label ?? ""}: ${s.value ?? ""}`).join(" · ");
const priceOf = (p) => {
  if (p.priceRange && Number.isFinite(p.priceRange.min)) return p.priceRange.min;
  const sale = p.pricing?.salePrice;
  if (Number.isFinite(sale)) return sale;
  return Number.isFinite(p.regularPrice) ? p.regularPrice : null;
};

export function kindOf(p) {
  const head = `${p.name ?? ""} ${p.section ?? ""} ${p.brand ?? ""}`;
  if (p.kind === "service") {
    const special = KINDS.find((k) => (k.id === "printing" || k.id === "auto") && k.re.test(head));
    return special ?? KIND_BY_ID.services;
  }
  return KINDS.find((k) => k.re.test(head)) ?? KINDS.find((k) => k.cats.includes(p.business?.categoryId)) ?? null;
}

function coloursOf(p) {
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

function conditionOf(p, text) {
  if (p.kind === "service") return null;
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
      facetValues[id] = new Set(f.values.filter((v) => v.re.test(text)).map((v) => v.id));
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
    condition: conditionOf(p, text),
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
function textScore(d, tokens) {
  if (!tokens.length) return 1;
  let score = 0;
  for (const t of tokens) {
    const options = [t, ...(SYNONYMS[t] ?? []).map(stem)];
    const inName = options.some((o) => [...d.name].some((w) => w.startsWith(o)));
    const inHay = inName || options.some((o) => [...d.hay].some((w) => w.startsWith(o)));
    if (!inHay) return 0;
    score += inName ? 3 : 1;
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

function dominantKinds(rows, search) {
  if (search.kind) return [KIND_BY_ID[search.kind]];
  const counts = countBy(rows, (r) => [r.d.kind?.id]);
  const total = rows.length || 1;
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
    if (score > 0) matched.push({ p, d, score: score + quality });
  }
  const kept = matched.filter((r) => passes(r.p, r.d, s));
  kept.sort(SORTERS[s.sort] ?? SORTERS.featured);
  const pages = Math.max(1, Math.ceil(kept.length / pageSize));
  const page = Math.min(s.page, pages);
  const items = kept.slice((page - 1) * pageSize, page * pageSize).map(({ p, d }) => ({ ...p, search: rowFacts(p, d) }));
  return { total: kept.length, matched: matched.length, page, pageSize, pages, items, facets: buildFacets(matched, s), related: relatedSearches(matched, s) };
}

// The short facts a result row shows under the title ("30 W · 12 h · IP67 waterproof"), read from the same filter values.
function rowFacts(p, d) {
  const facts = [];
  for (const id of d.kind?.facets ?? []) {
    const f = FACETS[id];
    const have = d.facetValues[id];
    if (!f || !have?.size) continue;
    if (f.type === "range") {
      const n = readNumber(readers[f.reader], p);
      if (n !== null) facts.push(`${n.toLocaleString("en-KE")}${f.unit ? ` ${f.unit}` : ""}${id === "battery" ? " playtime" : ""}`);
    } else {
      const first = f.values.find((v) => have.has(v.id));
      if (first && facts.length < 4) facts.push(first.label.replace(/ \(.*\)$/, ""));
    }
    if (facts.length >= 4) break;
  }
  return { kind: d.kind ? { id: d.kind.id, label: d.kind.label } : null, price: d.price, condition: d.condition, delivers: d.delivers, facts };
}

export { COMMON_FACETS };
