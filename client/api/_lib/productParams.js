// Turns the products endpoint's query string into clean filters, and filters into ONE canonical query string.
//
// Same two jobs as browseParams.js: this endpoint is public, so every number is clamped and every string length-limited;
// and the CDN caches by URL, so the same question must always be the same URL (sorted keys, empty values dropped).

import { EMPTY_FILTERS, SORTS } from "../../src/lib/productFilters.js";
import { MAX_PAGE_SIZE, PAGE_SIZE } from "../../src/lib/productQuery.js";

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
    sort: SORT_IDS.has(sort) ? sort : "newest",
    min: amount(get("min")),
    max: amount(get("max")),
    categories: list(get("cat")),
    towns: list(get("town"))
  };
  for (const [name, key] of Object.entries(FLAGS)) filters[name] = get(key) === "1";
  const page = Math.min(10_000, Math.max(1, Math.round(Number(get("page"))) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.round(Number(get("pageSize"))) || PAGE_SIZE));
  return { op, filters, page, pageSize };
}

export function canonicalQuery(op, filters = EMPTY_FILTERS, { page = 1, pageSize = PAGE_SIZE } = {}) {
  const pairs = [["op", op]];
  if (op !== "facets") {
    if (String(filters.q ?? "").trim()) pairs.push(["q", String(filters.q).trim().slice(0, 80)]);
    if (filters.sort && filters.sort !== "newest" && op === "page") pairs.push(["sort", filters.sort]);
    if (filters.min !== "" && filters.min != null) pairs.push(["min", String(filters.min)]);
    if (filters.max !== "" && filters.max != null) pairs.push(["max", String(filters.max)]);
    if (filters.categories?.length) pairs.push(["cat", [...new Set(filters.categories)].sort().join(",")]);
    if (filters.towns?.length) pairs.push(["town", [...new Set(filters.towns)].sort().join(",")]);
    for (const [name, key] of Object.entries(FLAGS)) if (filters[name]) pairs.push([key, "1"]);
  }
  if (op === "page") {
    if (page > 1) pairs.push(["page", String(page)]);
    if (pageSize !== PAGE_SIZE) pairs.push(["pageSize", String(pageSize)]);
  }
  pairs.sort((a, b) => (a[0] === "op" ? -1 : b[0] === "op" ? 1 : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
