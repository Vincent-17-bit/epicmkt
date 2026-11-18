// Turns the products endpoint's query string into clean filters, and filters into ONE canonical query string.
//
// Same two jobs as browseParams.js: this endpoint is public, so every number is clamped and every string length-limited;
// and the CDN caches by URL, so the same question must always be the same URL (sorted keys, empty values dropped).

import { DEFAULT_SORT, EMPTY_FILTERS, SORTS } from "../../src/lib/productFilters.js";
import { clampVariant } from "../../src/lib/feed.js";
import { MAX_PAGE_SIZE, PAGE_SIZE } from "../../src/lib/productQuery.js";
import { parseSizes, writeSizes } from "../../src/lib/sizeFilters.js";

const OPS = new Set(["page", "facets", "counts"]);
const SORT_IDS = new Set(SORTS.map((s) => s.id));
const FLAGS = { inStock: "stock", onSale: "sale", flash: "flash", verified: "ver", featured: "feat", photo: "photo", openNow: "open" };

export const isOp = (op) => OPS.has(op);

const list = (value, max = 24) =>
  value
    ? [...new Set(String(value).split(",").map((v) => v.trim().slice(0, 60)).filter(Boolean))].sort().slice(0, max)
    : [];
const amount = (value) => (/^\d{1,9}$/.test(value ?? "") ? value : "");

export function parseRequest(searchParams) {
  const get = (k) => searchParams.get(k);
  const op = get("op");
  if (!isOp(op)) return null;
  const sort = get("sort");
  const filters = {
    ...EMPTY_FILTERS,
    q: String(get("q") ?? "").trim().slice(0, 80),
    sort: SORT_IDS.has(sort) ? sort : DEFAULT_SORT,
    min: amount(get("min")),
    max: amount(get("max")),
    categories: list(get("cat")),
    towns: list(get("town")),
    // Brands and colours were missing here, so in live mode the home list ignored them; they travel like the other lists now.
    brands: list(get("brand")),
    colours: list(get("colour"), 14)
  };
  for (const [name, key] of Object.entries(FLAGS)) filters[name] = get(key) === "1";
  // Sizes: the same two parameters as the page address (psize, prange), read by the Size filter's own parser, which drops unknown scales and
  // bad numbers. The lists are capped, like every other list here.
  const sized = parseSizes(new URLSearchParams({ psize: String(get("psize") ?? "").slice(0, 900), prange: String(get("prange") ?? "").slice(0, 200) }));
  filters.sizes = [...new Set(sized.sizes)].sort().slice(0, 24);
  filters.ranges = Object.fromEntries(Object.entries(sized.ranges).sort(([a], [b]) => a.localeCompare(b)).slice(0, 4));
  const page = Math.min(10_000, Math.max(1, Math.round(Number(get("page"))) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.round(Number(get("pageSize"))) || PAGE_SIZE));
  // The rotation hour of a recommended list (lib/feed.js). Only digits; the endpoint clamps it to the last few hours.
  const epoch = /^\d{1,9}$/.test(get("epoch") ?? "") ? Number(get("epoch")) : null;
  // Which of the hour's few orders (lib/feed.js FEED_VARIANTS) this visit drew; anything else is the first.
  const variant = clampVariant(get("variant"));
  return { op, filters, page, pageSize, epoch, variant };
}

export function canonicalQuery(op, filters = EMPTY_FILTERS, { page = 1, pageSize = PAGE_SIZE, epoch = null, variant = 0 } = {}) {
  const pairs = [["op", op]];
  if (op !== "facets") {
    if (String(filters.q ?? "").trim()) pairs.push(["q", String(filters.q).trim().slice(0, 80)]);
    if (filters.sort && filters.sort !== DEFAULT_SORT && op === "page") pairs.push(["sort", filters.sort]);
    if (filters.min !== "" && filters.min != null) pairs.push(["min", String(filters.min)]);
    if (filters.max !== "" && filters.max != null) pairs.push(["max", String(filters.max)]);
    if (filters.categories?.length) pairs.push(["cat", [...new Set(filters.categories)].sort().join(",")]);
    if (filters.towns?.length) pairs.push(["town", [...new Set(filters.towns)].sort().join(",")]);
    if (filters.brands?.length) pairs.push(["brand", [...new Set(filters.brands)].sort().join(",")]);
    if (filters.colours?.length) pairs.push(["colour", [...new Set(filters.colours)].sort().join(",")]);
    for (const [name, key] of Object.entries(FLAGS)) if (filters[name]) pairs.push([key, "1"]);
    // Sorted, so the same sizes picked in another order are the same URL (the CDN caches by URL).
    const sized = writeSizes(new URLSearchParams(), { sizes: [...new Set(filters.sizes ?? [])].sort(), ranges: Object.fromEntries(Object.entries(filters.ranges ?? {}).sort(([a], [b]) => a.localeCompare(b))) });
    for (const key of ["psize", "prange"]) if (sized.has(key)) pairs.push([key, sized.get(key)]);
  }
  if (op === "page") {
    if (page > 1) pairs.push(["page", String(page)]);
    if (pageSize !== PAGE_SIZE) pairs.push(["pageSize", String(pageSize)]);
    // One cache entry per rotation hour: everyone browsing in the same hour shares it at the CDN.
    if ((filters.sort ?? DEFAULT_SORT) === DEFAULT_SORT && Number.isInteger(epoch)) pairs.push(["epoch", String(epoch)]);
    if ((filters.sort ?? DEFAULT_SORT) === DEFAULT_SORT && clampVariant(variant) > 0) pairs.push(["variant", String(clampVariant(variant))]);
  }
  pairs.sort((a, b) => (a[0] === "op" ? -1 : b[0] === "op" ? 1 : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
