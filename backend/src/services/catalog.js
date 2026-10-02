import {
  PLAN_FEATURES,
  EVENT_TYPES,
  BUSINESS_STATUS,
  REPORT_REASONS,
  closingInfo,
  distanceKm,
  isOpenNow,
  normalizeText,
  todayHours
} from "@epicmkt/shared";
import { store } from "../store.js";
import { delay } from "../latency.js";
import { NotFoundError, ValidationError } from "../errors.js";

const TOP_SEARCH_WINDOW_MS = 7 * 86400000;

const categoryOf = (id) => store.categories.find((c) => c.id === id) ?? null;

const activeBusinesses = () => store.businesses.filter((b) => b.status === BUSINESS_STATUS.ACTIVE);

const originOf = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

const fromPrice = (b) => {
  const prices = b.services.map((svc) => svc.priceKes).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
};

const shuffleKey = (seed, id) => {
  let h = 2166136261;
  for (const ch of `${seed}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

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
  coverUrl: b.coverUrl ?? null,
  logoUrl: b.logoUrl ?? null,
  fromPriceKes: fromPrice(b),
  phone: b.phone,
  whatsapp: b.whatsapp,
  lat: b.lat,
  lng: b.lng,
  isOpen: isOpenNow(b.hours),
  distanceKm: origin ? distanceKm(origin, b) : null
});

const toPublic = (b, origin) => {
  const { sellerId, stats, status, createdAt, planExpiresAt, ...rest } = b;
  const now = Date.now();
  return {
    ...rest,
    offers: (b.offers ?? []).filter((o) => Date.parse(o.expiresAt) > now),
    ...closingInfo(b.hours),
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
  area = null,
  openNow = false,
  verifiedOnly = false,
  featuredOnly = false,
  radiusKm = null,
  minPrice = null,
  maxPrice = null,
  attrs = {},
  minRating = 0,
  sort = "relevance",
  seed = 0,
  lat,
  lng,
  page = 1,
  pageSize = 12
} = {}) {
  await delay();
  const origin = originOf(lat, lng);
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  const attrEntries = Object.entries(attrs);

  const results = activeBusinesses()
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .filter((b) => !county || b.county === county)
    .filter((b) => !area || b.area === area)
    .filter((b) => b.rating >= minRating)
    .filter((b) => !openNow || isOpenNow(b.hours))
    .filter((b) => !verifiedOnly || b.verified)
    .filter((b) => !featuredOnly || PLAN_FEATURES[b.plan].featured)
    .filter((b) => attrEntries.every(([key, value]) => String(b.attributes?.[key]) === String(value)))
    .map((b) => ({
      b,
      score: scoreBusiness(b, tokens),
      dist: origin ? distanceKm(origin, b) : null,
      price: fromPrice(b),
      shuffle: shuffleKey(seed, b.id)
    }))
    .filter((r) => r.score >= 0)
    .filter((r) => !(origin && radiusKm) || r.dist <= radiusKm)
    .filter((r) => minPrice == null || (r.price != null && r.price >= minPrice))
    .filter((r) => maxPrice == null || (r.price != null && r.price <= maxPrice));

  const byRating = (x, y) => y.b.rating - x.b.rating || y.b.reviewCount - x.b.reviewCount;
  const byPrice = (dir) => (x, y) => {
    if (x.price == null || y.price == null) return (x.price == null) - (y.price == null);
    return dir * (x.price - y.price) || byRating(x, y);
  };
  const isPremium = (r) => PLAN_FEATURES[r.b.plan].priorityRanking;

  const comparators = {
    distance: (x, y) => (origin ? x.dist - y.dist : 0) || byRating(x, y),
    rating: byRating,
    newest: (x, y) => y.b.createdAt.localeCompare(x.b.createdAt) || byRating(x, y),
    price_asc: byPrice(1),
    price_desc: byPrice(-1),
    relevance: (x, y) => {
      const px = isPremium(x);
      if (px !== isPremium(y)) return px ? -1 : 1;
      if (px) return y.score - x.score || x.shuffle - y.shuffle;
      return y.score - x.score || (origin ? x.dist - y.dist : 0) || byRating(x, y);
    }
  };

  results.sort(comparators[sort] ?? comparators.relevance);

  const total = results.length;
  const size = Math.max(1, pageSize);
  const current = Math.max(1, page);
  const items = results
    .slice((current - 1) * size, current * size)
    .map((r) => toSummary(r.b, origin));

  return { items, total, page: current, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function getSearchFacets({ query = "", categoryId = null } = {}) {
  await delay();
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  const matched = activeBusinesses()
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .filter((b) => scoreBusiness(b, tokens) >= 0);

  const prices = matched.map(fromPrice).filter((n) => n != null);
  const categoryIds = new Set(matched.map((b) => b.categoryId));
  const scopedId = categoryId ?? (categoryIds.size === 1 ? [...categoryIds][0] : null);
  const category = scopedId ? categoryOf(scopedId) : null;

  return {
    areas: [...new Set(matched.map((b) => b.area))].sort(),
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    categoryId: scopedId,
    categoryName: category?.name ?? null,
    fields: (category?.fields ?? []).filter((f) => f.filterable)
  };
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

export async function resolveShortcode(code) {
  await delay();
  const clean = String(code ?? "").trim().toLowerCase();
  const business = activeBusinesses().find((b) => b.shortcode === clean);
  if (!business) throw new NotFoundError("Business not found");
  return { slug: business.slug };
}

export async function reportBusiness({ businessId, reason, message = "", contact = "" } = {}) {
  await delay();
  const fields = {};
  const business = store.businesses.find((b) => b.id === businessId || b.slug === businessId);
  if (!business) throw new NotFoundError("Business not found");
  if (!REPORT_REASONS.some((r) => r.value === reason)) fields.reason = "Choose a reason";
  const text = String(message).trim();
  if (text.length > 500) fields.message = "Keep it under 500 characters";
  if (reason === "other" && text.length < 5) fields.message = "Tell us what is wrong";
  const reach = String(contact).trim();
  if (reach.length > 80) fields.contact = "Keep it under 80 characters";
  if (Object.keys(fields).length) throw new ValidationError("Please fix the highlighted fields", fields);
  const report = {
    id: `r_${String(store.reports.length + 1).padStart(4, "0")}`,
    businessId: business.id,
    reason,
    message: text,
    contact: reach,
    at: new Date().toISOString()
  };
  store.reports.push(report);
  return { ok: true, id: report.id };
}

export async function getFeaturedBusinesses({ categoryId = null, limit = 6, lat, lng, seed = null } = {}) {
  await delay();
  const origin = originOf(lat, lng);
  const byRating = (x, y) => y.rating - x.rating || y.reviewCount - x.reviewCount;
  return activeBusinesses()
    .filter((b) => PLAN_FEATURES[b.plan].featured)
    .filter((b) => !categoryId || b.categoryId === categoryId)
    .sort((x, y) => (seed == null ? byRating(x, y) : shuffleKey(seed, x.id) - shuffleKey(seed, y.id) || byRating(x, y)))
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
  const since = Date.now() - TOP_SEARCH_WINDOW_MS;
  const totals = new Map();
  for (const event of store.searches) {
    if (event.at >= since) totals.set(event.term, (totals.get(event.term) ?? 0) + event.count);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export async function logSearch(term) {
  const clean = normalizeText(term);
  if (clean.length < 2 || clean.length > 60) return { ok: false };
  store.searches.push({ term: clean, count: 1, at: Date.now() });
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
