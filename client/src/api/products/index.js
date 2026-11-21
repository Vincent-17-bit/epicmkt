import * as backend from "@epicmkt/backend";
import { EMPTY_FILTERS } from "../../lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../../lib/productQuery.js";
import { buildSuggestIndex, suggestFrom } from "../../lib/suggest.js";
import { tidyTrending } from "@epicmkt/shared";
import { isLive } from "../flash/mode.js";

// With Supabase configured, products come from the cached /api/products endpoint (see ./live.js).
// Without it (local dev, tests) the in-memory demo backend answers, through the same pure query functions.
const live = () => import("./live.js");

export const getPage = async (filters = EMPTY_FILTERS, opts = {}) =>
  isLive() ? (await live()).getProductsPage(filters, opts) : pageOf(await backend.getAllProducts(), filters, opts);

export const getFacets = async () => (isLive() ? (await live()).getProductFacets() : facetsSummary(await backend.getAllProducts()));

export const getCounts = async (filters = EMPTY_FILTERS) =>
  isLive() ? (await live()).getProductCounts(filters) : countsSummary(await backend.getAllProducts(), filters);

// Type-ahead over products, stores and phrases. Demo: the same rules over the demo products, the dictionary built once.
let demoIndex = null;
const demo = async () => {
  const products = await backend.getAllProducts();
  if (demoIndex?.products !== products) demoIndex = { products, index: buildSuggestIndex(products) };
  return demoIndex.index;
};

export const getSuggest = async (prefix) => {
  if (isLive()) return (await live()).getSuggest(prefix);
  return { ...suggestFrom(await demo(), prefix), source: "demo" };
};

// What shoppers search for. Demo: the in-memory backend's live count, each term with a picture and a kind. The demo suggestion index only
// knows products, so a store or category is recognised from the demo backend's own shops and categories; "rising" is the terms that are
// hot right now. The database does the real ranking.
const demoNorm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s$/, "");
export const getTrending = async (county = null) => {
  if (isLive()) return (await live()).getTrending(county);
  const rows = await backend.getTopSearches(10).catch(() => []);
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
  return { computedAt: new Date().toISOString(), live: true, scope: "*", county, fallback: "none", popular, rising, items: popular };
};
