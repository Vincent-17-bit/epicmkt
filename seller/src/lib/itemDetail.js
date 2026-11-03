import { flashPrice, getUserTimeZone, isListed, liveOffers, makeItemOf, offerRemainingMs, pricingOf, statusOf } from "@epicmkt/shared";
import { mediaUrl } from "../api/shape.js";

const itemOf = makeItemOf(mediaUrl);

const openStatus = (shop) => {
  try {
    return statusOf(shop.hours ?? {}, shop.exceptions ?? [], undefined, shop.timezone, getUserTimeZone());
  } catch {
    return statusOf({}, []);
  }
};

export const detailBusiness = (shop, items = []) => {
  const open = openStatus(shop);
  return {
    id: shop.slug,
    slug: shop.slug,
    name: shop.name,
    category: { singular: shop.categoryName },
    attributes: {},
    productCount: items.filter(isListed).length,
    shopSettings: shop.settings ?? {},
    coverUrl: mediaUrl(shop.coverPath),
    logoUrl: mediaUrl(shop.logoPath),
    isOpen: open.isOpen,
    statusLine: open.line
  };
};

const sellerCard = (shop, business) => ({
  id: shop.slug,
  slug: shop.slug,
  name: shop.name,
  categoryId: shop.categoryId ?? null,
  logo: mediaUrl(shop.logoPath),
  verified: Boolean(shop.verified),
  townName: shop.town ?? "",
  phone: shop.phone,
  whatsapp: shop.whatsapp,
  isOpen: business.isOpen,
  statusLine: business.statusLine,
  productCount: business.productCount,
  distanceKm: null
});

const salePart = (sale) => ({
  id: sale.id,
  businessId: null,
  itemId: sale.itemId,
  headline: sale.headline ?? null,
  startsAt: sale.startsAt,
  endsAt: sale.endsAt,
  discount: { type: sale.discountType, value: sale.discountValue },
  variantOverrides: [],
  quantityNote: sale.quantityNote ?? null,
  afterEnd: sale.afterEnd ?? "keep",
  status: "live"
});

export const runningSale = (sales, itemId, nowMs) =>
  (sales ?? []).find((s) => s.itemId === itemId && s.status === "live" && Date.parse(s.startsAt) <= nowMs && Date.parse(s.endsAt) > nowMs) ?? null;

export const offersOnItem = (offers, itemId, nowMs) =>
  liveOffers((offers ?? []).filter((o) => o.items?.some((entry) => entry.itemId === itemId)), nowMs);

const withGallery = (base, gallery) => {
  const images = gallery.filter((m) => m.kind === "image").map((m, i) => ({ id: `i${i + 1}`, url: m.url, caption: base.name }));
  const videos = gallery.filter((m) => m.kind === "video").map((m, i) => ({ id: `v${i + 1}`, url: m.url, caption: base.name }));
  let photo = 0;
  let video = 0;
  const media = gallery.map((m) => ({ id: m.kind === "video" ? `v${++video}` : `i${++photo}`, kind: m.kind, url: m.url, caption: base.name }));
  return { ...base, images, videos, media, imageUrl: images[0]?.url ?? null };
};

export const itemDetailOf = ({ item, shop, items = [], media = null, gallery = null, sale = null, offers = [], nowMs = Date.now() }) => {
  const business = detailBusiness(shop, items);
  const sequence = media?.length ? media : null;
  const base = itemOf({
    id: item.id,
    businessId: shop.slug,
    businessSlug: shop.slug,
    name: item.name,
    description: item.description,
    shortDescription: item.shortDescription,
    brand: item.brand,
    highlights: item.highlights,
    specs: item.specs,
    includes: item.includes,
    terms: item.terms,
    packSize: item.packSize,
    variants: item.variants,
    price: typeof item.price === "number" ? item.price : NaN,
    priceType: item.priceType,
    unit: item.unit,
    section: item.section,
    availability: item.availability,
    stockLeft: item.trackStock && item.showStockCount && item.availability === "limited_stock" && item.stockCount > 0 ? item.stockCount : null,
    imagePaths: sequence ? sequence.filter((m) => m.kind === "image").map((m) => m.path) : item.imagePaths,
    videoPaths: sequence ? sequence.filter((m) => m.kind === "video").map((m) => m.path) : [],
    mediaPaths: sequence,
    createdAt: item.createdAt
  });
  const regular = base.regularPrice;
  const priced = Number.isFinite(regular);
  const priceFor = (price) => (sale ? flashPrice(sale.discountType, sale.discountValue, price) : price);
  const pricing = priced ? pricingOf(regular, priceFor(regular), item.priceType, item.unit, base.variants, priceFor) : null;
  const flash = sale && pricing ? { sale: salePart(sale), pricing, remainingMs: Math.max(0, Date.parse(sale.endsAt) - nowMs) } : null;
  return {
    ...(gallery ? withGallery(base, gallery) : base),
    business: sellerCard(shop, business),
    pricing,
    flash,
    offers: offersOnItem(offers, item.id, nowMs).map((offer) => ({ offer, remainingMs: offerRemainingMs(offer, nowMs) }))
  };
};
