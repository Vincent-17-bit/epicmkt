import { PLAN_FEATURES, cardFacts, distanceKm, isOpenNow, normalizeText, slugify } from "@epicmkt/shared";
import { NotFoundError } from "@epicmkt/backend";
import { store } from "@epicmkt/backend/store";
import { supabase } from "../applications/supabaseClient";
import { mediaUrl } from "../flash/shape.js";

const PAGE = 1000;
const MAX_PAGES = 20;
const TTL_MS = 30_000;
const PRICED = new Set(["fixed", "from", "range"]);

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

const openNow = (hours) => {
  try {
    return Boolean(hours) && isOpenNow(hours);
  } catch {
    return false;
  }
};

const originOf = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);

const distanceTo = (origin, b) => (origin && Number.isFinite(b.lat) && Number.isFinite(b.lng) ? distanceKm(origin, b) : null);

const shuffleKey = (seed, id) => {
  let h = 2166136261;
  for (const ch of `${seed}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

const localMeta = new Map(store.categories.map((c) => [c.id, c]));

const buildCategories = (rows) =>
  (rows.length ? rows : store.categories).map((row) => {
    const meta = localMeta.get(row.id);
    return {
      singular: row.name,
      hue: 210,
      blurb: "",
      fields: [],
      ...meta,
      id: row.id,
      name: row.name ?? meta?.name,
      icon: meta?.icon ?? row.icon ?? "store"
    };
  });

const buildBusiness = (row, categories, fromPriceKes, flashEnds = [], offerEnds = []) => {
  const category = categories.get(row.category_id) ?? null;
  const town = row.town ?? "";
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    categoryId: row.category_id,
    county: row.county ?? "",
    area: town,
    townSlug: slugify(town),
    rating: 0,
    reviewCount: 0,
    plan: PLAN_FEATURES[row.plan_key] ? row.plan_key : "standard",
    verified: row.verification_level === "verified",
    hue: category?.hue ?? 210,
    coverUrl: mediaUrl(row.cover_path),
    logoUrl: mediaUrl(row.logo_path),
    fromPriceKes,
    tags: row.tags ?? [],
    phone: row.phone,
    whatsapp: row.whatsapp,
    lat: row.lat,
    lng: row.lng,
    hours: row.hours && typeof row.hours === "object" ? row.hours : {},
    createdAt: row.created_at ?? "",
    flashEnds,
    offerEnds,
    attributes: {}
  };
};

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
  const categoryList = buildCategories(categoryRows);
  const categories = new Map(categoryList.map((c) => [c.id, c]));
  const lowest = new Map();
  for (const item of items) {
    if (!PRICED.has(item.price_type) || item.price === null || item.price === undefined) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price)) continue;
    const prior = lowest.get(item.business_id);
    if (prior === undefined || price < prior) lowest.set(item.business_id, price);
  }
  const businesses = rows.map((row) => buildBusiness(row, categories, lowest.get(row.id) ?? null, flashEnds.get(row.id), offerEnds.get(row.id)));
  return { businesses, categoryList, categories };
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

const liveCount = (ends) => ends.filter((at) => at > Date.now()).length;

const toSummary = (b, snap, origin) => {
  const category = snap.categories.get(b.categoryId) ?? null;
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    tagline: b.tagline,
    categoryId: b.categoryId,
    categoryName: category?.singular ?? "",
    categoryIcon: category?.icon ?? null,
    county: b.county,
    area: b.area,
    townSlug: b.townSlug,
    rating: b.rating,
    reviewCount: b.reviewCount,
    plan: b.plan,
    verified: b.verified,
    hue: b.hue,
    coverUrl: b.coverUrl,
    logoUrl: b.logoUrl,
    fromPriceKes: b.fromPriceKes,
    highlights: cardFacts(category?.fields, b.attributes),
    phone: b.phone,
    whatsapp: b.whatsapp,
    lat: b.lat,
    lng: b.lng,
    isOpen: openNow(b.hours),
    distanceKm: distanceTo(origin, b),
    promo: { flash: liveCount(b.flashEnds), offers: liveCount(b.offerEnds) }
  };
};

const scoreBusiness = (b, snap, tokens) => {
  if (!tokens.length) return 0;
  const category = snap.categories.get(b.categoryId);
  const fields = [
    [normalizeText(b.name), 5],
    [normalizeText(b.tags.join(" ")), 4],
    [normalizeText(category?.name), 3],
    [normalizeText(`${b.area} ${b.county}`), 2],
    [normalizeText(`${b.tagline} ${b.description}`), 1]
  ];
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const [text, weight] of fields) {
      if (text.includes(token)) best = Math.max(best, weight);
    }
    if (!best) return -1;
    total += best;
  }
  return total;
};

const townList = (list) => {
  const found = new Map();
  for (const b of list) {
    if (!b.townSlug) continue;
    const entry = found.get(b.townSlug) ?? { slug: b.townSlug, name: b.area, county: b.county, count: 0 };
    entry.count += 1;
    found.set(b.townSlug, entry);
  }
  return [...found.values()].sort((a, c) => a.name.localeCompare(c.name));
};

export async function getCategories() {
  const snap = await load();
  return snap.categoryList.map((c) => ({ ...c, count: snap.businesses.filter((b) => b.categoryId === c.id).length }));
}

export async function getTowns() {
  return townList((await load()).businesses);
}

export async function getCounties() {
  const { businesses } = await load();
  return [...new Set(businesses.map((b) => b.county).filter(Boolean))].sort();
}

export async function searchBusinesses({
  query = "",
  categoryId = null,
  county = null,
  town = null,
  openNow: onlyOpen = false,
  verifiedOnly = false,
  featuredOnly = false,
  radiusKm = null,
  minPrice = null,
  maxPrice = null,
  minRating = 0,
  sort = "relevance",
  seed = 0,
  lat,
  lng,
  page = 1,
  pageSize = 12
} = {}) {
  const snap = await load();
  const origin = originOf(lat, lng);
  const tokens = normalizeText(query).split(" ").filter(Boolean);

  const results = snap.businesses
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .filter((b) => !county || b.county === county)
    .filter((b) => !town || b.townSlug === town)
    .filter((b) => b.rating >= minRating)
    .filter((b) => !onlyOpen || openNow(b.hours))
    .filter((b) => !verifiedOnly || b.verified)
    .filter((b) => !featuredOnly || PLAN_FEATURES[b.plan].featured)
    .map((b) => ({
      b,
      score: scoreBusiness(b, snap, tokens),
      dist: distanceTo(origin, b),
      price: b.fromPriceKes,
      shuffle: shuffleKey(seed, b.id)
    }))
    .filter((r) => r.score >= 0)
    .filter((r) => !(origin && radiusKm) || (r.dist !== null && r.dist <= radiusKm))
    .filter((r) => minPrice == null || (r.price != null && r.price >= minPrice))
    .filter((r) => maxPrice == null || (r.price != null && r.price <= maxPrice));

  const far = (r) => r.dist ?? Infinity;
  const byRating = (x, y) => y.b.rating - x.b.rating || y.b.reviewCount - x.b.reviewCount;
  const byNewest = (x, y) => y.b.createdAt.localeCompare(x.b.createdAt);
  const byPrice = (dir) => (x, y) => {
    if (x.price == null || y.price == null) return (x.price == null) - (y.price == null);
    return dir * (x.price - y.price) || byNewest(x, y);
  };
  const isPremium = (r) => PLAN_FEATURES[r.b.plan].priorityRanking;

  const comparators = {
    distance: (x, y) => (origin ? far(x) - far(y) : 0) || byNewest(x, y),
    rating: (x, y) => byRating(x, y) || byNewest(x, y),
    newest: (x, y) => byNewest(x, y) || byRating(x, y),
    price_asc: byPrice(1),
    price_desc: byPrice(-1),
    relevance: (x, y) => {
      const px = isPremium(x);
      if (px !== isPremium(y)) return px ? -1 : 1;
      if (px) return y.score - x.score || x.shuffle - y.shuffle;
      return y.score - x.score || (origin ? far(x) - far(y) : 0) || byNewest(x, y);
    }
  };

  results.sort(comparators[sort] ?? comparators.relevance);

  const total = results.length;
  const size = Math.max(1, pageSize);
  const current = Math.max(1, page);
  const items = results.slice((current - 1) * size, current * size).map((r) => toSummary(r.b, snap, origin));
  return { items, total, page: current, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function getSearchFacets({ query = "", categoryId = null } = {}) {
  const snap = await load();
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  const matched = snap.businesses
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .filter((b) => scoreBusiness(b, snap, tokens) >= 0);
  const prices = matched.map((b) => b.fromPriceKes).filter((n) => n != null);
  const categoryIds = new Set(matched.map((b) => b.categoryId));
  const scopedId = categoryId ?? (categoryIds.size === 1 ? [...categoryIds][0] : null);
  const category = scopedId ? snap.categories.get(scopedId) ?? null : null;
  return {
    towns: townList(matched),
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    categoryId: scopedId,
    categoryName: category?.name ?? null,
    // Per-business attributes are not published in public_businesses, so attribute filters are not offered live.
    fields: []
  };
}

export async function getSuggestions(prefix, limit = 6) {
  const q = normalizeText(prefix);
  if (q.length < 2) return [];
  const snap = await load();
  const out = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.type}:${item.label.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  };
  snap.categoryList
    .filter((c) => normalizeText(c.name).includes(q))
    .forEach((c) => push({ type: "category", label: c.name, categoryId: c.id }));
  snap.businesses
    .filter((b) => normalizeText(b.name).includes(q))
    .forEach((b) => push({ type: "business", label: b.name, slug: b.slug }));
  snap.businesses
    .flatMap((b) => b.tags)
    .filter((t) => normalizeText(t).includes(q))
    .forEach((t) => push({ type: "term", label: t }));
  return out.slice(0, limit);
}

export async function getFeaturedBusinesses({ categoryId = null, limit = 6, lat, lng, seed = null } = {}) {
  const snap = await load();
  const origin = originOf(lat, lng);
  const byNewest = (x, y) => y.createdAt.localeCompare(x.createdAt);
  return snap.businesses
    .filter((b) => PLAN_FEATURES[b.plan].featured)
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .sort((x, y) => (seed == null ? byNewest(x, y) : shuffleKey(seed, x.id) - shuffleKey(seed, y.id) || byNewest(x, y)))
    .slice(0, limit)
    .map((b) => toSummary(b, snap, origin));
}

export async function getNearbyBusinesses({ lat, lng, radiusKm = 10, categoryId = null, limit = 8 } = {}) {
  const origin = originOf(lat, lng);
  if (!origin) return [];
  const snap = await load();
  return snap.businesses
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .map((b) => ({ b, d: distanceTo(origin, b) }))
    .filter((r) => r.d !== null && r.d <= radiusKm)
    .sort((x, y) => x.d - y.d)
    .slice(0, limit)
    .map((r) => toSummary(r.b, snap, origin));
}

export async function getSimilarBusinesses(ref, limit = 4) {
  const snap = await load();
  const base = snap.businesses.find((b) => b.id === ref || b.slug === ref);
  if (!base) throw new NotFoundError("Business not found");
  const origin = originOf(base.lat, base.lng);
  return snap.businesses
    .filter((b) => b.id !== base.id && b.categoryId === base.categoryId)
    .map((b) => ({ b, d: distanceTo(origin, b) ?? Infinity }))
    .sort((x, y) => (x.b.county === base.county ? 0 : 1) - (y.b.county === base.county ? 0 : 1) || x.d - y.d)
    .slice(0, limit)
    .map((r) => toSummary(r.b, snap, null));
}

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
