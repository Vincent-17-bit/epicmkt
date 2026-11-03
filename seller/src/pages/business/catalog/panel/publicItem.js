import { variantPricing, variantsOf } from "@epicmkt/shared";
import { mediaUrl } from "../../../../api/shape.js";

const PRICED = ["fixed", "from", "range"];

const withGallery = (base, gallery) => {
  let photo = 0;
  let video = 0;
  const media = gallery.map((m) => ({ id: m.kind === "video" ? `v${++video}` : `i${++photo}`, kind: m.kind, url: m.url, caption: "" }));
  return { ...base, images: media.filter((m) => m.kind === "image"), videos: media.filter((m) => m.kind === "video"), media };
};

export const publicItemOf = (item, { gallery = null } = {}) => {
  const priced = PRICED.includes(item.priceType) && typeof item.price === "number";
  const sale = priced && typeof item.salePrice === "number" && item.salePrice < item.price ? item.salePrice : item.price;
  const pricing = priced
    ? { regularPrice: item.price, salePrice: sale, savings: item.price - sale, discountPercent: item.price > 0 ? Math.round(((item.price - sale) / item.price) * 100) : 0, unit: item.unit || null, variants: variantPricing(variantsOf(item.variants)) }
    : null;
  const base = {
    id: item.id,
    name: item.name,
    brand: item.brand ?? "",
    shortDescription: item.shortDescription ?? "",
    description: item.description ?? "",
    kind: "product",
    packSize: item.packSize ?? "",
    section: item.section ?? "",
    images: (item.imagePaths ?? []).map((path, i) => ({ id: `p${i}`, url: mediaUrl(path), caption: "" })),
    videos: [],
    offers: [],
    flash: null,
    highlights: item.highlights ?? [],
    includes: item.includes ?? [],
    terms: item.terms ?? "",
    specs: item.specs ?? [],
    availability: item.availability,
    stockLeft: item.trackStock && item.showStockCount && item.stockCount > 0 ? item.stockCount : null,
    pricing,
  };
  return gallery ? withGallery(base, gallery) : base;
};

export const clientBase = () => String(import.meta.env?.VITE_CLIENT_URL ?? "").replace(/\/+$/, "");

export const liveLinkOf = (shopSlug, itemId) => {
  const base = clientBase();
  return base && shopSlug ? `${base}/b/${shopSlug}/i/${encodeURIComponent(itemId)}` : "";
};
