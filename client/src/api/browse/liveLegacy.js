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
const searchLocal = async (params) => engine.searchBusinesses(await load(), params);
const facetsLocal = async (params) => engine.getSearchFacets(await load(), params);
const suggestionsLocal = async (prefix, limit) => engine.getSuggestions(await load(), prefix, limit);

const MAX_PAGE_SIZE = 100;
const CATEGORY_TTL_MS = 30_000;

const isMissingRpc = (error) => error?.code === "PGRST202" || error?.code === "42883";

const viaDatabase = async (remote, local) => {
  try {
    return await remote();
  } catch (error) {
    if (!isMissingRpc(error)) throw error;
    return local();
  }
};

let categoryCache = null;

const loadCategories = async () => {
  if (categoryCache && Date.now() - categoryCache.at < CATEGORY_TTL_MS) return categoryCache.rows;
  const rows = await fetchCategoryRows();
  categoryCache = { at: Date.now(), rows };
  return rows;
};

const fetchEndsFor = async (table, ids, endOf) => {
  if (!ids.length) return new Map();
  try {
    const rows = unwrap(await supabase.from(table).select("id,business_id,ends_at").in("business_id", ids)) ?? [];
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

const searchArgs = (params) => ({
  p_query: params.query ?? "",
  p_category: params.categoryId ?? null,
  p_county: params.county ?? null,
  p_town: params.town ?? null,
  p_open_now: Boolean(params.openNow),
  p_verified: Boolean(params.verifiedOnly),
  p_featured: Boolean(params.featuredOnly),
  p_lat: Number.isFinite(params.lat) ? params.lat : null,
  p_lng: Number.isFinite(params.lng) ? params.lng : null,
  p_radius_km: params.radiusKm ?? null,
  p_min_price: params.minPrice ?? null,
  p_max_price: params.maxPrice ?? null,
  p_sort: params.sort ?? "relevance",
  p_seed: String(params.seed ?? 0),
  p_page: Math.max(1, params.page ?? 1),
  p_page_size: Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 12))
});

async function searchRemote(params) {
  const result = unwrap(await supabase.rpc("search_businesses", searchArgs(params))) ?? { total: 0, items: [] };
  const rows = result.items ?? [];
  const ids = rows.map((row) => row.id);
  const [categoryRows, flashEnds, offerEnds] = await Promise.all([
    loadCategories(),
    fetchEndsFor("public_flash_sales", ids, (row) => Date.parse(row.ends_at)),
    fetchEndsFor("public_offers", ids, (row) => (row.ends_at ? Date.parse(row.ends_at) : Infinity))
  ]);
  const lowest = new Map(rows.filter((row) => row.from_price != null).map((row) => [row.id, Number(row.from_price)]));
  const snap = engine.buildSnapshot({ rows, lowest, flashEnds, offerEnds, categoryRows, localCategories: store.categories, mediaUrl });
  const distance = new Map(rows.map((row) => [row.id, row.distance_km ?? null]));
  const items = snap.businesses.map((b) => ({ ...engine.toSummary(b, snap, null), distanceKm: distance.get(b.id) }));
  const size = result.page_size ?? Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 12));
  const total = Number(result.total ?? 0);
  return { items, total, page: result.page ?? Math.max(1, params.page ?? 1), pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

async function facetsRemote({ query = "", categoryId = null } = {}) {
  const data = unwrap(await supabase.rpc("search_facets", { p_query: query, p_category: categoryId })) ?? {};
  const categories = new Map(engine.buildCategories(await loadCategories(), store.categories).map((c) => [c.id, c]));
  const matched = data.category_ids ?? [];
  const scopedId = categoryId ?? (matched.length === 1 ? matched[0] : null);
  const category = scopedId ? categories.get(scopedId) ?? null : null;
  return {
    towns: data.towns ?? [],
    price: data.price ? { min: Number(data.price.min), max: Number(data.price.max) } : null,
    categoryId: scopedId,
    categoryName: category?.name ?? null,
    fields: []
  };
}

async function suggestionsRemote(prefix, limit) {
  if (String(prefix ?? "").trim().length < 2) return [];
  return unwrap(await supabase.rpc("search_suggestions", { p_prefix: prefix, p_limit: limit })) ?? [];
}

export const searchBusinesses = (params = {}) =>
  params.minRating > 0 ? searchLocal(params) : viaDatabase(() => searchRemote(params), () => searchLocal(params));
export const getSearchFacets = (params = {}) => viaDatabase(() => facetsRemote(params), () => facetsLocal(params));
export const getSuggestions = (prefix, limit = 6) => viaDatabase(() => suggestionsRemote(prefix, limit), () => suggestionsLocal(prefix, limit));
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
