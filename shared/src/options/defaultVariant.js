// Which variant is selected when the buyer has not chosen anything: the seller's default, else the cheapest one in stock.
//
// A variant here is the public shape { id, choice, price, salePrice, status }. "In stock" is available or limited_stock.
// "Cheapest" is the price the buyer would pay (the sale price when there is one). Ties go to the variant the seller listed first.

const BUYABLE = new Set(["available", "limited_stock"]);

export const isBuyable = (variant) => BUYABLE.has(variant?.status);

// The price the buyer pays for one variant; a variant with no price sorts last.
export const payPrice = (variant) => {
  const sale = Number(variant?.salePrice);
  if (variant?.salePrice !== null && variant?.salePrice !== undefined && Number.isFinite(sale)) return sale;
  const price = Number(variant?.price);
  return variant?.price !== null && variant?.price !== undefined && Number.isFinite(price) ? price : Number.POSITIVE_INFINITY;
};

export const cheapestInStock = (variants) => {
  let best = null;
  for (const v of variants ?? []) {
    if (!isBuyable(v)) continue;
    if (best === null || payPrice(v) < payPrice(best)) best = v;
  }
  return best;
};

// `defaultVariantId` is the seller's choice (items.default_variant_id). `within` limits the search to some variants, for
// example the ones left after the buyer picked a style, so the default is the default of that set.
// Order of preference: the seller's default (when buyable), the cheapest in stock, the seller's default (sold out), the first listed.
export const findDefaultVariant = (variants, defaultVariantId = null, within = null) => {
  const pool = Array.isArray(within) ? within : Array.isArray(variants) ? variants : [];
  if (pool.length === 0) return null;
  const chosen = defaultVariantId ? pool.find((v) => v.id === defaultVariantId) : null;
  if (chosen && isBuyable(chosen)) return chosen;
  return cheapestInStock(pool) ?? chosen ?? pool.find((v) => v.status !== "unavailable") ?? pool[0];
};
