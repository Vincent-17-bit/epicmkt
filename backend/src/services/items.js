import { BUSINESS_STATUS, distanceKm, isOpenNow } from "@epicmkt/shared";
import { store } from "../store.js";
import { delay } from "../latency.js";
import { now } from "../clock.js";
import { NotFoundError } from "../errors.js";
import { serviceArt } from "../data/art.js";
import { defaultKind } from "../data/catalogItems.js";
import { appliesToLabel, buildPricing, liveOffersFor, liveSaleFor, liveStoreOffers, runSweep } from "../promotions.js";

const MAX_SPECS = 20;

const SHORT_MAX = 140;

const shorten = (text) => {
  if (text.length <= SHORT_MAX) return text;
  const cut = text.slice(0, SHORT_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
};

const toItem = (business, svc, index) => {
  const hue = business.hue ?? 210;
  const images = svc.images ?? [0, 1, 2].map((k) => ({
    id: `i${k + 1}`,
    url: k === 0 ? svc.imageUrl : serviceArt((hue + 36 * (k + 1)) % 360, svc.name),
    caption: svc.name
  }));
  return {
    id: svc.id,
    businessId: business.id,
    businessSlug: business.slug,
    name: svc.name,
    description: svc.description ?? "",
    shortDescription: svc.shortDescription ?? shorten(svc.description ?? ""),
    includes: svc.includes ?? [],
    terms: svc.terms ?? "",
    duration: svc.duration ?? null,
    term: svc.term ?? null,
    packSize: svc.packSize ?? null,
    imageUrl: svc.imageUrl,
    images,
    regularPrice: Number.isFinite(svc.priceKes) ? svc.priceKes : null,
    priceType: svc.priceType ?? "fixed",
    unit: svc.unit ?? null,
    status: svc.status ?? "listed",
    unlistReason: svc.unlistReason ?? null,
    kind: svc.kind ?? defaultKind(business.categoryId),
    section: svc.section ?? null,
    availability: svc.availability ?? "available",
    variants: svc.variants ?? [],
    specs: (svc.specs ?? []).slice(0, MAX_SPECS),
    createdAt: new Date(Date.parse(business.createdAt) + index * 60000).toISOString()
  };
};

const locate = (itemId, businessId) => {
  const pool = businessId ? store.businesses.filter((b) => b.id === businessId || b.slug === businessId) : store.businesses;
  for (const business of pool) {
    const index = business.services.findIndex((svc) => svc.id === itemId);
    if (index >= 0) return { business, item: toItem(business, business.services[index], index) };
  }
  return null;
};

const sellerCard = (business, origin) => ({
  id: business.id,
  slug: business.slug,
  name: business.name,
  categoryId: business.categoryId,
  townSlug: business.townSlug,
  logo: business.logoUrl ?? null,
  verified: business.verified,
  townName: business.area,
  lat: business.lat,
  lng: business.lng,
  phone: business.phone,
  whatsapp: business.whatsapp,
  isOpen: isOpenNow(business.hours),
  distanceKm: origin ? distanceKm(origin, business) : null
});

const flashParts = (item, sale) => ({
  sale,
  pricing: buildPricing(item, sale),
  remainingMs: Math.max(0, Date.parse(sale.endsAt) - now())
});

const offerViews = (item, business) =>
  liveOffersFor(item, business).map((offer) => ({
    offer,
    business: sellerCard(business, null),
    remainingMs: offer.endsAt ? Math.max(0, Date.parse(offer.endsAt) - now()) : null,
    appliesToLabel: appliesToLabel(offer, business)
  }));

const originOf = (origin) =>
  origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? origin : null;

export async function getServerTime() {
  runSweep();
  return { now: new Date(now()).toISOString() };
}

export async function getFlashForItem(itemId, businessId) {
  await delay();
  runSweep();
  const found = locate(itemId, businessId);
  if (!found) return null;
  const sale = liveSaleFor(found.item, found.business);
  if (!sale) return null;
  return {
    ...flashParts(found.item, sale),
    item: found.item,
    business: sellerCard(found.business, null)
  };
}

export async function getItemDetail(itemId, { businessId, origin } = {}) {
  await delay();
  runSweep();
  const found = locate(itemId, businessId);
  if (!found || found.item.status !== "listed" || found.business.status !== BUSINESS_STATUS.ACTIVE) {
    throw new NotFoundError("Item not found");
  }
  const { item, business } = found;
  const sale = liveSaleFor(item, business);
  return {
    ...item,
    business: sellerCard(business, originOf(origin)),
    pricing: buildPricing(item, sale),
    flash: sale ? flashParts(item, sale) : null,
    offers: offerViews(item, business)
  };
}

const endMs = (offer) => (offer.endsAt ? Date.parse(offer.endsAt) : Infinity);

const OFFER_SORTS = {
  ending: (a, b) => endMs(a.offer) - endMs(b.offer),
  nearest: (a, b) => (a.business.distanceKm ?? Infinity) - (b.business.distanceKm ?? Infinity) || endMs(a.offer) - endMs(b.offer),
  newest: (a, b) => Date.parse(b.offer.createdAt) - Date.parse(a.offer.createdAt)
};

export async function getOffers({ businessId, itemId, categoryId = null, town = null, sort = "ending", limit = 20, offset = 0, origin = null } = {}) {
  await delay();
  runSweep();
  const at = now();
  if (!businessId) {
    const from = originOf(origin);
    const rows = [];
    for (const business of store.businesses) {
      if (business.status !== BUSINESS_STATUS.ACTIVE) continue;
      if (categoryId && business.categoryId !== categoryId) continue;
      if (town && business.townSlug !== town) continue;
      for (const offer of liveStoreOffers(business, at)) {
        rows.push({ offer, business: sellerCard(business, from), remainingMs: offer.endsAt ? Math.max(0, Date.parse(offer.endsAt) - at) : null, appliesToLabel: appliesToLabel(offer, business) });
      }
    }
    rows.sort(OFFER_SORTS[sort] ?? OFFER_SORTS.ending);
    return { items: rows.slice(offset, offset + limit), total: rows.length, serverNow: new Date(at).toISOString() };
  }
  const business = store.businesses.find((b) => b.id === businessId || b.slug === businessId);
  if (!business || business.status !== BUSINESS_STATUS.ACTIVE) return { items: [], total: 0, serverNow: new Date(at).toISOString() };
  const found = itemId ? locate(itemId, business.id) : null;
  const views = found
    ? offerViews(found.item, business)
    : store.offers
        .filter((offer) => offer.businessId === business.id && offer.status === "active")
        .map((offer) => ({ offer, business: sellerCard(business, null), remainingMs: offer.endsAt ? Math.max(0, Date.parse(offer.endsAt) - at) : null, appliesToLabel: appliesToLabel(offer, business) }));
  return { items: views.slice(0, limit), total: views.length, serverNow: new Date(at).toISOString() };
}

export async function getOfferFacets() {
  await delay();
  runSweep();
  const at = now();
  const categories = new Map();
  const towns = new Map();
  let total = 0;
  for (const business of store.businesses) {
    if (business.status !== BUSINESS_STATUS.ACTIVE) continue;
    const live = liveStoreOffers(business, at).length;
    if (!live) continue;
    total += live;
    categories.set(business.categoryId, (categories.get(business.categoryId) ?? 0) + live);
    const entry = towns.get(business.townSlug) ?? { slug: business.townSlug, name: business.area, count: 0 };
    entry.count += live;
    towns.set(business.townSlug, entry);
  }
  return {
    total,
    categories: [...categories].map(([id, count]) => ({ id, count })),
    towns: [...towns.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function getStoreSelective(businessId, { excludeItemId, limit = 12 } = {}) {
  await delay();
  runSweep();
  const business = store.businesses.find((b) => b.id === businessId || b.slug === businessId);
  if (!business || business.status !== BUSINESS_STATUS.ACTIVE) return [];
  const all = business.services.map((svc, index) => toItem(business, svc, index));
  const current = all.find((item) => item.id === excludeItemId);
  const rows = all
    .filter((item) => item.id !== excludeItemId && item.status === "listed")
    .map((item) => {
      const sale = liveSaleFor(item, business);
      return {
        ...item,
        pricing: buildPricing(item, sale),
        flash: sale ? flashParts(item, sale) : null
      };
    });
  const rank = (row) => [
    row.availability === "unavailable" ? 1 : 0,
    current?.section && row.section === current.section ? 0 : 1,
    row.flash ? 0 : 1,
    -Date.parse(row.createdAt)
  ];
  rows.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
  return rows.slice(0, limit);
}

const HOUR_MS = 3600000;
const WINDOWS = { "1h": HOUR_MS, "24h": 24 * HOUR_MS };

const SALE_SORTS = {
  ending: (a, b) => Date.parse(a.sale.endsAt) - Date.parse(b.sale.endsAt),
  discount: (a, b) => b.pricing.discountPercent - a.pricing.discountPercent || Date.parse(a.sale.endsAt) - Date.parse(b.sale.endsAt),
  nearest: (a, b) => (a.business.distanceKm ?? Infinity) - (b.business.distanceKm ?? Infinity) || Date.parse(a.sale.endsAt) - Date.parse(b.sale.endsAt),
  newest: (a, b) => Date.parse(b.sale.startsAt) - Date.parse(a.sale.startsAt)
};

export async function getFlashSales({
  businessId = null,
  categoryId = null,
  town = null,
  endsWithin = null,
  minPrice = null,
  maxPrice = null,
  sort = "ending",
  limit = 12,
  offset = 0,
  origin = null
} = {}) {
  await delay();
  runSweep();
  const at = now();
  const from = originOf(origin);
  const window = WINDOWS[endsWithin] ?? null;
  const rows = [];
  for (const business of store.businesses) {
    if (business.status !== BUSINESS_STATUS.ACTIVE) continue;
    if (businessId && business.id !== businessId && business.slug !== businessId) continue;
    if (categoryId && business.categoryId !== categoryId) continue;
    if (town && business.townSlug !== town) continue;
    business.services.forEach((svc, index) => {
      if (svc.status === "unlisted") return;
      const item = toItem(business, svc, index);
      const sale = liveSaleFor(item, business, at);
      if (!sale) return;
      const pricing = buildPricing(item, sale);
      if (!pricing) return;
      if (window && Date.parse(sale.endsAt) - at > window) return;
      if (Number.isFinite(minPrice) && pricing.salePrice < minPrice) return;
      if (Number.isFinite(maxPrice) && pricing.salePrice > maxPrice) return;
      rows.push({ sale, item, pricing, business: sellerCard(business, from), remainingMs: Math.max(0, Date.parse(sale.endsAt) - at) });
    });
  }
  rows.sort(SALE_SORTS[sort] ?? SALE_SORTS.ending);
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    serverNow: new Date(at).toISOString()
  };
}

export async function getFlashFacets() {
  await delay();
  runSweep();
  const at = now();
  const categories = new Map();
  const towns = new Map();
  let total = 0;
  for (const business of store.businesses) {
    if (business.status !== BUSINESS_STATUS.ACTIVE) continue;
    const live = business.services.filter((svc) => svc.status !== "unlisted" && liveSaleFor({ id: svc.id, status: svc.status ?? "listed" }, business, at)).length;
    if (!live) continue;
    total += live;
    categories.set(business.categoryId, (categories.get(business.categoryId) ?? 0) + live);
    const town = towns.get(business.townSlug) ?? { slug: business.townSlug, name: business.area, count: 0 };
    town.count += live;
    towns.set(business.townSlug, town);
  }
  return {
    total,
    categories: [...categories].map(([id, count]) => ({ id, count })),
    towns: [...towns.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}
