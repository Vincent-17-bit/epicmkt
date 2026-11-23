// /api/products: the cached, paged read API behind the home page "Products" grid.
//
// Why this exists. The grid used to download every public product (and every store) into each visitor's browser, 20 requests
// of 1,000 rows with all image and video paths, then filter and sort there. First load grew with every product a seller added.
// Now it follows the same shape as /api/browse:
//
//   1. ONE slim snapshot of the product list is built from Supabase (a single RPC, migration 0043) and kept in this instance's
//      memory, shared by every request it serves. Concurrent refreshes are collapsed into one (single flight).
//   2. Each request is answered from the snapshot with ONE page (24 products, a few KB), not the catalogue. Filtering and
//      sorting run the SAME code the UI used before (src/lib/productFilters.js), so results do not change, only where they run.
//   3. Responses carry s-maxage + stale-while-revalidate, so Vercel's CDN answers repeat questions without running this
//      function at all. Canonical URLs (see _lib/productParams.js) make visitors share cache entries.
//   4. If a refresh fails, the last good snapshot keeps being served (stale-if-error).
//   5. Time-dependent facts (open now, a flash sale that has ended) are re-evaluated once a minute against the clock, not
//      only when the snapshot is rebuilt, so a stale snapshot never shows a sale that is over.
//
// Past the snapshot (catalogue scale, docs/catalog-scale.md, migration 0128):
//   * op=page, recommended, no filters: the feed of the visitor's rotation hour, built from products_feed_pool (featured shops'
//     products, the freshest, a slice of the long tail), blended once per hour (src/lib/feed.js) and frozen for that hour.
//   * op=search: when the catalogue is bigger than the snapshot, the indexed search_product_candidates adds what the snapshot
//     cannot hold, so an old product is still found; ranking, filters and facets are unchanged.
//   * op=suggest: type-ahead from the search_suggest dictionary (a few ms whatever the catalogue size); the snapshot otherwise.
//   * op=trending: what shoppers search for, every kind ranked together (store, product, flash sale, category), as "popular this week"
//     and "rising now", rebuilt every hour. The same for everyone. Cached until 5 minutes
//     past the next hour.
//
// Only data the anon key can already read leaves here. No service-role key is used.

import { PLAN_FEATURES } from "../../shared/src/constants.js";
import { normalizeText } from "../../shared/src/utils.js";
import { isOpenAllDay, statusOf } from "../../shared/src/openState.js";
import { isListed } from "../../shared/src/availability.js";
import { EMPTY_FILTERS, countActive } from "../src/lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../src/lib/productQuery.js";
import { FEED_MAX_PAGES, blendFeed, clampEpoch, clampVariant, pagesOf } from "../src/lib/feed.js";
import { tidyTrending } from "../../shared/src/search/trending.js";
import { buildSuggestIndex, correctWord, suggestFrom, suggestKey } from "../src/lib/suggest.js";
import { parseRequest } from "./_lib/productParams.js";
import { parseSearch, searchProducts } from "../../shared/src/search/search.js";
import { cached } from "./_lib/redis.js";
import { configured, restAll, rpc } from "./_lib/supabase.js";

export const config = { runtime: "edge" };

const FRESH_MS = 60_000; // serve from memory without asking the database
const STALE_MS = 15 * 60_000; // beyond this a failed refresh is an error rather than a stale answer
const MAX_ITEMS = 10_000;
const SHORT_MAX = 140;

const shorten = (text) => {
  if (text.length <= SHORT_MAX) return text;
  const cut = text.slice(0, SHORT_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
};

// `range` is { min, max } when the item's combinations are priced differently (migration 0096), else null. priceMin is the lowest price a
// buyer pays now: the flash price while a sale runs (it is the lowest flash price of the item), else the lowest combination, else the price.
const pricing = (regular, sale, priceType, unit, range = null) => {
  const ranged = range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min < range.max;
  return {
    regularPrice: regular,
    salePrice: sale,
    savings: regular - sale,
    discountPercent: regular > 0 ? Math.round(((regular - sale) / regular) * 100) : 0,
    unit: unit ?? null,
    priceType: priceType ?? "fixed",
    variants: [],
    ...(ranged ? { hasRange: true, priceMin: sale < regular ? Math.min(sale, range.min) : range.min, priceMax: range.max } : {})
  };
};
const rangeOf = (row) => {
  const min = row.price_min === null || row.price_min === undefined ? NaN : Number(row.price_min);
  const max = row.price_max === null || row.price_max === undefined ? NaN : Number(row.price_max ?? row.price_high);
  return Number.isFinite(min) && Number.isFinite(max) && (row.has_price_range === undefined || row.has_price_range === true) ? { min, max } : null;
};

// Normal path: the whole snapshot in one round trip.
async function fromRpc() {
  const { data, at } = await cached("products:snapshot:v1", { freshMs: FRESH_MS, staleMs: STALE_MS }, () =>
    rpc("products_snapshot", { p_limit: MAX_ITEMS }, { timeoutMs: 12_000 })
  );
  return { at, items: data.items ?? [], businesses: data.businesses ?? [], truncated: data.truncated === true };
}

// Fallback when the function is not installed yet or is slow: page the public views, with narrow columns.
async function fromViews() {
  const [rows, businesses, sales, sizeValues] = await Promise.all([
    restAll(
      "public_items?select=id,business_id,name,description,section,price,price_type,unit,availability,brand,created_at,image_paths,video_paths,price_min,price_high,has_options,option_count&order=created_at.desc,id.asc",
      { max: MAX_ITEMS }
    ),
    restAll("public_businesses?select=id,slug,name,plan_key,verification_level,category_id,town,county,hours,exceptions,timezone&order=id"),
    restAll("public_flash_sales?select=id,item_id,sale_price,starts_at,ends_at,headline&order=id").catch(() => []),
    // The stored scale values of every item's sizes, in one call (migration 0110), so the Size filter keeps working on this path. If the
    // function is missing or slow there are simply no size facets; nothing else changes.
    rpc("public_item_size_values", { p_limit: MAX_ITEMS }, { timeoutMs: 8_000 })
      .then((map) => (map && typeof map === "object" && !Array.isArray(map) ? map : {}))
      .catch((error) => {
        console.warn(`[products] public_item_size_values unavailable (${error?.message ?? error}); size filters are off on this path`);
        return {};
      })
  ]);
  const best = new Map();
  for (const s of sales) {
    const prior = best.get(s.item_id);
    if (!prior || Number(s.sale_price) < Number(prior.sale_price)) best.set(s.item_id, s);
  }
  const items = rows.map((r) => {
    const s = best.get(r.id);
    return {
      id: r.id,
      business_id: r.business_id,
      name: r.name,
      description: String(r.description ?? "").slice(0, 160),
      section: r.section,
      price: r.price,
      price_type: r.price_type,
      unit: r.unit,
      availability: r.availability,
      brand: r.brand ?? null,
      created_at: r.created_at,
      image_path: r.image_paths?.[0] ?? null,
      video_paths: r.video_paths?.length ? r.video_paths : null,
      price_min: r.price_min ?? null,
      price_max: r.price_high ?? null,
      has_price_range: r.price_min !== null && r.price_min !== undefined && r.price_high !== null && r.price_high !== undefined ? Number(r.price_min) < Number(r.price_high) : false,
      has_options: r.has_options === true,
      option_count: Number.isInteger(r.option_count) && r.option_count > 0 ? r.option_count : null,
      size_values: Array.isArray(sizeValues[r.id]) && sizeValues[r.id].length ? sizeValues[r.id] : null,
      sale_id: s?.id ?? null,
      sale_price: s?.sale_price ?? null,
      sale_starts_at: s?.starts_at ?? null,
      sale_ends_at: s?.ends_at ?? null,
      sale_headline: s?.headline ?? null
    };
  });
  return { items, businesses, truncated: rows.length >= MAX_ITEMS };
}

// Builds the in-memory snapshot. Media stays as raw storage paths: the browser owns media-host sharding.
function buildSnapshot({ items, businesses, truncated }) {
  const stores = new Map();
  for (const b of businesses) {
    stores.set(b.id, {
      shared: {
        id: b.id,
        slug: b.slug,
        name: b.name,
        verified: b.verification_level === "verified",
        featured: PLAN_FEATURES[b.plan_key]?.featured === true,
        categoryId: b.category_id,
        town: b.town ?? "",
        county: b.county ?? "",
        isOpen: false,
        // Open round the clock every day: the "Open 24 hours" filter. Fixed by the weekly hours, so read once here.
        open24: isOpenAllDay(b.hours ?? {}),
        statusLine: ""
      },
      hours: b.hours,
      exceptions: b.exceptions
    });
  }
  const products = [];
  const flashing = [];
  for (const row of items) {
    // The view already leaves sold-out items out; this keeps an older database (before migration 0046) from listing one.
    if (!isListed(row)) continue;
    const store = stores.get(row.business_id);
    if (!store) continue;
    const price = row.price === null || row.price === undefined ? NaN : Number(row.price);
    const regular = Number.isFinite(price) ? price : null;
    const description = row.description ?? "";
    const product = {
      id: row.id,
      businessId: row.business_id,
      businessSlug: store.shared.slug,
      name: row.name,
      shortDescription: shorten(description),
      section: row.section ?? null,
      brand: typeof row.brand === "string" && row.brand.trim() ? row.brand.trim() : null,
      availability: row.availability ?? "available",
      stockLeft: Number.isInteger(row.stock_left) && row.stock_left > 0 ? row.stock_left : null,
      imagePath: row.image_path ?? null,
      imageUrl: row.image_path ?? null,
      videoPaths: Array.isArray(row.video_paths) ? row.video_paths : [],
      // Stored scale values of the item's sizes (migration 0110): what the Size filter groups and counts. Absent for an item with none.
      ...(Array.isArray(row.size_values) && row.size_values.length ? { sizeValues: row.size_values } : {}),
      priceType: row.price_type ?? "fixed",
      unit: row.unit ?? null,
      regularPrice: regular,
      createdAt: row.created_at,
      hasOptions: row.has_options === true,
      ...(Number.isInteger(row.option_count) && row.option_count > 0 ? { optionCount: row.option_count } : {}),
      ...(rangeOf(row) ? { priceRange: rangeOf(row) } : {}),
      pricing: regular === null ? null : pricing(regular, regular, row.price_type, row.unit, rangeOf(row)),
      flash: null,
      business: store.shared,
      hay: normalizeText(`${row.name} ${description} ${row.section ?? ""} ${store.shared.name ?? ""} ${store.shared.town ?? ""}`)
    };
    if (row.sale_id && regular !== null && Number.isFinite(Number(row.sale_price))) {
      flashing.push({
        product,
        sale: {
          id: row.sale_id,
          itemId: row.id,
          businessId: row.business_id,
          headline: row.sale_headline ?? null,
          startsAt: new Date(row.sale_starts_at).toISOString(),
          endsAt: new Date(row.sale_ends_at).toISOString()
        },
        startMs: Date.parse(row.sale_starts_at),
        endMs: Date.parse(row.sale_ends_at),
        salePrice: Number(row.sale_price)
      });
    }
    products.push(product);
  }
  return { products, flashing, stores: [...stores.values()], minute: -1, truncated, summary: null };
}

// Once per minute: open/closed for every store, and whether each flash sale is running right now.
function tick(snap, now) {
  const minute = Math.floor(now / 60_000);
  if (snap.minute === minute) return;
  snap.minute = minute;
  const at = new Date(now);
  for (const s of snap.stores) {
    try {
      const { isOpen, line } = statusOf(s.hours ?? {}, Array.isArray(s.exceptions) ? s.exceptions : [], at, s.timezone);
      s.shared.isOpen = isOpen;
      s.shared.statusLine = line;
    } catch {
      s.shared.isOpen = false;
      s.shared.statusLine = "";
    }
  }
  for (const f of snap.flashing) {
    const running = f.startMs <= now && now < f.endMs && f.salePrice > 0 && f.salePrice < f.product.regularPrice;
    const p = f.product;
    if (running) {
      p.pricing = pricing(p.regularPrice, f.salePrice, p.priceType, p.unit, p.priceRange);
      p.flash = { sale: f.sale, pricing: p.pricing, remainingMs: f.endMs - now };
    } else {
      p.pricing = pricing(p.regularPrice, p.regularPrice, p.priceType, p.unit, p.priceRange);
      p.flash = null;
    }
  }
  snap.summary = null;
}

// What product search and the colour filter read beyond the snapshot (migration 0127): spec rows, highlights, short description,
// option value labels and swatch colours, merged into each product. Missing or slow: search still works on names and prices.
async function addSearchFacts(snap) {
  const facts = await rpc("public_item_search_facts", { p_limit: MAX_ITEMS }, { timeoutMs: 8_000 })
    .then((map) => (map && typeof map === "object" && !Array.isArray(map) ? map : {}))
    .catch((error) => {
      console.warn(`[products] public_item_search_facts unavailable (${error?.message ?? error}); search filters use names only`);
      return {};
    });
  mergeFacts(snap, facts);
}

function mergeFacts(snap, facts) {
  if (!facts || typeof facts !== "object") return;
  for (const p of snap.products) {
    const f = facts[p.id];
    if (!f) continue;
    if (Array.isArray(f.specs)) p.specs = f.specs;
    if (Array.isArray(f.highlights)) p.highlights = f.highlights;
    if (typeof f.shortDescription === "string") p.shortDescription = f.shortDescription;
    if (Array.isArray(f.optionValues)) p.optionValues = f.optionValues;
    if (Array.isArray(f.swatches)) p.swatches = f.swatches;
    if (typeof f.productTypeId === "string") p.productTypeId = f.productTypeId;
    if (typeof f.departmentId === "string") p.departmentId = f.departmentId;
  }
}

async function build() {
  const started = Date.now();
  let parts;
  let via = "rpc";
  try {
    parts = await fromRpc();
  } catch (error) {
    // Visible in the Vercel function logs: if this appears often, the anon role's statement timeout is too short for the snapshot.
    console.warn(`[products] products_snapshot failed (${error?.message ?? error}); paging the public views instead`);
    via = "views";
    parts = await fromViews();
  }
  const snap = Object.assign(buildSnapshot(parts), { at: parts.at ?? Date.now() });
  await addSearchFacts(snap);
  if (snap.truncated) console.warn(`[products] catalogue larger than ${MAX_ITEMS} items; newest ${MAX_ITEMS} are served`);
  console.log(`[products] snapshot built via ${via}: ${snap.products.length} products, ${snap.stores.length} stores, ${Date.now() - started} ms`);
  return snap;
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
      console.warn(`[products] refresh failed, serving the snapshot from ${Math.round((Date.now() - state.at) / 1000)} s ago`);
      return state.snap;
    }
    throw error;
  }
}

// ---- The home feed of one rotation hour --------------------------------------------------------------------------------------
// One entry per hour asked for (a visitor keeps the hour their visit started, so a few hours can be live at once). The ORDER is
// worked out once per hour and kept; the products behind it are refreshed like the snapshot, so a product that is removed or
// sold out simply drops out of its page and nothing else moves.
const FEED_KEEP = 8;
const MIN_POOL = 48;
const feeds = new Map();

async function feedPool(epoch) {
  let entry = feeds.get(epoch);
  if (entry?.snap && Date.now() - entry.at < FRESH_MS) return entry;
  if (!entry) {
    entry = { at: 0, snap: null, order: null, inflight: null };
    feeds.set(epoch, entry);
    while (feeds.size > FEED_KEEP) feeds.delete(Math.min(...feeds.keys()));
  }
  entry.inflight ??= cached(`products:feed:v1:${epoch}`, { freshMs: FRESH_MS, staleMs: STALE_MS }, () =>
    rpc("products_feed_pool", { p_epoch: epoch }, { timeoutMs: 10_000 })
  )
    .then(({ data, at }) => {
      const snap = buildSnapshot({ items: data.items ?? [], businesses: data.businesses ?? [], truncated: false });
      mergeFacts(snap, data.facts);
      entry.snap = snap;
      entry.byId = new Map(snap.products.map((p) => [p.id, p]));
      entry.at = at ?? Date.now();
      return entry;
    })
    .finally(() => {
      entry.inflight = null;
    });
  try {
    return await entry.inflight;
  } catch (error) {
    if (entry.snap && Date.now() - entry.at < STALE_MS) return entry;
    throw error;
  }
}

function feedPage(entry, epoch, { page, pageSize, variant = 0 }, now) {
  tick(entry.snap, now);
  // One order per page size and variant: the grid's page size depends on the screen (about 50 cards), the order's length and its
  // featured places are counted in pages of that size, and each visit draws one of the hour's few variants.
  entry.orders ??= new Map();
  const orderKey = `${pageSize}:${variant}`;
  if (!entry.orders.has(orderKey)) entry.orders.set(orderKey, blendFeed(entry.snap.products, { epoch, variant, pageSize, limit: FEED_MAX_PAGES * pageSize }).map((p) => p.id));
  const order = entry.orders.get(orderKey);
  const pages = pagesOf(order.length, pageSize);
  const start = (page - 1) * pageSize;
  const items = page <= pages ? order.slice(start, start + pageSize).map((id) => entry.byId.get(id)).filter(Boolean) : [];
  return {
    items,
    total: order.length,
    catalogTotal: Math.max(order.length, entry.snap.products.length),
    page,
    pageSize,
    pages,
    hasMore: page < pages,
    capped: true,
    epoch
  };
}

// ---- Search beyond the snapshot ---------------------------------------------------------------------------------------------
const MEMO_MAX = 300;
const memo = (map, key, value) => {
  map.set(key, value);
  if (map.size > MEMO_MAX) map.delete(map.keys().next().value);
  return value;
};
const candidateMemo = new Map();

async function candidatesFor(q) {
  const key = suggestKey(q);
  const hit = candidateMemo.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.value;
  const data = await rpc("search_product_candidates", { p_query: q, p_limit: 600 }, { timeoutMs: 6_000 });
  const snap = buildSnapshot({ items: data.items ?? [], businesses: data.businesses ?? [], truncated: false });
  mergeFacts(snap, data.facts);
  return memo(candidateMemo, key, { at: Date.now(), value: { snap, matched: Number(data.matched) || 0, corrected: data.corrected ?? null } }).value;
}

// ---- Type-ahead and trending ------------------------------------------------------------------------------------------------
const suggestMemo = new Map();
const SUGGEST_MS = 5 * 60_000;

const merged = (a, b, keyOf, limit) => {
  const seen = new Set();
  const out = [];
  for (const row of [...(a ?? []), ...(b ?? [])]) {
    const k = keyOf(row);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(row);
    if (out.length === limit) break;
  }
  return out;
};

// The database dictionary knows names; the snapshot also knows variants (flavours, sizes). Its extra words and products are added
// after the database's own, so nothing the dictionary found is displaced.
function mergeSuggest(db, local) {
  return {
    ...db,
    terms: merged(db.terms, local.terms, (t) => suggestKey(t.label), 8),
    products: merged(db.products, local.products, (p) => p.id, 4),
    corrected: db.corrected ?? (db.terms?.length || db.products?.length ? null : local.corrected)
  };
}

async function suggestions(q) {
  const key = suggestKey(q);
  const hit = suggestMemo.get(key);
  if (hit && Date.now() - hit.at < SUGGEST_MS) return hit.value;
  let value = null;
  try {
    const data = await rpc("search_suggest", { p_prefix: q.trim().toLowerCase(), p_limit: 8 }, { timeoutMs: 2_500 });
    if (data && typeof data === "object") value = { ...data, source: "index" };
  } catch (error) {
    console.warn(`[products] search_suggest unavailable (${error?.message ?? error}); suggesting from the snapshot`);
  }
  if (!value) {
    const snap = await snapshot();
    snap.suggest ??= buildSuggestIndex(snap.products);
    value = { ...suggestFrom(snap.suggest, q), source: "snapshot" };
  } else if (state.snap || !value.products?.length) {
    const snap = state.snap ?? (await snapshot().catch(() => null));
    if (snap) {
      snap.suggest ??= buildSuggestIndex(snap.products);
      value = mergeSuggest(value, suggestFrom(snap.suggest, q));
    }
  }
  return memo(suggestMemo, key, { at: Date.now(), value }).value;
}

// trending_lists (0146): popular + rising, every kind in one ranking, the same for everyone. `items` repeats `popular` so a cached
// older client keeps working. If the new function is not there yet (code deployed before the migration) the hourly list (0128) is used,
// and below that the live count of the last 24 hours.
async function rawTrending() {
  try {
    const data = await rpc("trending_lists", { p_limit: 10 }, { timeoutMs: 3_000 });
    if (data && Array.isArray(data.popular)) return data;
  } catch (error) {
    console.warn(`[products] trending_lists unavailable (${error?.message ?? error}); using the hourly list`);
  }
  try {
    const data = await rpc("top_searches_hourly", { p_limit: 10 }, { timeoutMs: 3_000 });
    if (data && Array.isArray(data.items)) return { ...data, popular: data.items, rising: [], degraded: true };
  } catch (error) {
    console.warn(`[products] top_searches_hourly unavailable (${error?.message ?? error}); using the live count`);
  }
  const rows = await rpc("top_searches", { p_limit: 10 }, { timeoutMs: 3_000 }).catch(() => []);
  const items = (Array.isArray(rows) ? rows : []).map((r) => ({ term: r.term, count: r.count, hot: r.hot }));
  return { computedAt: new Date().toISOString(), live: true, items, popular: items, rising: [], degraded: true };
}

// What goes out: the stored lists, checked once more against the product snapshot. Words the database already checked (a store, a flash
// sale, a category) are kept as they are; a product word must still match something, is shown with its picture, and the list is topped up
// with the commonest kinds of product so the menu is never short.
async function trending() {
  const base = await rawTrending();
  try {
    const snap = await snapshot();
    const popular = tidyTrending(base.popular ?? base.items, snap.products, 10);
    // Risers get the same picture and name check, but are never padded: a word either is rising or it is not.
    const rising = tidyTrending(base.rising, snap.products, 10, { topUp: false });
    return { ...base, popular, items: popular, rising };
  } catch (error) {
    console.warn(`[products] trending top-up skipped (${error?.message ?? error})`);
    return base;
  }
}

// The lists are rebuilt every hour (pg_cron at :02 past each hour): cache until 5 minutes past the next hour.
const TRENDING_PERIOD_MS = 3_600_000;
const TRENDING_OFFSET_MS = 300_000;
const untilNextRefresh = (now) => {
  const next = Math.ceil((now - TRENDING_OFFSET_MS) / TRENDING_PERIOD_MS) * TRENDING_PERIOD_MS + TRENDING_OFFSET_MS;
  return Math.max(60, Math.ceil((next - now) / 1000));
};

const reply = (body, status, cache) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" }
  });

const PAGE_CACHE = "public, max-age=15, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600";
const FACET_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600";
const SUGGEST_CACHE = "public, max-age=60, s-maxage=600, stale-while-revalidate=3600, stale-if-error=86400";

// Only what the grid shows leaves the function: no search text, no internal ids.
const outgoing = ({ hay: _hay, sizeValues: _sizeValues, specs: _specs, highlights: _highlights, optionValues: _optionValues, ...product }) => product;   // filter-only facts stay here; swatches are shown on the cards

export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return reply({ error: "method_not_allowed" }, 405, "no-store");
  if (!configured()) return reply({ error: "not_configured" }, 503, "no-store");

  const params = new URL(req.url).searchParams;
  // op=search: the /products page (Amazon-style results with per-kind filters), answered from the same snapshot.
  if (params.get("op") === "search") {
    try {
      const snap = await snapshot();
      const now = Date.now();
      tick(snap, now);
      let search = parseSearch(params);
      let products = snap.products;
      let extra = {};
      // A catalogue bigger than the snapshot: the indexed search finds what the snapshot cannot hold (older products), and the
      // same ranking runs over both. A catalogue that fits keeps the snapshot alone (it also matches descriptions and specs).
      if (snap.truncated && search.q.trim()) {
        try {
          const found = await candidatesFor(search.q);
          tick(found.snap, now);
          const ids = new Set(snap.products.map((p) => p.id));
          products = [...snap.products, ...found.snap.products.filter((p) => !ids.has(p.id))];
          extra = { matchedAll: found.matched };
          // Nothing for what was typed, but the database corrected a misspelling ("mlik" -> "milk"): answer the corrected query,
          // and say so, the way big shops do ("Showing results for milk").
          if (found.corrected && !searchProducts(snap.products, { ...search, page: 1 }).total) {
            search = { ...search, q: found.corrected };
            extra.corrected = found.corrected;
          }
        } catch (error) {
          console.warn(`[products] search_product_candidates unavailable (${error?.message ?? error}); searching the snapshot only`);
        }
      }
      // view=items: the next page of a list already on screen, which needs only its cards, not the filters again.
      const itemsOnly = params.get("view") === "items";
      let result = searchProducts(products, search, { itemsOnly });
      // Still nothing: correct each unknown word against the snapshot's own words ("mlik" -> "milk") and try once more.
      if (!result.total && search.q.trim() && !extra.corrected) {
        snap.suggest ??= buildSuggestIndex(snap.products);
        const typed = suggestKey(search.q);
        const fixed = typed.split(" ").map((w) => correctWord(snap.suggest, w) ?? w).join(" ");
        if (fixed !== typed) {
          const again = searchProducts(products, { ...search, q: fixed }, { itemsOnly });
          if (again.total) {
            result = again;
            extra.corrected = fixed;
          }
        }
      }
      return reply({ ...result, ...extra, items: result.items.map(outgoing), serverNow: new Date(now).toISOString() }, 200, PAGE_CACHE);
    } catch (error) {
      console.error(`[products] search unavailable: ${error?.message ?? error}`);
      return reply({ error: "unavailable" }, 502, "no-store");
    }
  }
  if (params.get("op") === "suggest") {
    const q = String(params.get("q") ?? "").slice(0, 60);
    if (suggestKey(q).length < 2) return reply({ terms: [], products: [], stores: [], categories: [], corrected: null }, 200, SUGGEST_CACHE);
    try {
      return reply(await suggestions(q), 200, SUGGEST_CACHE);
    } catch (error) {
      console.error(`[products] suggestions unavailable: ${error?.message ?? error}`);
      return reply({ error: "unavailable" }, 502, "no-store");
    }
  }
  if (params.get("op") === "trending") {
    const now = Date.now();
    try {
      const age = untilNextRefresh(now);
      const body = await trending();
      const cache = body.degraded ? "public, max-age=60, s-maxage=120, stale-while-revalidate=120, stale-if-error=3600" : `public, max-age=${Math.min(age, 600)}, s-maxage=${age}, stale-while-revalidate=600, stale-if-error=86400`;
      return reply(body, 200, cache);
    } catch (error) {
      console.error(`[products] trending unavailable: ${error?.message ?? error}`);
      return reply({ error: "unavailable" }, 502, "no-store");
    }
  }
  const parsed = parseRequest(params);
  if (!parsed) return reply({ error: "bad_request" }, 400, "public, s-maxage=60");

  try {
    const snap = await snapshot();
    const now = Date.now();
    tick(snap, now);
    const { op, filters, page, pageSize } = parsed;
    if (op === "facets") {
      snap.summary ??= facetsSummary(snap.products);
      return reply(snap.summary, 200, FACET_CACHE);
    }
    if (op === "counts") return reply(countsSummary(snap.products, filters), 200, PAGE_CACHE);
    const epoch = clampEpoch(parsed.epoch, now);
    const variant = clampVariant(parsed.variant);
    // The unfiltered recommended feed: the hour's pool, when the database has it and it is big enough to be worth it.
    if (filters.sort === "recommended" && countActive(filters) === 0 && snap.truncated) {
      try {
        const entry = await feedPool(epoch);
        if (entry.snap.products.length >= MIN_POOL) {
          const result = feedPage(entry, epoch, { page, pageSize, variant }, now);
          return reply({ ...result, catalogTotal: Math.max(result.catalogTotal, snap.products.length), items: result.items.map(outgoing), serverNow: new Date(now).toISOString() }, 200, PAGE_CACHE);
        }
      } catch (error) {
        console.warn(`[products] products_feed_pool unavailable (${error?.message ?? error}); blending the snapshot`);
      }
    }
    const result = pageOf(snap.products, filters ?? EMPTY_FILTERS, { page, pageSize, epoch, variant });
    return reply({ ...result, items: result.items.map(outgoing), serverNow: new Date(now).toISOString() }, 200, PAGE_CACHE);
  } catch (error) {
    console.error(`[products] unavailable: ${error?.message ?? error}`);
    return reply({ error: "unavailable" }, 502, "no-store");
  }
}
