import { mediaUrl } from "../../../api/shape.js";

const PRICED = ["fixed", "from", "range"];

export const cardItemOf = (item) => {
  const priced = PRICED.includes(item.priceType) && typeof item.price === "number";
  const sale = priced && typeof item.salePrice === "number" && item.salePrice < item.price ? item.salePrice : item.price;
  const pricing = priced
    ? { regularPrice: item.price, salePrice: sale, savings: item.price - sale, discountPercent: item.price > 0 ? Math.round(((item.price - sale) / item.price) * 100) : 0, variants: [] }
    : null;
  const availability = item.availability === "available" || item.availability === "by_appointment" ? "available" : item.availability === "limited_stock" ? "limited" : "unavailable";
  return { id: item.id, name: item.name, imageUrl: mediaUrl(item.imagePaths?.[0]), pricing, availability };
};

export const priceText = (item) => {
  const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;
  if (item.priceType === "free") return "Free";
  if (item.priceType === "contact" || typeof item.price !== "number") return "Contact for price";
  if (item.priceType === "from") return `From ${kes(item.price)}`;
  if (item.priceType === "range") return `${kes(item.price)} to ${kes(item.priceMax ?? item.price)}`;
  return kes(item.price);
};

export const customerUrl = (slug, id) => {
  const base = String(import.meta.env?.VITE_CLIENT_URL ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/b/${slug}?item=${id}` : null;
};

export const readDevicePref = (key, fallback, allowed) => {
  let stored = null;
  try { stored = localStorage.getItem(key); } catch { stored = null; }
  return allowed.includes(stored) ? stored : fallback;
};

export const storeDevicePref = (key, value) => {
  try { localStorage.setItem(key, value); } catch { return; }
};
