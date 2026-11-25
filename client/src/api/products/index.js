import * as backend from "@epicmkt/backend";
import { isLive } from "../flash/mode.js";

// With Supabase configured, products come from the cached /api/products endpoint (see ./live.js).
// Without it (local dev, tests) the in-memory demo backend answers, through the same pure query functions.
const live = () => import("./live.js");

// The pure query code (filters, paging, the suggestion dictionary) drags the whole search engine with it, and the first page never
// needs it: the live site asks the endpoint, and only the demo build runs it here. So it is loaded when first used, not up front.
const query = () => Promise.all([import("../../lib/productFilters.js"), import("../../lib/productQuery.js")]).then(([f, q]) => ({ ...f, ...q }));
const suggestLib = () => import("../../lib/suggest.js");
const filtersOr = async (filters) => filters ?? (await import("../../lib/productFilters.js")).EMPTY_FILTERS;

export const getPage = async (filters, opts = {}) => {
  if (isLive()) return (await live()).getProductsPage(await filtersOr(filters), opts);
  const { pageOf, EMPTY_FILTERS } = await query();
  return pageOf(await backend.getAllProducts(), filters ?? EMPTY_FILTERS, opts);
};

export const getFacets = async () => {
  if (isLive()) return (await live()).getProductFacets();
  const { facetsSummary } = await query();
  return facetsSummary(await backend.getAllProducts());
};

export const getCounts = async (filters) => {
  if (isLive()) return (await live()).getProductCounts(await filtersOr(filters));
  const { countsSummary, EMPTY_FILTERS } = await query();
  return countsSummary(await backend.getAllProducts(), filters ?? EMPTY_FILTERS);
};

// Type-ahead over products, stores and phrases. Demo: the same rules over the demo products, the dictionary built once.
let demoIndex = null;
const demo = async () => {
  const products = await backend.getAllProducts();
  if (demoIndex?.products !== products) demoIndex = { products, index: (await suggestLib()).buildSuggestIndex(products) };
  return demoIndex.index;
};

export const getSuggest = async (prefix) => {
  if (isLive()) return (await live()).getSuggest(prefix);
  const index = await demo();
  return { ...(await suggestLib()).suggestFrom(index, prefix), source: "demo" };
};

// What shoppers search for. Demo: the in-memory backend's live count, each term with a picture and a kind. The demo suggestion index only
// knows products, so a store or category is recognised from the demo backend's own shops and categories; "rising" is the terms that are
// hot right now. The database does the real ranking.
const demoNorm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
export const getTrending = async () => {
  if (isLive()) return (await live()).getTrending();
  const rows = await backend.getTopSearches(10).catch(() => []);
  // The search engine is large and only the demo build needs it here, so it is loaded on demand, never with the first page.
  const { tidyTrending } = await import("@epicmkt/shared/search");
  const [products, cats, found] = await Promise.all([
    backend.getAllProducts(),
    backend.getCategories().catch(() => []),
    backend.searchBusinesses({ pageSize: 200 }).catch(() => null)
  ]);
  const shops = found?.items ?? found?.results ?? found?.businesses ?? (Array.isArray(found) ? found : []);
  const shopNames = new Set(shops.map((b) => demoNorm(b.name)));
  const catNames = new Set(cats.flatMap((c) => [demoNorm(c.name), demoNorm(c.singular)]));
  const kindOf = (term) => (shopNames.has(demoNorm(term)) ? "store" : catNames.has(demoNorm(term)) ? "category" : "product");
  // tidyTrending checks product words against the catalogue, keeps a store or category as it is, and tops the list up to 10
  const popular = tidyTrending(rows.map((r) => ({ term: r.term, count: r.count, hot: r.hot, kind: kindOf(r.term) })), products, 10).map((x, i) => ({ ...x, rank: i + 1 }));
  const rising = popular.filter((x) => x.hot).map((x, i) => ({ ...x, rank: i + 1, ratio: null }));
  return { computedAt: new Date().toISOString(), live: true, scope: "*", fallback: "none", popular, rising, items: popular };
};
