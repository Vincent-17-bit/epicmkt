// Page, facet and count answers for the home products grid, over a plain list of products.
//
// One implementation, two homes (same idea as api/browse/engine.js):
//   - client/api/products.js (Vercel edge) runs it over the shared snapshot and returns ONE page.
//   - the browser runs it over a full list only as the fallback when that endpoint is unreachable, and in demo mode.
// It must stay free of browser, Node and Supabase imports so it runs anywhere.
import { EMPTY_FILTERS, applyFilters, countsFor, facetsOf } from "./productFilters.js";
import { FEED_MAX_PAGES, blendFeed, epochOf, pagesOf } from "./feed.js";

export const PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export { FEED_MAX_PAGES };

/**
 * One page of the list. Shallow on purpose: at most `maxPages` pages exist (lib/feed.js); `capped` says more products match
 * than those pages hold, so the page can invite the visitor to narrow the list instead of paging on.
 * A recommended list is the blended feed of `epoch` (the visitor's rotation hour); every other sort is a plain sort.
 */
export function pageOf(products, filters, { page = 1, pageSize = PAGE_SIZE, epoch = null, maxPages = FEED_MAX_PAGES } = {}) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.round(pageSize) || PAGE_SIZE));
  const number = Math.max(1, Math.round(page) || 1);
  const recommended = (filters?.sort ?? EMPTY_FILTERS.sort) === "recommended";
  const hour = Number.isInteger(epoch) ? epoch : epochOf();
  const rows = applyFilters(products, recommended ? { ...filters, sort: "newest" } : filters);
  const ordered = recommended ? blendFeed(rows, { epoch: hour, pageSize: size, limit: maxPages * size }) : rows;
  // A recommended list leaves out what was added during its hour (it joins the next hour's order), so it counts its own pool.
  const count = recommended ? ordered.poolSize : rows.length;
  const pages = pagesOf(count, size, maxPages);
  const reachable = Math.min(count, pages * size);
  const start = (number - 1) * size;
  return {
    items: number <= pages ? ordered.slice(start, Math.min(start + size, reachable)) : [],
    total: count,
    catalogTotal: products.length,
    page: number,
    pageSize: size,
    pages,
    hasMore: number < pages && start + size < reachable,
    capped: count > reachable,
    ...(recommended ? { epoch: hour } : {})
  };
}

// What can be filtered by, over the whole catalogue (it does not shift as filters are chosen).
export function facetsSummary(products) {
  const f = facetsOf(products);
  return { total: products.length, categories: f.categories, towns: f.towns, brands: f.brands, colours: f.colours, price: f.price, sizes: f.sizes };
}

// Live option counts for the filter sheet, as JSON (Maps become pair lists).
export function countsSummary(products, filters) {
  const c = countsFor(products, filters);
  return { categories: [...c.categories], towns: [...c.towns], brands: [...c.brands], colours: [...c.colours], sizes: [...c.sizes], flags: c.flags };
}

export const countsFromJson = (json) => ({
  categories: new Map(json?.categories ?? []),
  towns: new Map(json?.towns ?? []),
  brands: new Map(json?.brands ?? []),
  colours: new Map(json?.colours ?? []),
  sizes: new Map(json?.sizes ?? []),
  flags: json?.flags ?? {}
});

export { EMPTY_FILTERS };
