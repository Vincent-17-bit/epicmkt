import { distanceKm, imageUrl, isCloudinaryId, PLAN_FEATURES, slugify, statusOf, todayHours } from "@epicmkt/shared";

const SHORT_MAX = 140;

// Where stored pictures come from. New pictures live in Cloudinary: a stored value with no file extension is a Cloudinary public id
// and becomes https://res.cloudinary.com/<VITE_CLOUDINARY_CLOUD_NAME>/image/upload/<transform>/<id> (see shared/src/seller/images.js).
// Pictures stored before the move still come from the Supabase bucket until scripts/migrate-images-to-cloudinary.mjs moves them;
// for those, VITE_MEDIA_HOSTS may list extra mirrors or CDN origins (comma separated; each must serve the bucket's files at
// <host>/<path>). Each file is then pinned to one host by a hash of its path, so a given picture always keeps the same url,
// which keeps browser and CDN caches warm.
const CLOUD_NAME = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? "").trim();
const MEDIA_HOSTS = String(import.meta.env.VITE_MEDIA_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().replace(/\/$/, ""))
  .filter(Boolean);

const pathHash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const mediaUrl = (path) => {
  if (!path) return null;
  if (isCloudinaryId(path)) return imageUrl(path, { cloudName: CLOUD_NAME });
  if (MEDIA_HOSTS.length) return `${MEDIA_HOSTS[pathHash(path) % MEDIA_HOSTS.length]}/${path}`;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/seller-media/${path}`;
};

const num = (value) => (value === null || value === undefined ? null : Number(value));

const shorten = (text) => {
  if (text.length <= SHORT_MAX) return text;
  const cut = text.slice(0, SHORT_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
};

// Exceptions (closed days, special hours) override the weekly hours for their date. A missing list means none.
const statusFor = (hours, exceptions) => {
  try {
    return statusOf(hours, exceptions);
  } catch {
    return statusOf({}, []);
  }
};

export const statusCard = (hours, exceptions) => {
  const { isOpen, line } = statusFor(hours, exceptions);
  return { isOpen, statusLine: line };
};

const exceptionsOf = (value) => (Array.isArray(value) ? value : []);

const originOf = (origin) => (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? origin : null);

const distanceFrom = (origin, lat, lng) => {
  const from = originOf(origin);
  return from && Number.isFinite(lat) && Number.isFinite(lng) ? distanceKm(from, { lat, lng }) : null;
};

export const pricingOf = (regularPrice, salePrice, priceType, unit) => ({
  regularPrice,
  salePrice,
  savings: regularPrice - salePrice,
  discountPercent: regularPrice > 0 ? Math.round(((regularPrice - salePrice) / regularPrice) * 100) : 0,
  unit: unit ?? null,
  priceType: priceType ?? "fixed",
  variants: []
});

export const itemOf = ({ id, businessId, businessSlug, name, description, price, priceType, unit, section, availability, imagePaths, videoPaths, createdAt }) => {
  const images = (imagePaths ?? []).map((path, index) => ({ id: `i${index + 1}`, url: mediaUrl(path), caption: name }));
  const videos = (videoPaths ?? []).map((path, index) => ({ id: `v${index + 1}`, url: mediaUrl(path), caption: name }));
  return {
    id,
    businessId,
    businessSlug,
    name,
    description: description ?? "",
    shortDescription: shorten(description ?? ""),
    includes: [],
    terms: "",
    duration: null,
    term: null,
    packSize: null,
    imageUrl: images[0]?.url ?? null,
    images,
    videos,
    regularPrice: Number.isFinite(price) ? price : null,
    priceType: priceType ?? "fixed",
    unit: unit ?? null,
    status: "listed",
    unlistReason: null,
    kind: "product",
    section: section ?? null,
    availability: availability ?? "available",
    variants: [],
    specs: [],
    createdAt
  };
};

export const cardOfFlash = (row, origin) => ({
  id: row.business_id,
  slug: row.business_slug,
  name: row.business_name,
  categoryId: row.business_category_id,
  townSlug: slugify(row.business_town ?? ""),
  logo: mediaUrl(row.business_logo_path),
  verified: row.business_verification_level === "verified",
  townName: row.business_town ?? "",
  lat: row.business_lat,
  lng: row.business_lng,
  phone: row.business_phone,
  whatsapp: row.business_whatsapp,
  ...statusCard(row.business_hours, row.business_exceptions),
  distanceKm: distanceFrom(origin, row.business_lat, row.business_lng)
});

export const cardOfBusiness = (row, origin) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  categoryId: row.category_id,
  townSlug: slugify(row.town ?? ""),
  logo: mediaUrl(row.logo_path),
  verified: row.verification_level === "verified",
  townName: row.town ?? "",
  lat: row.lat,
  lng: row.lng,
  phone: row.phone,
  whatsapp: row.whatsapp,
  ...statusCard(row.hours, row.exceptions),
  distanceKm: distanceFrom(origin, row.lat, row.lng)
});

export const entryOf = (row, { origin = null, now }) => {
  const regularPrice = Number(row.regular_price);
  const salePrice = Number(row.sale_price);
  const endsAt = new Date(row.ends_at).toISOString();
  const startsAt = new Date(row.starts_at).toISOString();
  const item = itemOf({
    id: row.item_id,
    businessId: row.business_id,
    businessSlug: row.business_slug,
    name: row.item_name,
    description: row.item_description,
    price: regularPrice,
    priceType: row.item_price_type,
    unit: row.item_unit,
    section: row.item_section,
    availability: row.item_availability,
    imagePaths: row.item_image_path ? [row.item_image_path] : [],
    createdAt: startsAt
  });
  return {
    sale: {
      id: row.id,
      businessId: row.business_id,
      itemId: row.item_id,
      headline: row.headline ?? null,
      startsAt,
      endsAt,
      discount: { type: row.discount_type, value: Number(row.discount_value) },
      variantOverrides: Array.isArray(row.variant_overrides) ? row.variant_overrides : [],
      quantityNote: row.quantity_note ?? null,
      afterEnd: "keep",
      status: "live",
      endedAt: null,
      endedReason: null,
      createdAt: startsAt,
      updatedAt: startsAt
    },
    item,
    pricing: pricingOf(regularPrice, salePrice, row.item_price_type, row.item_unit),
    business: cardOfFlash(row, origin),
    remainingMs: Math.max(0, Date.parse(endsAt) - now)
  };
};

export const flashParts = (entry, now) => ({
  sale: entry.sale,
  pricing: entry.pricing,
  remainingMs: Math.max(0, Date.parse(entry.sale.endsAt) - now)
});

export const businessOf = (row, { category, services, origin = null }) => {
  const hours = row.hours && typeof row.hours === "object" ? row.hours : {};
  const exceptions = exceptionsOf(row.exceptions);
  const status = statusFor(hours, exceptions);
  let today = null;
  try {
    today = todayHours(hours);
  } catch {
    today = null;
  }
  return {
    id: row.id,
    slug: row.slug,
    shortcode: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    categoryId: row.category_id,
    category: category ?? null,
    county: row.county ?? "",
    area: row.town ?? "",
    townSlug: slugify(row.town ?? ""),
    address: row.address ?? "",
    lat: row.lat,
    lng: row.lng,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: null,
    socials: row.socials ?? {},
    hours,
    exceptions,
    tags: row.tags ?? [],
    plan: row.plan_key,
    verified: row.verification_level === "verified",
    hue: 210,
    rating: 0,
    reviewCount: 0,
    coverUrl: mediaUrl(row.cover_path),
    logoUrl: mediaUrl(row.logo_path),
    gallery: [],
    offers: [],
    attributes: {},
    services,
    createdAt: row.created_at,
    closesAt: status.closesAt,
    opensAt: status.opensAt,
    openStatus: status,
    planFeatures: PLAN_FEATURES[row.plan_key] ?? PLAN_FEATURES.standard,
    isOpen: status.isOpen,
    statusLine: status.line,
    todayHours: today,
    distanceKm: distanceFrom(origin, row.lat, row.lng)
  };
};

export const serviceOf = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? "",
  priceKes: num(row.price),
  priceType: row.price_type,
  unit: row.unit ?? null,
  section: row.section ?? null,
  status: "listed",
  availability: row.availability,
  imageUrl: mediaUrl(row.image_paths?.[0])
});
