import { BUSINESS_STATUS, distanceKm, isOpenNow } from "@epicmkt/shared";
import { store } from "../store.js";
import { delay } from "../latency.js";
import { now } from "../clock.js";
import { NotFoundError } from "../errors.js";
import { serviceArt } from "../data/art.js";
import { buildPricing, liveSaleFor, runSweep } from "../promotions.js";

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
    flash: sale ? flashParts(item, sale) : null
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
