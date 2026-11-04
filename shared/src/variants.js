const VARIANT_MAX = 10;

const textOf = (value) => (typeof value === "string" ? value.trim() : "");

export const variantsOf = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = textOf(entry.id);
    const label = textOf(entry.label);
    const price = Number(entry.price);
    if (!id || !label || !Number.isFinite(price) || price < 0 || entry.stock === 0) continue;
    out.push({ id, label, price });
    if (out.length >= VARIANT_MAX) break;
  }
  return out;
};

export const variantPricing = (variants, priceFor = (price) => price) =>
  (variants ?? []).map((v) => {
    const salePrice = priceFor(v.price);
    const savings = v.price - salePrice;
    return { id: v.id, label: v.label, regularPrice: v.price, salePrice, savings, discountPercent: v.price > 0 ? Math.round((savings / v.price) * 100) : 0 };
  });

export const defaultVariantId = (pricing) => {
  const variants = pricing?.variants ?? [];
  if (!variants.length) return null;
  return (variants.find((v) => v.regularPrice === pricing.regularPrice) ?? variants[0]).id;
};
