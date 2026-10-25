import * as backend from "@epicmkt/backend";
import { EMPTY_FILTERS } from "../../lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../../lib/productQuery.js";
import { isLive } from "../flash/mode.js";

// With Supabase configured, products come from the cached /api/products endpoint (see ./live.js).
// Without it (local dev, tests) the in-memory demo backend answers, through the same pure query functions.
const live = () => import("./live.js");

export const getPage = async (filters = EMPTY_FILTERS, opts = {}) =>
  isLive() ? (await live()).getProductsPage(filters, opts) : pageOf(await backend.getAllProducts(), filters, opts);

export const getFacets = async () => (isLive() ? (await live()).getProductFacets() : facetsSummary(await backend.getAllProducts()));

export const getCounts = async (filters = EMPTY_FILTERS) =>
  isLive() ? (await live()).getProductCounts(filters) : countsSummary(await backend.getAllProducts(), filters);
