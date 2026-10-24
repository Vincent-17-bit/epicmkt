// Fallback path: the browser builds the catalog snapshot itself, straight from Supabase.
// This is what the app did before the cached /api/browse endpoint existed. It is slow on a big catalog, so it only runs when
// that endpoint cannot be reached (local dev without the Vercel functions, or an outage), and it uses the same engine
// as the endpoint so both always answer the same way.
import { NotFoundError } from "@epicmkt/backend";
import { store } from "@epicmkt/backend/store";
import { supabase } from "../applications/supabaseClient";
import { mediaUrl } from "../flash/shape.js";
import * as engine from "./engine.js";

const PAGE = 1000;
const MAX_PAGES = 20;
const TTL_MS = 30_000;

const failure = (error) => Object.assign(new Error(error?.message || "request_failed"), { name: "BrowseApiError", code: error?.code ?? null });

const unwrap = ({ data, error }) => {
  if (error) throw failure(error);
  return data;
};

const fetchAll = async (table, columns) => {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const data = unwrap(await supabase.from(table).select(columns).order("id").range(from, from + PAGE - 1)) ?? [];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
};

const fetchCategoryRows = async () =>
  unwrap(await supabase.from("categories").select("id,name,icon,sort,active").eq("active", true).order("sort")) ?? [];

// Cards show "Flash sale" and "Offer" chips, so we need each business's live end times.
// This is decoration: if it cannot be read, the cards still render without the chip.
const fetchEnds = async (table, columns, endOf) => {
  try {
    const rows = await fetchAll(table, columns);
    const ends = new Map();
    for (const row of rows) {
      const at = endOf(row);
      if (!row.business_id || Number.isNaN(at)) continue;
      ends.set(row.business_id, [...(ends.get(row.business_id) ?? []), at]);
    }
    return ends;
  } catch {
    return new Map();
  }
};

const fetchFlashEnds = () => fetchEnds("public_flash_sales", "id,business_id,ends_at", (row) => Date.parse(row.ends_at));

// An offer with no end date runs until the seller turns it off.
const fetchOfferEnds = () =>
  fetchEnds("public_offers", "id,business_id,ends_at", (row) => (row.ends_at ? Date.parse(row.ends_at) : Infinity));

const build = async () => {
  const [rows, items, categoryRows, flashEnds, offerEnds] = await Promise.all([
    fetchAll("public_businesses", "*"),
    fetchAll("public_items", "id,business_id,price,price_type"),
    fetchCategoryRows(),
    fetchFlashEnds(),
    fetchOfferEnds()
  ]);
  const lowest = new Map();
  for (const item of items) {
    if (!engine.PRICED.has(item.price_type) || item.price === null || item.price === undefined) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price)) continue;
    const prior = lowest.get(item.business_id);
    if (prior === undefined || price < prior) lowest.set(item.business_id, price);
  }
  return engine.buildSnapshot({ rows, lowest, flashEnds, offerEnds, categoryRows, localCategories: store.categories, mediaUrl });
};

let cache = null;
let inflight = null;
let generation = 0;

export function invalidateBrowseCache() {
  generation += 1;
  cache = null;
  inflight = null;
}

const load = () => {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.value);
  if (inflight) return inflight;
  const started = generation;
  const promise = build()
    .then((value) => {
      if (started === generation) cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      if (inflight === promise) inflight = null;
    });
  inflight = promise;
  return promise;
};

const asNotFound = (error) => (error?.name === "NotFoundError" ? new NotFoundError(error.message) : error);

export const getCategories = async () => engine.getCategories(await load());
export const getTowns = async () => engine.getTowns(await load());
export const getCounties = async () => engine.getCounties(await load());
export const searchBusinesses = async (params) => engine.searchBusinesses(await load(), params);
export const getSearchFacets = async (params) => engine.getSearchFacets(await load(), params);
export const getSuggestions = async (prefix, limit) => engine.getSuggestions(await load(), prefix, limit);
export const getFeaturedBusinesses = async (params) => engine.getFeaturedBusinesses(await load(), params);
export const getNearbyBusinesses = async (params) => engine.getNearbyBusinesses(await load(), params);
export const getSimilarBusinesses = async (ref, limit) => {
  const snap = await load();
  try {
    return engine.getSimilarBusinesses(snap, ref, limit);
  } catch (error) {
    throw asNotFound(error);
  }
};

export async function getTopSearches(limit = 10) {
  const rows = unwrap(await supabase.rpc("top_searches", { p_limit: limit })) ?? [];
  return rows.map((row) => ({ term: row.term, count: row.count, hot: Boolean(row.hot) }));
}

export async function logSearch(term) {
  try {
    await supabase.rpc("log_search", { p_term: term });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
