import { PLAN_FEATURES, isListed, rankSimilar, similarTerms } from "@epicmkt/shared";
import { NotFoundError, getCategories } from "@epicmkt/backend";
import { supabase } from "../applications/supabaseClient";
import { isSynced, serverNow } from "../../lib/clock.js";
import { loadSnapshot } from "./snapshot.js";
import { businessOf, galleryOf, teamOf, timetableOf, cardOfBusiness, statusCard, entryOf, flashParts, itemOf, pricingOf, serviceOf } from "./shape.js";
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

const CARD_COLUMNS = "id,business_id,name,description,price,price_type,unit,section,availability,stock_left,image_paths,video_paths,media,sort,created_at";

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
    mediaPaths: row.media,
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
// The card columns plus the brand, which the ranking strips from names. Never the heavy fields (specs, highlights, terms).
const SIMILAR_ITEM_COLUMNS = `${CARD_COLUMNS},brand`;
// The function is not deployed yet (migration 0068 not applied): Postgres 42883, or PostgREST PGRST202.
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);
const likeEscape = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const originOfPoint = (o) => (o && Number.isFinite(o.lat) && Number.isFinite(o.lng) ? { lat: o.lat, lng: o.lng } : null);
const pointOf = (b) => (Number.isFinite(b?.lat) && Number.isFinite(b?.lng) ? { lat: b.lat, lng: b.lng } : null);

// The database side of "similar", as one call (migration 0068): a full-text word match on the head-noun forms computed by the
// shared module, plus the same section, at most three items per store, only listed and public ones. It is a coarse net: the
// shared `rankSimilar` applies the real relevance gate and the order, exactly as it does for the demo backend. Returns null
// when the function is not deployed, so the caller can fall back; any other failure throws.
const similarViaRpc = async (itemId, terms, read) => {
  const found = await read(supabase.rpc("similar_item_candidates", { p_item_id: itemId, p_terms: terms, p_limit: SIMILAR_POOL }));
  if (found.error && MISSING_FUNCTION.has(found.error.code)) return null;
  return unwrap(found) ?? [];
};

// The same net built from several queries, for a database that does not have the function yet. It only ever feeds the shared
// gate, so a looser net here cannot put an unrelated product in the row; it just fetches more rows to throw away.
const similarViaQueries = async ({ seed, base, terms, section, read }) => {
  // Letters and digits only reach the filter, so a name can never alter the query. A word already covered by a shorter one
  // ("breads" by "bread") is left out: ilike matches substrings anyway.
  const words = terms.filter((term, i) => !terms.some((other, j) => j !== i && other.length < term.length && term.startsWith(other))).slice(0, 6);
  const pool = (query, size = SIMILAR_POOL) => query.neq("business_id", base.id).order("created_at", { ascending: false }).limit(size);
  // The same search twice: across every store, and again across featured stores only, so a crowded marketplace of
  // recent items from other stores cannot push the featured stores that have this item out of the pool.
  const searches = (ids) => {
    const scope = () => {
      const q = supabase.from("public_items").select(SIMILAR_ITEM_COLUMNS);
      return ids ? q.in("business_id", ids) : q;
    };
    const size = ids ? SIMILAR_FEATURED_POOL : SIMILAR_POOL;
    const out = [];
    if (section) out.push(read(pool(scope().ilike("section", likeEscape(section)), size)));
    if (words.length) out.push(read(pool(scope().or(words.map((w) => `name.ilike.%${w}%`).join(",")), size)));
    return out;
  };
  const featuredKeys = Object.keys(PLAN_FEATURES).filter((key) => PLAN_FEATURES[key]?.featured === true);
  const featuredIds = featuredKeys.length
    ? (unwrap(await read(supabase.from("public_businesses").select("id").in("plan_key", featuredKeys).neq("id", base.id).limit(SIMILAR_STORES))) ?? []).map((b) => b.id)
    : [];
  const reads = [...searches(null), ...(featuredIds.length ? searches(featuredIds) : [])];
  const out = [];
  for (const result of await Promise.all(reads)) out.push(...(unwrap(result) ?? []));
  return out;
};

// Items of the same KIND as this one from any other store: a bread finds breads and loaves, never a cake, and a store being in
// the same category is no reason to show its items. The database narrows the pool and the shared ranking decides what
// qualifies and in what order, so the demo backend and live agree. Listed and public only (the views already hide the rest).
// Throws on a failed read; the caller turns that into an empty row. `signal` cancels the reads.
export async function getSimilarItems(itemId, { limit = 12, origin = null, signal = null } = {}) {
  if (!isLiveId(itemId)) return [];
  // abortSignal belongs before maybeSingle() / await: it is not available on the builder maybeSingle() returns.
  const read = (query) => (signal ? query.abortSignal(signal) : query);
  const seed = unwrap(await read(supabase.from("public_items").select(SIMILAR_ITEM_COLUMNS).eq("id", itemId)).maybeSingle());
  if (!seed) return [];
  const base = unwrap(await read(supabase.from("public_businesses").select(SIMILAR_STORE_COLUMNS).eq("id", seed.business_id)).maybeSingle());
  if (!base) return [];
  const visitor = originOfPoint(origin);

  const section = typeof seed.section === "string" ? seed.section.trim() : "";
  const terms = similarTerms(seed.name, seed.brand);
  // No head noun and no section: there is nothing to match on, and no row beats a random one.
  if (!terms.length && !section) return [];
  const fetched = (await similarViaRpc(itemId, terms, read)) ?? (await similarViaQueries({ seed, base, terms, section, read }));
  const rows = new Map();
  for (const row of fetched) if (row?.id && row.id !== seed.id && row.business_id !== base.id && !rows.has(row.id)) rows.set(row.id, row);

  const stores = new Map();
  const loadStores = async (ids) => {
    const missing = ids.filter((id) => !stores.has(id)).slice(0, SIMILAR_STORES * 2);
    if (!missing.length) return;
    for (const b of unwrap(await read(supabase.from("public_businesses").select(SIMILAR_STORE_COLUMNS).in("id", missing))) ?? []) stores.set(b.id, b);
  };

  const listed = [...rows.values()].filter(isListed);
  if (!listed.length) return [];
  await loadStores([...new Set(listed.map((row) => row.business_id))]);
  if (signal?.aborted) return [];
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
    return { item, business, entry, pricing, brand: row.brand };
  });
  const seedPrice = seed.price === null ? NaN : Number(seed.price);
  const ranked = rankSimilar({
    current: { id: seed.id, businessId: base.id, categoryId: base.category_id, name: seed.name, brand: seed.brand, section: seed.section, price: sales.get(seed.id)?.pricing?.salePrice ?? seedPrice, tags: base.tags, ...(pointOf(base) ?? {}) },
    candidates: shaped.map((s) => ({
      id: s.item.id,
      businessId: s.business.id,
      featured: PLAN_FEATURES[s.business.plan_key]?.featured === true,
      categoryId: s.business.category_id,
      name: s.item.name,
      brand: s.brand,
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

// The gallery, team and timetable are extras: if one cannot be read the page still opens without it.
const optionalRows = async (view, businessId, order) => {
  try {
    return unwrap(await supabase.from(view).select("*").eq("business_id", businessId).order(order)) ?? [];
  } catch {
    return [];
  }
};

let categoriesCache = null;

export async function getBusiness(ref, origin = null) {
  const row = await findBusiness(ref);
  if (!row) throw new NotFoundError("Business not found");
  categoriesCache ??= getCategories();
  const [categories, items, chips, deals, photos, staff, slots] = await Promise.all([
    categoriesCache,
    supabase.from("public_items").select(CARD_COLUMNS).eq("business_id", row.id).order("sort").order("created_at", { ascending: false }).then(unwrap),
    chipsByItem(row.id),
    dealsForStore(row.id),
    optionalRows("public_gallery_photos", row.id, "sort"),
    optionalRows("public_staff", row.id, "sort"),
    optionalRows("public_timetable", row.id, "start_time")
  ]);
  const services = (items ?? []).filter(isListed).map((item) => ({ ...serviceOf(item), offer: chips.get(item.id) ?? null }));
  const team = teamOf(staff, services);
  const business = businessOf(row, {
    category: categories.find((c) => c.id === row.category_id) ?? null,
    services,
    origin,
    gallery: galleryOf(photos),
    team,
    timetable: timetableOf(slots, team)
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

