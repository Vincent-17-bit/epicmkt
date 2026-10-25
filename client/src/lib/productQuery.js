// Page, facet and count answers for the home products grid, over a plain list of products.
//
// One implementation, two homes (same idea as api/browse/engine.js):
//   - client/api/products.js (Vercel edge) runs it over the shared snapshot and returns ONE page.
//   - the browser runs it over a full list only as the fallback when that endpoint is unreachable, and in demo mode.
// It must stay free of browser, Node and Supabase imports so it runs anywhere.
import { EMPTY_FILTERS, applyFilters, countsFor, facetsOf } from "./productFilters.js";

export const PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;

export function pageOf(products, filters, { page = 1, pageSize = PAGE_SIZE } = {}) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.round(pageSize) || PAGE_SIZE));
  const number = Math.max(1, Math.round(page) || 1);
  const rows = applyFilters(products, filters);
  const start = (number - 1) * size;
  return {
    items: rows.slice(start, start + size),
    total: rows.length,
    catalogTotal: products.length,
    page: number,
    pageSize: size,
    hasMore: start + size < rows.length
  };
}

// What can be filtered by, over the whole catalogue (it does not shift as filters are chosen).
export function facetsSummary(products) {
  const f = facetsOf(products);
  return { total: products.length, categories: f.categories, towns: f.towns, price: f.price };
}

// Live option counts for the filter sheet, as JSON (Maps become pair lists).
export function countsSummary(products, filters) {
  const c = countsFor(products, filters);
  return { categories: [...c.categories], towns: [...c.towns], flags: c.flags };
}

export const countsFromJson = (json) => ({
  categories: new Map(json?.categories ?? []),
  towns: new Map(json?.towns ?? []),
  flags: json?.flags ?? {}
});

export { EMPTY_FILTERS };
