import {
  PLAN_FEATURES,
  EVENT_TYPES,
  BUSINESS_STATUS,
  distanceKm,
  isOpenNow,
  normalizeText,
  todayHours
} from "@epicmkt/shared";
import { store } from "../store.js";
import { delay } from "../latency.js";
import { NotFoundError } from "../errors.js";

const categoryOf = (id) => store.categories.find((c) => c.id === id) ?? null;

const activeBusinesses = () => store.businesses.filter((b) => b.status === BUSINESS_STATUS.ACTIVE);

const originOf = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

const toSummary = (b, origin) => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  tagline: b.tagline,
  categoryId: b.categoryId,
  categoryName: categoryOf(b.categoryId)?.singular ?? "",
  categoryIcon: categoryOf(b.categoryId)?.icon ?? null,
  county: b.county,
  area: b.area,
  rating: b.rating,
  reviewCount: b.reviewCount,
  plan: b.plan,
  verified: b.verified,
  hue: b.hue,
  phone: b.phone,
  whatsapp: b.whatsapp,
  lat: b.lat,
  lng: b.lng,
  isOpen: isOpenNow(b.hours),
  distanceKm: origin ? distanceKm(origin, b) : null
});

const toPublic = (b, origin) => {
  const { sellerId, stats, status, createdAt, planExpiresAt, ...rest } = b;
  return {
    ...rest,
    category: categoryOf(b.categoryId),
    planFeatures: PLAN_FEATURES[b.plan],
    isOpen: isOpenNow(b.hours),
    todayHours: todayHours(b.hours),
    distanceKm: origin ? distanceKm(origin, b) : null
  };
};

const scoreBusiness = (b, tokens) => {
  if (!tokens.length) return 0;
  const fields = [
    [normalizeText(b.name), 5],
    [normalizeText(b.tags.join(" ")), 4],
    [normalizeText(categoryOf(b.categoryId)?.name), 3],
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

export async function getCategories() {
  await delay();
  return store.categories.map((c) => ({
    ...c,
    count: activeBusinesses().filter((b) => b.categoryId === c.id).length
  }));
}

export async function getCounties() {
  await delay();
  return [...new Set(activeBusinesses().map((b) => b.county))].sort();
}

export async function searchBusinesses({
  query = "",
  categoryId = null,
  county = null,
  openNow = false,
  minRating = 0,
  sort = "relevance",
  lat,
  lng,
  page = 1,
  pageSize = 12
} = {}) {
  await delay();
  const origin = originOf(lat, lng);
  const tokens = normalizeText(query).split(" ").filter(Boolean);

  let results = activeBusinesses()
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .filter((b) => !county || b.county === county)
    .filter((b) => b.rating >= minRating)
    .filter((b) => !openNow || isOpenNow(b.hours))
    .map((b) => {
      const score = scoreBusiness(b, tokens);
      const boost = PLAN_FEATURES[b.plan].priorityRanking ? 3 : 0;
      return { b, score, rank: score + boost, dist: origin ? distanceKm(origin, b) : null };
    })
    .filter((r) => r.score >= 0);

  const byRating = (x, y) => y.b.rating - x.b.rating || y.b.reviewCount - x.b.reviewCount;

  results.sort((x, y) => {
    if (sort === "distance" && origin) return x.dist - y.dist;
    if (sort === "rating") return byRating(x, y);
    return y.rank - x.rank || byRating(x, y);
  });

  const total = results.length;
  const size = Math.max(1, pageSize);
  const current = Math.max(1, page);
  const items = results
    .slice((current - 1) * size, current * size)
    .map((r) => toSummary(r.b, origin));

  return { items, total, page: current, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function getSuggestions(prefix, limit = 6) {
  await delay();
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
  store.categories
    .filter((c) => normalizeText(c.name).includes(q))
    .forEach((c) => push({ type: "category", label: c.name, categoryId: c.id }));
  const active = activeBusinesses();
  active
    .filter((b) => normalizeText(b.name).includes(q))
    .forEach((b) => push({ type: "business", label: b.name, slug: b.slug }));
  active
    .flatMap((b) => b.tags)
    .filter((t) => normalizeText(t).includes(q))
    .forEach((t) => push({ type: "term", label: t }));
  return out.slice(0, limit);
}

export async function getBusiness(ref, { lat, lng } = {}) {
  await delay();
  const business = activeBusinesses().find((b) => b.id === ref || b.slug === ref);
  if (!business) throw new NotFoundError("Business not found");
  return toPublic(business, originOf(lat, lng));
}

export async function getFeaturedBusinesses({ categoryId = null, limit = 6, lat, lng } = {}) {
  await delay();
  const origin = originOf(lat, lng);
  return activeBusinesses()
    .filter((b) => PLAN_FEATURES[b.plan].featured)
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .sort((x, y) => y.rating - x.rating || y.reviewCount - x.reviewCount)
    .slice(0, limit)
    .map((b) => toSummary(b, origin));
}

export async function getNearbyBusinesses({ lat, lng, radiusKm = 10, categoryId = null, limit = 8 }) {
  await delay();
  const origin = originOf(lat, lng);
  if (!origin) return [];
  return activeBusinesses()
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .map((b) => ({ b, d: distanceKm(origin, b) }))
    .filter((r) => r.d <= radiusKm)
    .sort((x, y) => x.d - y.d)
    .slice(0, limit)
    .map((r) => toSummary(r.b, origin));
}

export async function getSimilarBusinesses(ref, limit = 4) {
  await delay();
  const base = activeBusinesses().find((b) => b.id === ref || b.slug === ref);
  if (!base) throw new NotFoundError("Business not found");
  const origin = { lat: base.lat, lng: base.lng };
  return activeBusinesses()
    .filter((b) => b.id !== base.id && b.categoryId === base.categoryId)
    .map((b) => ({ b, d: distanceKm(origin, b) }))
    .sort((x, y) => (x.b.county === base.county ? 0 : 1) - (y.b.county === base.county ? 0 : 1) || x.d - y.d)
    .slice(0, limit)
    .map((r) => toSummary(r.b, null));
}

export async function getTopSearches(limit = 8) {
  await delay();
  return [...store.searches.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export async function logSearch(term) {
  const clean = normalizeText(term);
  if (clean.length < 2 || clean.length > 60) return { ok: false };
  store.searches.set(clean, (store.searches.get(clean) ?? 0) + 1);
  return { ok: true };
}

export async function logContactEvent({ businessId, type }) {
  if (!EVENT_TYPES.includes(type)) return { ok: false };
  const business = store.businesses.find((b) => b.id === businessId);
  if (!business) return { ok: false };
  business.stats[type] += 1;
  store.events.push({ businessId, type, at: new Date().toISOString() });
  return { ok: true };
}
