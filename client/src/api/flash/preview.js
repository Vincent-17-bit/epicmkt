// The seller's live preview (seller app, Item editor) shows the real item page of this site, filled with the form as it is typed.
// The editor posts a message with the item in the shape the database would give the page; this turns it into the page's item, with
// the same functions the live page uses (itemOf, pricingOf, withTiers), so what the seller sees is what a buyer will see.
// Pure, apart from object URLs for photos that are not uploaded yet (the seller's files, sent as Blobs).
import { buildView3d, emptyOptions, resolveMedia3d } from "@epicmkt/shared";
import { cardOfBusiness, itemOf, mediaUrl, pricingOf, rangeOfRow } from "./shape.js";
import { withTiers } from "./tiers.js";

const urls = new Map();
const blobUrl = (blob) => {
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  return urls.get(blob);
};
/** Frees the object URLs made for an earlier message. */
export const releasePreviewUrls = (keep = []) => {
  for (const [blob, url] of urls) if (!keep.includes(blob)) { URL.revokeObjectURL(url); urls.delete(blob); }
};

const isBlob = (v) => typeof Blob !== "undefined" && v instanceof Blob;
const urlOf = (m) => (isBlob(m?.blob) ? blobUrl(m.blob) : typeof m?.url === "string" && /^https:/.test(m.url) ? m.url : mediaUrl(m?.path));

/**
 * payload: { row, business, options, tiers, media, media3d }
 *   row       the item as public_items has it (snake_case)
 *   business  the shop as public_businesses has it (only what the card needs: id, slug, name, logo_path, town, whatsapp, hours ...)
 *   options   the public options payload ({ options, optionVariants, optionAvailability, defaultVariantId, sizeChart }) or null
 *   tiers     { tiers, mode, variants } or null
 *   media     [{ id, kind, path | blob }] in the seller's order (photos and videos)
 *   media3d   the item's 3D rows ({ role, path, sort, optionIds }) or []
 */
export function previewDetail(payload) {
  const row = payload?.row ?? {};
  const shop = payload?.business ?? {};
  const base = itemOf({
    id: row.id ?? "preview",
    businessId: shop.id ?? null,
    businessSlug: shop.slug ?? "",
    name: row.name || "Your item",
    description: row.description,
    shortDescription: row.short_description,
    brand: row.brand,
    highlights: row.highlights,
    specs: row.specs,
    includes: row.includes,
    includeMedia: null,
    delivery: row.delivery,
    notices: row.notices,
    gallery: row.gallery,
    brandPage: row.brand_page,
    pictureUrl: (p) => urlOf(p),
    terms: row.terms,
    packSize: row.pack_size,
    variants: row.variants,
    price: row.price === null || row.price === undefined || row.price === "" ? NaN : Number(row.price),
    hasOptions: row.has_options === true,
    optionCount: row.option_count,
    priceRange: rangeOfRow(row),
    priceType: row.price_type,
    unit: row.unit,
    section: row.section,
    availability: row.availability,
    stockLeft: row.stock_left ?? null,
    imagePaths: [],
    videoPaths: [],
    mediaPaths: [],
    createdAt: row.created_at ?? new Date().toISOString()
  });
  const media = (Array.isArray(payload?.media) ? payload.media : [])
    .filter((m) => m && (m.kind === "image" || m.kind === "video"))
    .map((m) => ({ id: String(m.id), kind: m.kind, url: urlOf(m), caption: base.name }))
    .filter((m) => m.url);
  const includePhotos = Array.isArray(row.include_media) && row.include_media.some(Boolean)
    ? base.includes.map((_, i) => (row.include_media[i] ? urlOf(row.include_media[i]) : null))
    : null;
  const item = {
    ...base,
    media,
    images: media.filter((m) => m.kind === "image"),
    videos: media.filter((m) => m.kind === "video"),
    imageUrl: media.find((m) => m.kind === "image")?.url ?? null,
    ...(includePhotos ? { includePhotos } : {})
  };
  const options = payload?.options && Array.isArray(payload.options.options) && payload.options.options.length > 0 ? { ...emptyOptions(), ...payload.options } : emptyOptions();
  const pricing = Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit, item.variants) : null;
  const view = Array.isArray(payload?.media3d) && payload.media3d.length ? resolveMedia3d(buildView3d(payload.media3d), (path) => mediaUrl(path)) : null;
  const card = cardOfBusiness({ id: shop.id ?? "preview-shop", slug: shop.slug ?? "", name: shop.name ?? "Your shop", category_id: shop.category_id ?? null, town: shop.town ?? "", logo_path: shop.logo_path ?? null, verification_level: shop.verification_level ?? null, lat: shop.lat ?? null, lng: shop.lng ?? null, delivery: shop.delivery ?? null, phone: shop.phone ?? null, whatsapp: shop.whatsapp ?? null, hours: shop.hours ?? {}, exceptions: shop.exceptions ?? [], timezone: shop.timezone ?? null });
  return withTiers({
    ...item,
    ...options,
    ...(view && (view.view3d || Object.keys(view.view3dByOption).length) ? { view3dPreview: view } : {}),
    business: card,
    pricing,
    flash: null,
    offers: [],
    preview: true
  }, payload?.tiers ?? null);
}
