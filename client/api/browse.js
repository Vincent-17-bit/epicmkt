// /api/browse: the cached read API for the public catalog (search, filters, suggestions, featured, nearby, similar).
//
// Why this exists. The browser used to download the whole catalog and do the searching itself, so the first page load grew
// with every seller who joined and the database served identical data to every visitor. Now:
//
//   1. One snapshot of the catalog is built from Supabase (a single RPC, see migration 0041) and kept in this instance's
//      memory, shared by every request it serves. Concurrent refreshes are collapsed into one (single flight).
//   2. Each request is answered from the snapshot and returns ONE page of results (a few KB), not the catalog.
//   3. Responses carry s-maxage + stale-while-revalidate, so Vercel's CDN answers repeat questions without running this
//      function at all, and revalidates in the background. Canonical URLs (see browseParams.js) make visitors share entries.
//   4. If a refresh fails, the last good snapshot keeps being served (stale-if-error), so a database blip is invisible.
//
// Only data the anon key can already read leaves here. No service-role key is used.

import { categories as localCategories } from "../src/data/categories.js";
import * as engine from "../src/api/browse/engine.js";
import { parseRequest } from "./_lib/browseParams.js";
import { cached } from "./_lib/redis.js";
import { configured, rest, restAll, rpc } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

const FRESH_MS = 30_000; // serve from memory without asking the database
const STALE_MS = 10 * 60_000; // beyond this a failed refresh is an error rather than a stale answer

const ends = (map, businessId, value) => {
  if (!businessId) return;
  const at = value === null ? Infinity : Date.parse(value);
  if (Number.isNaN(at)) return;
  map.set(businessId, [...(map.get(businessId) ?? []), at]);
};

const toEndsMap = (object) => {
  const map = new Map();
  for (const [businessId, list] of Object.entries(object ?? {})) for (const value of list) ends(map, businessId, value);
  return map;
};

// Normal path: the whole snapshot in one round trip.
async function fromRpc() {
  const { data, at } = await cached("browse:snapshot:v1", { freshMs: FRESH_MS, staleMs: STALE_MS }, () => rpc("browse_snapshot"));
  const lowest = new Map();
  for (const [businessId, price] of Object.entries(data.prices ?? {})) {
    const n = Number(price);
    if (Number.isFinite(n)) lowest.set(businessId, n);
  }
  return { at, rows: data.businesses ?? [], lowest, flashEnds: toEndsMap(data.flash), offerEnds: toEndsMap(data.offers), categoryRows: data.categories ?? [] };
}

// Fallback when the function is not installed yet or is slow: page the public views, but with narrow columns.
async function fromViews() {
  const safe = (p) => p.catch(() => []);
  const [rows, items, categoryRows, flash, offers] = await Promise.all([
    restAll(
      "public_businesses?select=id,slug,name,category_id,plan_key,verification_level,tagline,description,phone,whatsapp,county,town,lat,lng,logo_path,cover_path,tags,hours,created_at,exceptions&order=id"
    ),
    restAll("public_items?select=business_id,price,price_type&order=id"),
    rest("categories?select=id,name,icon,sort,active&active=eq.true&order=sort"),
    safe(restAll("public_flash_sales?select=business_id,ends_at&order=id")),
    safe(restAll("public_offers?select=business_id,ends_at&order=id"))
  ]);
  const lowest = new Map();
  for (const item of items) {
    if (!engine.PRICED.has(item.price_type) || item.price === null) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price)) continue;
    const prior = lowest.get(item.business_id);
    if (prior === undefined || price < prior) lowest.set(item.business_id, price);
  }
  const flashEnds = new Map();
  for (const row of flash) ends(flashEnds, row.business_id, row.ends_at);
  const offerEnds = new Map();
  for (const row of offers) ends(offerEnds, row.business_id, row.ends_at ?? null);
  return { rows, lowest, flashEnds, offerEnds, categoryRows };
}

async function build() {
  let parts;
  try {
    parts = await fromRpc();
  } catch (error) {
    // Visible in the Vercel function logs: if this appears often, the anon role's statement timeout is too short for the snapshot.
    console.warn(`[browse] browse_snapshot failed (${error?.message ?? error}); paging the public views instead`);
    parts = await fromViews();
  }
  // Media is returned as raw storage paths. The browser turns them into URLs, because it owns the media-host sharding.
  return Object.assign(engine.buildSnapshot({ ...parts, localCategories, mediaUrl: (path) => path ?? null }), { at: parts.at ?? Date.now() });
}

// Module state lives as long as this instance does. A cold start pays for one build; everything after is memory.
const state = { snap: null, at: 0, inflight: null };

async function snapshot() {
  const age = Date.now() - state.at;
  if (state.snap && age < FRESH_MS) return state.snap;
  state.inflight ??= build()
    .then((snap) => {
      state.snap = snap;
      state.at = snap.at;
      return snap;
    })
    .finally(() => {
      state.inflight = null;
    });
  try {
    return await state.inflight;
  } catch (error) {
    if (state.snap && Date.now() - state.at < STALE_MS) {
      console.warn(`[browse] refresh failed, serving the snapshot from ${Math.round((Date.now() - state.at) / 1000)} s ago`);
      return state.snap;
    }
    throw error;
  }
}

const RETRY_AFTER = 30;

const reply = (body, status, cache) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      ...(status === 503 && body.retryAfter ? { "Retry-After": String(body.retryAfter) } : {})
    }
  });

const OK_CACHE = "public, max-age=10, s-maxage=30, stale-while-revalidate=300, stale-if-error=3600";

function answer(snap, op, p) {
  const now = Date.now();
  switch (op) {
    case "categories":
      return engine.getCategories(snap);
    case "towns":
      return engine.getTowns(snap);
    case "counties":
      return engine.getCounties(snap);
    case "search":
      return engine.searchBusinesses(snap, p, now);
    case "facets":
      return engine.getSearchFacets(snap, p);
    case "suggest":
      return engine.getSuggestions(snap, p.prefix, p.limit);
    case "featured":
      return engine.getFeaturedBusinesses(snap, p, now);
    case "nearby":
      return engine.getNearbyBusinesses(snap, p, now);
    case "similar":
      return engine.getSimilarBusinesses(snap, p.ref, p.limit, now);
    default:
      return null;
  }
}

export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return reply({ error: "method_not_allowed" }, 405, "no-store");
  if (!configured()) return reply({ error: "not_configured" }, 503, "no-store");

  const parsed = parseRequest(new URL(req.url).searchParams);
  if (!parsed) return reply({ error: "bad_request" }, 400, "public, s-maxage=60");

  try {
    const snap = await snapshot();
    return reply(answer(snap, parsed.op, parsed.params), 200, OK_CACHE);
  } catch (error) {
    if (error?.name === "NotFoundError") return reply({ error: "not_found", message: error.message }, 404, "public, s-maxage=30");
    console.error(`[browse] unavailable: ${error?.message ?? error}`);
    return reply({ error: "unavailable", retryAfter: RETRY_AFTER }, 503, "no-store");
  }
}
