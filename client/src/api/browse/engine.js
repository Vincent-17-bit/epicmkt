// The browse engine: pure functions over an in-memory snapshot of the public catalog.
//
// One implementation, two homes:
//   - client/api/browse.js (Vercel edge) builds ONE snapshot, shares it between every visitor, and answers with a
//     single page of results that the CDN caches.
//   - liveLegacy.js (the browser) uses it only as the fallback when that endpoint is unreachable.
//
// It must stay free of browser, Node and Supabase imports so it runs anywhere.
import { PLAN_FEATURES } from "@epicmkt/shared/constants";
import { distanceKm, normalizeText, slugify } from "@epicmkt/shared/utils";
import { cardFacts } from "@epicmkt/shared/template";
import { businessStatus, statusOf } from "@epicmkt/shared/openState";

export const PRICED = new Set(["fixed", "from", "range"]);

export const notFound = (message) => Object.assign(new Error(message), { name: "NotFoundError", status: 404 });

const originOf = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
const distanceTo = (origin, b) => (origin && Number.isFinite(b.lat) && Number.isFinite(b.lng) ? distanceKm(origin, b) : null);

const shuffleKey = (seed, id) => {
  let h = 2166136261;
  for (const ch of `${seed}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

export const buildCategories = (rows, localCategories) => {
  const localMeta = new Map(localCategories.map((c) => [c.id, c]));
  return (rows.length ? rows : localCategories).map((row) => {
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
};

const buildBusiness = (row, categories, fromPriceKes, flashEnds = [], offerEnds = [], mediaUrl) => {
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
    exceptions: Array.isArray(row.exceptions) ? row.exceptions : [],
    createdAt: row.created_at ?? "",
    flashEnds,
    offerEnds,
    attributes: {}
  };
};

// Everything that depends only on the data (not on the query) is computed here, once per snapshot: normalised search
// text per field, lookup maps by id and slug. A search then only compares tokens, it never re-normalises the catalog.
const withSearchIndex = (b, categories) => {
  const category = categories.get(b.categoryId);
  b.search = [
    [normalizeText(b.name), 5],
    [normalizeText(b.tags.join(" ")), 4],
    [normalizeText(category?.name), 3],
    [normalizeText(`${b.area} ${b.county}`), 2],
    [normalizeText(`${b.tagline} ${b.description}`), 1]
  ];
  b.nameKey = normalizeText(b.name);
  return b;
};

/**
 * @param {object} input
 * @param {object[]} input.rows public_businesses rows
 * @param {Map<string, number>} input.lowest business id -> lowest listed price
 * @param {Map<string, number[]>} input.flashEnds business id -> end times (ms) of live flash sales
 * @param {Map<string, number[]>} input.offerEnds business id -> end times (ms, Infinity = no end) of live offers
 * @param {object[]} input.categoryRows rows of the categories table
 * @param {object[]} input.localCategories built-in category metadata (icons, singular names, fields)
 * @param {(path: string|null) => string|null} input.mediaUrl
 */
export function buildSnapshot({ rows, lowest, flashEnds, offerEnds, categoryRows, localCategories, mediaUrl }) {
  const categoryList = buildCategories(categoryRows, localCategories);
  const categories = new Map(categoryList.map((c) => [c.id, c]));
  const businesses = rows.map((row) =>
    withSearchIndex(buildBusiness(row, categories, lowest.get(row.id) ?? null, flashEnds.get(row.id), offerEnds.get(row.id), mediaUrl), categories)
  );
  const byKey = new Map();
  for (const b of businesses) {
    byKey.set(b.id, b);
    byKey.set(b.slug, b);
  }
  const counts = new Map();
  for (const b of businesses) counts.set(b.categoryId, (counts.get(b.categoryId) ?? 0) + 1);
  return { businesses, categoryList, categories, byKey, counts, open: { minute: -1, map: new Map() } };
}

// "Open now" changes at most once a minute, so it is computed once per business per minute, not once per request.
const isOpenNow = (snap, b, now) => {
  const minute = Math.floor(now / 60_000);
  if (snap.open.minute !== minute) snap.open = { minute, map: new Map() };
  let open = snap.open.map.get(b.id);
  if (open === undefined) {
    open = businessStatus(b.hours, b.exceptions, new Date(now)).isOpen;
    snap.open.map.set(b.id, open);
  }
  return open;
};

const liveCount = (ends, now) => ends.filter((at) => at > now).length;

export const toSummary = (b, snap, origin, now = Date.now()) => {
  const category = snap.categories.get(b.categoryId) ?? null;
  const status = statusOf(b.hours, b.exceptions, new Date(now));
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
    isOpen: status.isOpen,
    statusLine: status.line,
    distanceKm: distanceTo(origin, b),
    promo: { flash: liveCount(b.flashEnds, now), offers: liveCount(b.offerEnds, now) }
  };
};

const MAX_QUERY_WORDS = 8;
const MAX_QUERY_CHARS = 200;
const tokensOf = (query) => normalizeText(String(query ?? "").slice(0, MAX_QUERY_CHARS)).split(" ").filter(Boolean).slice(0, MAX_QUERY_WORDS);
const byName = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);

const scoreBusiness = (b, tokens) => {
  if (!tokens.length) return 0;
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const [text, weight] of b.search) if (weight > best && text.includes(token)) best = weight;
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

export const getCategories = (snap) => snap.categoryList.map((c) => ({ ...c, count: snap.counts.get(c.id) ?? 0 }));

export const getTowns = (snap) => townList(snap.businesses);

export const getCounties = (snap) => [...new Set(snap.businesses.map((b) => b.county).filter(Boolean))].sort();

export function searchBusinesses(snap, params = {}, now = Date.now()) {
  const {
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
  } = params;
  const origin = originOf(lat, lng);
  const tokens = tokensOf(query);

  const results = snap.businesses
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .filter((b) => !county || b.county === county)
    .filter((b) => !town || b.townSlug === town)
    .filter((b) => b.rating >= minRating)
    .filter((b) => !onlyOpen || isOpenNow(snap, b, now))
    .filter((b) => !verifiedOnly || b.verified)
    .filter((b) => !featuredOnly || PLAN_FEATURES[b.plan].featured)
    .map((b) => ({
      b,
      score: scoreBusiness(b, tokens),
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
  const items = results.slice((current - 1) * size, current * size).map((r) => toSummary(r.b, snap, origin, now));
  return { items, total, page: current, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export function getSearchFacets(snap, { query = "", categoryId = null } = {}) {
  const tokens = tokensOf(query);
  const matched = snap.businesses.filter((b) => (!categoryId || b.categoryId === categoryId) && scoreBusiness(b, tokens) >= 0);
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

export function getSuggestions(snap, prefix, limit = 6) {
  const q = normalizeText(prefix);
  if (q.length < 2) return [];
  const out = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.type}:${item.label.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  };
  [...snap.categoryList]
    .filter((c) => normalizeText(c.name).includes(q))
    .sort((a, b) => byName(a.name, b.name))
    .forEach((c) => push({ type: "category", label: c.name, categoryId: c.id }));
  snap.businesses
    .filter((b) => b.nameKey.includes(q))
    .sort((a, b) => byName(a.name, b.name))
    .forEach((b) => push({ type: "business", label: b.name, slug: b.slug }));
  snap.businesses
    .flatMap((b) => b.tags)
    .filter((t) => normalizeText(t).includes(q))
    .sort(byName)
    .forEach((t) => push({ type: "term", label: t }));
  return out.slice(0, limit);
}

export function getFeaturedBusinesses(snap, { categoryId = null, limit = 6, lat, lng, seed = null } = {}, now = Date.now()) {
  const origin = originOf(lat, lng);
  const byNewest = (x, y) => y.createdAt.localeCompare(x.createdAt);
  return snap.businesses
    .filter((b) => PLAN_FEATURES[b.plan].featured)
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .sort((x, y) => (seed == null ? byNewest(x, y) : shuffleKey(seed, x.id) - shuffleKey(seed, y.id) || byNewest(x, y)))
    .slice(0, limit)
    .map((b) => toSummary(b, snap, origin, now));
}

export function getNearbyBusinesses(snap, { lat, lng, radiusKm = 10, categoryId = null, limit = 8 } = {}, now = Date.now()) {
  const origin = originOf(lat, lng);
  if (!origin) return [];
  return snap.businesses
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .map((b) => ({ b, d: distanceTo(origin, b) }))
    .filter((r) => r.d !== null && r.d <= radiusKm)
    .sort((x, y) => x.d - y.d)
    .slice(0, limit)
    .map((r) => toSummary(r.b, snap, origin, now));
}

export function getSimilarBusinesses(snap, ref, limit = 4, now = Date.now()) {
  const base = snap.byKey.get(ref);
  if (!base) throw notFound("Business not found");
  const origin = originOf(base.lat, base.lng);
  return snap.businesses
    .filter((b) => b.id !== base.id && b.categoryId === base.categoryId)
    .map((b) => ({ b, d: distanceTo(origin, b) ?? Infinity }))
    .sort((x, y) => (x.b.county === base.county ? 0 : 1) - (y.b.county === base.county ? 0 : 1) || x.d - y.d)
    .slice(0, limit)
    .map((r) => toSummary(r.b, snap, null, now));
}
