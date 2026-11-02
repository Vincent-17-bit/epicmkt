import { mediaUrl } from "../../../../api/shape.js";

const PRICED = ["fixed", "from", "range"];

export const publicItemOf = (item) => {
  const priced = PRICED.includes(item.priceType) && typeof item.price === "number";
  const sale = priced && typeof item.salePrice === "number" && item.salePrice < item.price ? item.salePrice : item.price;
  const pricing = priced
    ? { regularPrice: item.price, salePrice: sale, savings: item.price - sale, discountPercent: item.price > 0 ? Math.round(((item.price - sale) / item.price) * 100) : 0, unit: item.unit || null, variants: [] }
    : null;
  return {
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
};

export const clientBase = () => String(import.meta.env?.VITE_CLIENT_URL ?? "").replace(/\/+$/, "");

export const liveLinkOf = (shopSlug, itemId) => {
  const base = clientBase();
  return base && shopSlug ? `${base}/b/${shopSlug}/i/${encodeURIComponent(itemId)}` : "";
};
