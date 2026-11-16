import * as backend from "@epicmkt/backend";
import { EMPTY_FILTERS } from "../../lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../../lib/productQuery.js";
import { buildSuggestIndex, suggestFrom } from "../../lib/suggest.js";
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

// The most searched terms of the last 24 hours, worked out on the hour. Demo: the in-memory backend's live count, each term
// with a picture from a product it finds (as the database does).
export const getTrending = async () => {
  if (isLive()) return (await live()).getTrending();
  const rows = await backend.getTopSearches(10).catch(() => []);
  const index = await demo();
  const items = rows.map((r) => {
    const p = suggestFrom(index, r.term).products[0];
    return { term: r.term, count: r.count, hot: r.hot, ...(p ? { itemId: p.id, label: p.name, slug: p.slug, image: p.image, price: p.price } : {}) };
  });
  return { computedAt: new Date().toISOString(), live: true, items };
};
