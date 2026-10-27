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
// Only data the anon key can already read leaves here. No service-role key is used.

import { PLAN_FEATURES } from "../../shared/src/constants.js";
import { normalizeText } from "../../shared/src/utils.js";
import { statusOf } from "../../shared/src/openState.js";
import { isListed } from "../../shared/src/availability.js";
import { EMPTY_FILTERS } from "../src/lib/productFilters.js";
import { countsSummary, facetsSummary, pageOf } from "../src/lib/productQuery.js";
import { parseRequest } from "./_lib/productParams.js";
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

const pricing = (regular, sale, priceType, unit) => ({
  regularPrice: regular,
  salePrice: sale,
  savings: regular - sale,
  discountPercent: regular > 0 ? Math.round(((regular - sale) / regular) * 100) : 0,
  unit: unit ?? null,
  priceType: priceType ?? "fixed",
  variants: []
});

// Normal path: the whole snapshot in one round trip.
async function fromRpc() {
  const { data, at } = await cached("products:snapshot:v1", { freshMs: FRESH_MS, staleMs: STALE_MS }, () =>
    rpc("products_snapshot", { p_limit: MAX_ITEMS }, { timeoutMs: 12_000 })
  );
  return { at, items: data.items ?? [], businesses: data.businesses ?? [], truncated: data.truncated === true };
}

// Fallback when the function is not installed yet or is slow: page the public views, with narrow columns.
async function fromViews() {
  const [rows, businesses, sales] = await Promise.all([
    restAll(
      "public_items?select=id,business_id,name,description,section,price,price_type,unit,availability,created_at,image_paths&order=created_at.desc,id.asc",
      { max: MAX_ITEMS }
    ),
    restAll("public_businesses?select=id,slug,name,plan_key,verification_level,category_id,town,county,hours,exceptions,timezone&order=id"),
    restAll("public_flash_sales?select=id,item_id,sale_price,starts_at,ends_at,headline&order=id").catch(() => [])
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
      created_at: r.created_at,
      image_path: r.image_paths?.[0] ?? null,
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
      availability: row.availability ?? "available",
      stockLeft: Number.isInteger(row.stock_left) && row.stock_left > 0 ? row.stock_left : null,
      imagePath: row.image_path ?? null,
      imageUrl: row.image_path ?? null,
      priceType: row.price_type ?? "fixed",
      unit: row.unit ?? null,
      regularPrice: regular,
      createdAt: row.created_at,
      pricing: regular === null ? null : pricing(regular, regular, row.price_type, row.unit),
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
      p.pricing = pricing(p.regularPrice, f.salePrice, p.priceType, p.unit);
      p.flash = { sale: f.sale, pricing: p.pricing, remainingMs: f.endMs - now };
    } else {
      p.pricing = pricing(p.regularPrice, p.regularPrice, p.priceType, p.unit);
      p.flash = null;
    }
  }
  snap.summary = null;
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

const reply = (body, status, cache) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" }
  });

const PAGE_CACHE = "public, max-age=15, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600";
const FACET_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600";

// Only what the grid shows leaves the function: no search text, no internal ids.
const outgoing = ({ hay: _hay, ...product }) => product;

export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return reply({ error: "method_not_allowed" }, 405, "no-store");
  if (!configured()) return reply({ error: "not_configured" }, 503, "no-store");

  const parsed = parseRequest(new URL(req.url).searchParams);
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
    const result = pageOf(snap.products, filters ?? EMPTY_FILTERS, { page, pageSize });
    return reply({ ...result, items: result.items.map(outgoing), serverNow: new Date(now).toISOString() }, 200, PAGE_CACHE);
  } catch (error) {
    console.error(`[products] unavailable: ${error?.message ?? error}`);
    return reply({ error: "unavailable" }, 502, "no-store");
  }
}
