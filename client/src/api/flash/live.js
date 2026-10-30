import { PLAN_FEATURES, distanceKm, isListed, nameTokens, rankSimilar } from "@epicmkt/shared";
import { NotFoundError, getCategories } from "@epicmkt/backend";
import { supabase } from "../applications/supabaseClient";
import { isSynced, serverNow } from "../../lib/clock.js";
import { loadSnapshot } from "./snapshot.js";
import { businessOf, cardOfBusiness, statusCard, entryOf, flashParts, itemOf, pricingOf, serviceOf } from "./shape.js";
import { chipsByItem, dealsForStore, viewsForItem } from "../offers/live.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR_MS = 3600000;
const WINDOWS = { "1h": HOUR_MS, "24h": 24 * HOUR_MS };
const MAX_ROWS = 500;

export const isLiveId = (id) => UUID.test(String(id ?? ""));

const failure = (error) => Object.assign(new Error(error?.message || "request_failed"), { name: "FlashApiError", code: error?.code ?? null });

const unwrap = ({ data, error }) => {
  if (error) throw failure(error);
  return data;
};

const loadRows = () =>
  loadSnapshot(async () => {
    const rows = unwrap(await supabase.from("public_flash_sales").select("*").order("ends_at", { ascending: true }).limit(MAX_ROWS)) ?? [];
    const serverAt = rows.length ? Date.parse(rows[0].server_now) : null;
    return { rows, fetchedAt: Date.now(), serverAt: Number.isFinite(serverAt) ? serverAt : null };
  });

const nowOf = (snap) => (isSynced() || snap.serverAt === null ? serverNow() : snap.serverAt + (Date.now() - snap.fetchedAt));

const liveEntries = async (origin = null) => {
  const snap = await loadRows();
  const now = nowOf(snap);
  return {
    now,
    entries: snap.rows.filter((row) => Date.parse(row.ends_at) > now).map((row) => entryOf(row, { origin, now }))
  };
};

const endMs = (entry) => Date.parse(entry.sale.endsAt);

const SORTS = {
  ending: (a, b) => endMs(a) - endMs(b),
  discount: (a, b) => b.pricing.discountPercent - a.pricing.discountPercent || endMs(a) - endMs(b),
  nearest: (a, b) => (a.business.distanceKm ?? Infinity) - (b.business.distanceKm ?? Infinity) || endMs(a) - endMs(b),
  newest: (a, b) => Date.parse(b.sale.startsAt) - Date.parse(a.sale.startsAt)
};

export async function getServerTime() {
  const data = unwrap(await supabase.rpc("get_server_time"));
  return { now: new Date(data).toISOString() };
}

export async function list({
  businessId = null,
  categoryId = null,
  town = null,
  endsWithin = null,
  openNow = false,
  minPrice = null,
  maxPrice = null,
  sort = "ending",
  limit = 12,
  offset = 0,
  origin = null
} = {}) {
  const { now, entries } = await liveEntries(origin);
  const window = WINDOWS[endsWithin] ?? null;
  const rows = entries.filter((entry) => {
    if (businessId && entry.business.id !== businessId && entry.business.slug !== businessId) return false;
    if (categoryId && entry.business.categoryId !== categoryId) return false;
    if (town && entry.business.townSlug !== town) return false;
    if (openNow && !entry.business.isOpen) return false;
    if (window && endMs(entry) - now > window) return false;
    if (Number.isFinite(minPrice) && entry.pricing.salePrice < minPrice) return false;
    if (Number.isFinite(maxPrice) && entry.pricing.salePrice > maxPrice) return false;
    return true;
  });
  rows.sort(SORTS[sort] ?? SORTS.ending);
  return { items: rows.slice(offset, offset + limit), total: rows.length, serverNow: new Date(now).toISOString() };
}

export async function facets() {
  const { entries } = await liveEntries();
  const categories = new Map();
  const towns = new Map();
  for (const { business } of entries) {
    categories.set(business.categoryId, (categories.get(business.categoryId) ?? 0) + 1);
    const town = towns.get(business.townSlug) ?? { slug: business.townSlug, name: business.townName, count: 0 };
    town.count += 1;
    towns.set(business.townSlug, town);
  }
  return {
    total: entries.length,
    categories: [...categories].map(([id, count]) => ({ id, count })),
    towns: [...towns.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function getForItem(itemId, businessId) {
  const { now, entries } = await liveEntries();
  const entry = entries.find((e) => e.item.id === itemId && (!businessId || e.business.id === businessId || e.business.slug === businessId));
  return entry ? { ...flashParts(entry, now), item: entry.item, business: entry.business } : null;
}

const columnFor = (ref) => (isLiveId(ref) ? "id" : "slug");

const findBusiness = async (ref) => {
  if (!ref) return null;
  return unwrap(await supabase.from("public_businesses").select("*").eq(columnFor(ref), ref).maybeSingle());
};

const CARD_COLUMNS = "id,business_id,name,description,price,price_type,unit,section,availability,stock_left,image_paths,video_paths,sort,created_at";

const itemRow = (row, business) =>
  itemOf({
    id: row.id,
    businessId: row.business_id,
    businessSlug: business.slug,
    name: row.name,
    description: row.description,
    shortDescription: row.short_description,
    brand: row.brand,
    highlights: row.highlights,
    specs: row.specs,
    includes: row.includes,
    terms: row.terms,
    packSize: row.pack_size,
    price: row.price === null ? NaN : Number(row.price),
    priceType: row.price_type,
    unit: row.unit,
    section: row.section,
    availability: row.availability,
    stockLeft: row.stock_left ?? null,
    imagePaths: row.image_paths,
    videoPaths: row.video_paths,
    media: row.media,
    createdAt: row.created_at
  });

export async function getItemDetail(itemId, { businessId, origin } = {}) {
  if (!isLiveId(itemId)) throw new NotFoundError("Item not found");
  const row = unwrap(await supabase.from("public_items").select("*").eq("id", itemId).maybeSingle());
  if (!row) throw new NotFoundError("Item not found");
  const business = unwrap(await supabase.from("public_businesses").select("*").eq("id", row.business_id).maybeSingle());
  if (!business || (businessId && businessId !== business.id && businessId !== business.slug)) throw new NotFoundError("Item not found");
  const item = itemRow(row, business);
  const { now, entries } = await liveEntries();
  const entry = entries.find((e) => e.item.id === itemId);
  const pricing = entry?.pricing ?? (Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit) : null);
  const card = cardOfBusiness(business, origin);
  return {
    ...item,
    business: card,
    pricing,
    flash: entry ? flashParts(entry, now) : null,
    offers: await viewsForItem(item.id, business.id, card)
  };
}

export async function getStoreSelective(ref, { excludeItemId, limit = 12 } = {}) {
  const business = await findBusiness(ref);
  if (!business) return [];
  const rows = unwrap(await supabase.from("public_items").select(CARD_COLUMNS).eq("business_id", business.id).order("sort").order("created_at", { ascending: false })) ?? [];
  const [{ now, entries }, chips] = await Promise.all([liveEntries(), chipsByItem(business.id)]);
  const current = rows.find((row) => row.id === excludeItemId);
  const shaped = rows
    // The view already leaves sold-out items out; this keeps an older database (before migration 0046) from showing one.
    .filter((row) => row.id !== excludeItemId && isListed(row))
    .map((row) => {
      const item = itemRow(row, business);
      const entry = entries.find((e) => e.item.id === row.id);
      const pricing = entry?.pricing ?? (Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit) : null);
      return { ...item, pricing, flash: entry ? flashParts(entry, now) : null, offer: chips.get(row.id) ?? null };
    });
  const rank = (row) => [
    current?.section && row.section === current.section ? 0 : 1,
    row.flash ? 0 : 1,
    -Date.parse(row.createdAt)
  ];
  shaped.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
  return shaped.slice(0, limit);
}

const SIMILAR_STORES = 100;
const SIMILAR_POOL = 120;
const SIMILAR_FEATURED_POOL = 60;
const SIMILAR_STORE_COLUMNS = "id,slug,name,category_id,tags,county,town,lat,lng,verification_level,plan_key,hours,exceptions,timezone";
const likeEscape = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const originOfPoint = (o) => (o && Number.isFinite(o.lat) && Number.isFinite(o.lng) ? { lat: o.lat, lng: o.lng } : null);
const pointOf = (b) => (Number.isFinite(b?.lat) && Number.isFinite(b?.lng) ? { lat: b.lat, lng: b.lng } : null);

// Items like this one from ANY other store, whatever its category: a bread finds every bread. The database narrows the
// pool (same section, a shared word in the name, and, only when that is thin, the same category) and the shared ranking
// orders it, so the demo backend and live rank identically. Listed and public only (the views already hide the rest).
// Throws on a failed read; the caller turns that into an empty row.
export async function getSimilarItems(itemId, { limit = 12, origin = null } = {}) {
  if (!isLiveId(itemId)) return [];
  const seed = unwrap(await supabase.from("public_items").select(CARD_COLUMNS).eq("id", itemId).maybeSingle());
  if (!seed) return [];
  const base = unwrap(await supabase.from("public_businesses").select(SIMILAR_STORE_COLUMNS).eq("id", seed.business_id).maybeSingle());
  if (!base) return [];
  const visitor = originOfPoint(origin);
  const here = visitor ?? pointOf(base);

  const section = typeof seed.section === "string" ? seed.section.trim() : "";
  // Only letters and digits reach the filter, so a name can never alter the query.
  const words = [...nameTokens(seed.name)].map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 3).sort((x, y) => y.length - x.length).slice(0, 3);
  const pool = (query, size = SIMILAR_POOL) => query.neq("business_id", base.id).order("created_at", { ascending: false }).limit(size);
  // The same search twice: across every store, and again across featured stores only, so a crowded marketplace of
  // recent items from other stores cannot push the featured stores that have this item out of the pool.
  const searches = (ids) => {
    const scope = () => {
      const q = supabase.from("public_items").select(CARD_COLUMNS);
      return ids ? q.in("business_id", ids) : q;
    };
    const size = ids ? SIMILAR_FEATURED_POOL : SIMILAR_POOL;
    const out = [];
    if (section) out.push(pool(scope().ilike("section", likeEscape(section)), size));
    if (words.length) out.push(pool(scope().or(words.map((w) => `name.ilike.%${w}%`).join(",")), size));
    return out;
  };
  const featuredKeys = Object.keys(PLAN_FEATURES).filter((key) => PLAN_FEATURES[key]?.featured === true);
  const featuredIds = featuredKeys.length
    ? (unwrap(await supabase.from("public_businesses").select("id").in("plan_key", featuredKeys).neq("id", base.id).limit(SIMILAR_STORES)) ?? []).map((b) => b.id)
    : [];
  const reads = [...searches(null), ...(featuredIds.length ? searches(featuredIds) : [])];
  const rows = new Map();
  const take = (data) => {
    for (const row of data ?? []) if (row.id !== seed.id && row.business_id !== base.id && !rows.has(row.id)) rows.set(row.id, row);
  };
  for (const result of await Promise.all(reads)) take(unwrap(result));

  let stores = new Map();
  const loadStores = async (ids) => {
    const missing = ids.filter((id) => !stores.has(id)).slice(0, SIMILAR_STORES * 2);
    if (!missing.length) return;
    for (const b of unwrap(await supabase.from("public_businesses").select(SIMILAR_STORE_COLUMNS).in("id", missing)) ?? []) stores.set(b.id, b);
  };

  // Too few real matches: fill from stores of the same category, nearest first.
  if (rows.size < limit && base.category_id) {
    const siblings = (unwrap(await supabase.from("public_businesses").select(SIMILAR_STORE_COLUMNS).eq("category_id", base.category_id).neq("id", base.id).limit(500)) ?? [])
      .map((b) => ({ b, km: here && pointOf(b) ? distanceKm(here, pointOf(b)) : Infinity, sameCounty: base.county && b.county === base.county ? 0 : 1 }))
      .sort((x, y) => x.sameCounty - y.sameCounty || x.km - y.km)
      .slice(0, SIMILAR_STORES)
      .map(({ b }) => b);
    for (const b of siblings) stores.set(b.id, b);
    if (siblings.length) {
      const price = seed.price === null ? NaN : Number(seed.price);
      let near = supabase.from("public_items").select(CARD_COLUMNS).in("business_id", siblings.map((b) => b.id));
      if (Number.isFinite(price) && price > 0) near = near.gte("price", Math.floor(price * 0.4)).lte("price", Math.ceil(price * 2.5));
      take(unwrap(await pool(near)));
    }
  }
  const listed = [...rows.values()].filter(isListed);
  if (!listed.length) return [];
  await loadStores([...new Set(listed.map((row) => row.business_id))]);
  const usable = listed.filter((row) => stores.has(row.business_id));
  if (!usable.length) return [];

  // Sale prices and offer chips are decoration: if either cannot be read the items still show at their regular price.
  let live = { now: Date.now(), entries: [] };
  let chips = new Map();
  try {
    live = await liveEntries();
  } catch {
    // keep regular prices
  }
  try {
    chips = await chipsByItem();
  } catch {
    // no chips
  }
  const sales = new Map(live.entries.map((entry) => [entry.item.id, entry]));
  const shaped = usable.map((row) => {
    const business = stores.get(row.business_id);
    const item = itemRow(row, business);
    const entry = sales.get(row.id);
    const pricing = entry?.pricing ?? (Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit) : null);
    return { item, business, entry, pricing };
  });
  const seedPrice = seed.price === null ? NaN : Number(seed.price);
  const ranked = rankSimilar({
    current: { id: seed.id, businessId: base.id, categoryId: base.category_id, name: seed.name, section: seed.section, price: sales.get(seed.id)?.pricing?.salePrice ?? seedPrice, tags: base.tags, ...(pointOf(base) ?? {}) },
    candidates: shaped.map((s) => ({
      id: s.item.id,
      businessId: s.business.id,
      featured: PLAN_FEATURES[s.business.plan_key]?.featured === true,
      categoryId: s.business.category_id,
      name: s.item.name,
      section: s.item.section,
      price: s.pricing?.salePrice ?? null,
      tags: s.business.tags,
      createdAt: s.item.createdAt,
      ...(pointOf(s.business) ?? {}),
      s
    })),
    origin: visitor,
    limit
  });
  // The same business fields the home product grid gives its cards, so the card looks and behaves the same.
  return ranked.map(({ s }) => ({
    ...s.item,
    pricing: s.pricing,
    flash: s.entry ? flashParts(s.entry, live.now) : null,
    offer: chips.get(s.item.id) ?? null,
    business: {
      id: s.business.id,
      slug: s.business.slug,
      name: s.business.name,
      verified: s.business.verification_level === "verified",
      featured: PLAN_FEATURES[s.business.plan_key]?.featured === true,
      categoryId: s.business.category_id,
      town: s.business.town ?? "",
      county: s.business.county ?? "",
      ...statusCard(s.business.hours, s.business.exceptions, s.business.timezone)
    }
  }));
}

const PAGE = 1000;
const MAX_PAGES = 20;

const fetchPages = async (table, columns, order) => {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    let query = supabase.from(table).select(columns);
    for (const [column, ascending] of order) query = query.order(column, { ascending });
    const data = unwrap(await query.range(from, from + PAGE - 1)) ?? [];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
};

// Every public product of every live store, for the home page. Filtering, sorting and paging happen in the client.
// Sale pricing is decoration: if the flash sales cannot be read the products still show at their regular price.
export async function getAllProducts() {
  const [rows, businesses] = await Promise.all([
    fetchPages("public_items", CARD_COLUMNS, [["created_at", false], ["id", true]]),
    fetchPages("public_businesses", "id,slug,name,plan_key,verification_level,category_id,town,county,hours,exceptions,timezone", [["id", true]])
  ]);
  if (!rows.length) return [];
  const byId = new Map(businesses.map((b) => [b.id, b]));
  let live = { now: Date.now(), entries: [] };
  try {
    live = await liveEntries();
  } catch {
    // keep regular prices
  }
  const sales = new Map(live.entries.map((e) => [e.item.id, e]));
  const chips = await chipsByItem();
  return rows.flatMap((row) => {
    const business = byId.get(row.business_id);
    if (!business || !isListed(row)) return [];
    const item = itemRow(row, business);
    const entry = sales.get(row.id);
    const pricing = entry?.pricing ?? (Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit) : null);
    return [
      {
        ...item,
        pricing,
        flash: entry ? flashParts(entry, live.now) : null,
        offer: chips.get(row.id) ?? null,
        business: {
          id: business.id,
          slug: business.slug,
          name: business.name,
          verified: business.verification_level === "verified",
          featured: PLAN_FEATURES[business.plan_key]?.featured === true,
          categoryId: business.category_id,
          town: business.town ?? "",
          county: business.county ?? "",
          ...statusCard(business.hours, business.exceptions, business.timezone)
        }
      }
    ];
  });
}

const SHOWCASE_COLUMNS = "id,business_id,name,price,price_type,unit,section,availability,image_paths,created_at";

// One store's products as a random window, never the whole catalogue: ask for the first window and the total, and
// only when the store has more than a window's worth ask again from a random start. Ordering by id (random uuids)
// makes any window a fair sample, so a store with a thousand products costs at most two small requests.
const showcaseWindow = async (businessId, pool, rng) => {
  const read = async (from) =>
    await supabase
      .from("public_items")
      .select(SHOWCASE_COLUMNS, { count: "exact" })
      .eq("business_id", businessId)
      .order("id")
      .range(from, from + pool - 1);
  const first = await read(0);
  const total = first.count ?? first.data?.length ?? 0;
  unwrap(first);
  if (total <= pool) return { rows: first.data ?? [], total };
  const start = Math.floor(rng() * (total - pool + 1));
  if (start === 0) return { rows: first.data ?? [], total };
  return { rows: unwrap(await read(start)) ?? [], total };
};

export async function getShowcaseProducts(businessIds = [], { pool = 24, rng = Math.random } = {}) {
  const ids = [...new Set(businessIds)].filter(Boolean);
  if (!ids.length) return {};
  const businesses = unwrap(await supabase.from("public_businesses").select("id,slug").in("id", ids)) ?? [];
  const slugOf = new Map(businesses.map((b) => [b.id, b.slug]));
  let live = { now: Date.now(), entries: [] };
  try {
    live = await liveEntries();
  } catch {
    // keep regular prices
  }
  const sales = new Map(live.entries.map((entry) => [entry.item.id, entry]));
  const windows = await Promise.all(
    ids.filter((id) => slugOf.has(id)).map(async (id) => [id, await showcaseWindow(id, pool, rng)])
  );
  return Object.fromEntries(
    windows.map(([id, { rows, total }]) => [
      id,
      {
        total,
        items: rows.filter(isListed).map((row) => {
          const item = itemRow(row, { slug: slugOf.get(id) });
          const entry = sales.get(row.id);
          const pricing = entry?.pricing ?? (Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit) : null);
          return { ...item, pricing, flash: entry ? flashParts(entry, live.now) : null };
        })
      }
    ])
  );
}

let categoriesCache = null;

export async function getBusiness(ref, origin = null) {
  const row = await findBusiness(ref);
  if (!row) throw new NotFoundError("Business not found");
  categoriesCache ??= getCategories();
  const [categories, items, chips, deals] = await Promise.all([
    categoriesCache,
    supabase.from("public_items").select(CARD_COLUMNS).eq("business_id", row.id).order("sort").order("created_at", { ascending: false }).then(unwrap),
    chipsByItem(row.id),
    dealsForStore(row.id)
  ]);
  const business = businessOf(row, {
    category: categories.find((c) => c.id === row.category_id) ?? null,
    services: (items ?? []).filter(isListed).map((item) => ({ ...serviceOf(item), offer: chips.get(item.id) ?? null })),
    origin
  });
  return { ...business, offers: deals };
}

export async function resolveShortcode(code) {
  const clean = String(code ?? "").trim().toLowerCase();
  const row = clean ? unwrap(await supabase.from("public_businesses").select("slug").eq("slug", clean).maybeSingle()) : null;
  if (!row) throw new NotFoundError("Business not found");
  return { slug: row.slug };
}

export function subscribe(onEvent, onStatus) {
  const channel = supabase.channel("flash-sales", { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "*" }, onEvent).subscribe((status) => onStatus?.(status));
  return () => {
    supabase.removeChannel(channel);
  };
}

