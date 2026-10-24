import { normalizeText } from "../../../shared/src/utils.js";

// Everything a shopper can do to narrow or reorder the home page products. Pure functions over the product list, so
// the same rules apply to demo and live data and are easy to test. The state lives in the page address (?psort=...).

export const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
  { id: "discount", label: "Biggest discount" },
  { id: "name", label: "Name: A to Z" }
];

export const EMPTY_FILTERS = Object.freeze({
  q: "",
  sort: "newest",
  min: "",
  max: "",
  categories: [],
  towns: [],
  inStock: false,
  onSale: false,
  flash: false,
  verified: false,
  featured: false,
  photo: false,
  openNow: false
});

const FLAGS = { inStock: "pstock", onSale: "psale", flash: "pflash", verified: "pver", featured: "pfeat", photo: "pphoto", openNow: "popen" };
const SOLD_OUT = new Set(["out_of_stock", "unavailable"]);
const KEYS = ["pq", "psort", "pmin", "pmax", "pcat", "ptown", ...Object.values(FLAGS)];

const list = (value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);
const amount = (value) => (/^\d{1,9}$/.test(value ?? "") ? value : "");

export function parseFilters(params) {
  const sort = params.get("psort");
  const filters = {
    ...EMPTY_FILTERS,
    q: (params.get("pq") ?? "").slice(0, 80),
    sort: SORTS.some((s) => s.id === sort) ? sort : "newest",
    min: amount(params.get("pmin")),
    max: amount(params.get("pmax")),
    categories: list(params.get("pcat")),
    towns: list(params.get("ptown"))
  };
  for (const [name, key] of Object.entries(FLAGS)) filters[name] = params.get(key) === "1";
  return filters;
}

// Returns new search params: the page's other params are kept, ours are rewritten, defaults are left out.
export function writeFilters(params, filters) {
  const next = new URLSearchParams(params);
  for (const key of KEYS) next.delete(key);
  if (filters.q.trim()) next.set("pq", filters.q.trim());
  if (filters.sort !== "newest") next.set("psort", filters.sort);
  if (filters.min !== "") next.set("pmin", filters.min);
  if (filters.max !== "") next.set("pmax", filters.max);
  if (filters.categories.length) next.set("pcat", filters.categories.join(","));
  if (filters.towns.length) next.set("ptown", filters.towns.join(","));
  for (const [name, key] of Object.entries(FLAGS)) if (filters[name]) next.set(key, "1");
  return next;
}

// How many things are narrowing the list (sorting is not narrowing).
export function countActive(filters) {
  let n = 0;
  if (filters.q.trim()) n += 1;
  if (filters.min !== "" || filters.max !== "") n += 1;
  n += filters.categories.length + filters.towns.length;
  for (const name of Object.keys(FLAGS)) if (filters[name]) n += 1;
  return n;
}

const price = (p) => (Number.isFinite(p.pricing?.salePrice) ? p.pricing.salePrice : null);
const newest = (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const SORTERS = {
  newest,
  price_asc: (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity) || newest(a, b),
  price_desc: (a, b) => (price(b) ?? -Infinity) - (price(a) ?? -Infinity) || newest(a, b),
  discount: (a, b) => (b.pricing?.discountPercent ?? 0) - (a.pricing?.discountPercent ?? 0) || newest(a, b),
  name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || newest(a, b)
};

export function applyFilters(products, filters) {
  const tokens = normalizeText(filters.q).split(" ").filter(Boolean);
  let min = filters.min === "" ? null : Number(filters.min);
  let max = filters.max === "" ? null : Number(filters.max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const towns = new Set(filters.towns.map(normalizeText));
  const categories = new Set(filters.categories);

  const kept = products.filter((p) => {
    const store = p.business ?? {};
    if (tokens.length) {
      // The server precomputes this once per snapshot (p.hay); the browser fallback computes it per call.
      const hay = p.hay ?? normalizeText(`${p.name} ${p.description ?? ""} ${p.section ?? ""} ${store.name ?? ""} ${store.town ?? ""}`);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    if (min !== null || max !== null) {
      const value = price(p);
      if (value === null) return false;
      if (min !== null && value < min) return false;
      if (max !== null && value > max) return false;
    }
    if (categories.size && !categories.has(store.categoryId)) return false;
    if (towns.size && !towns.has(normalizeText(store.town))) return false;
    if (filters.inStock && SOLD_OUT.has(p.availability)) return false;
    if (filters.onSale && !(p.pricing?.savings > 0)) return false;
    if (filters.flash && !p.flash) return false;
    if (filters.verified && !store.verified) return false;
    if (filters.featured && !store.featured) return false;
    if (filters.openNow && !store.isOpen) return false;
    if (filters.photo && !p.imageUrl) return false;
    return true;
  });
  return kept.sort(SORTERS[filters.sort] ?? SORTERS.newest);
}

// What is on offer to filter by, counted over the whole list so the options do not shift as filters are chosen.
export function facetsOf(products) {
  const categories = new Map();
  const towns = new Map();
  let min = Infinity;
  let max = -Infinity;
  for (const p of products) {
    const store = p.business ?? {};
    if (store.categoryId) categories.set(store.categoryId, (categories.get(store.categoryId) ?? 0) + 1);
    if (store.town) {
      const key = normalizeText(store.town);
      const entry = towns.get(key) ?? { slug: key, name: store.town, count: 0 };
      entry.count += 1;
      towns.set(key, entry);
    }
    const value = price(p);
    if (value !== null) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return {
    categories: [...categories].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
    towns: [...towns.values()].sort((a, b) => a.name.localeCompare(b.name)),
    price: Number.isFinite(min) ? { min, max } : null
  };
}

// One removable chip per active filter, for the row under the heading.
export function chipsOf(filters, { categoryName = (id) => id, townName = (slug) => slug } = {}) {
  const chips = [];
  if (filters.q.trim()) chips.push({ key: "q", label: `"${filters.q.trim()}"`, clear: (f) => ({ ...f, q: "" }) });
  if (filters.min !== "" || filters.max !== "") {
    const label = filters.min !== "" && filters.max !== "" ? `KES ${filters.min} to ${filters.max}` : filters.min !== "" ? `KES ${filters.min} and up` : `Up to KES ${filters.max}`;
    chips.push({ key: "price", label, clear: (f) => ({ ...f, min: "", max: "" }) });
  }
  for (const id of filters.categories) chips.push({ key: `cat:${id}`, label: categoryName(id), clear: (f) => ({ ...f, categories: f.categories.filter((c) => c !== id) }) });
  for (const slug of filters.towns) chips.push({ key: `town:${slug}`, label: townName(slug), clear: (f) => ({ ...f, towns: f.towns.filter((t) => t !== slug) }) });
  const named = { inStock: "In stock", onSale: "On sale", flash: "Flash sale", verified: "Verified stores", featured: "Featured stores", photo: "With photo", openNow: "Open now" };
  for (const [name, label] of Object.entries(named)) if (filters[name]) chips.push({ key: name, label, clear: (f) => ({ ...f, [name]: false }) });
  return chips;
}

// Live option counts: each option shows how many products it would leave, given every OTHER filter in force.
export function countsFor(products, filters) {
  const without = (patch) => applyFilters(products, { ...filters, ...patch });
  const tally = (rows, pick) => {
    const map = new Map();
    for (const p of rows) {
      const key = pick(p);
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const flags = {};
  for (const name of Object.keys(FLAGS)) flags[name] = without({ [name]: true }).length;
  return {
    categories: tally(without({ categories: [] }), (p) => p.business?.categoryId),
    towns: tally(without({ towns: [] }), (p) => normalizeText(p.business?.town)),
    flags
  };
}
