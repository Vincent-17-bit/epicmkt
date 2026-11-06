// priceFor: what a buyer pays for one combination of an item, in whole units of the stored currency (integers only).
//
//   priceFor(item, selection, qty, now) ->
//     { available: true,  variantId, qty, unit, total, was, source, offerId, inStock }
//     { available: false, reason: "not_sold" | "incomplete" | "no_price", qty }
//
//   unit    what one unit costs after the sale price or flash sale (before any offer).
//   total   what `qty` units cost, after the best offer. Money is rounded half up, never a fraction.
//   was     the listed price x qty when the buyer pays less than that, else null (the struck-through figure).
//   source  where the price comes from: "regular" | "tier" | "sale" | "flash" | "offer".
//
// Selecting a combination with no price, or one the seller switched off, is "not_sold". A legacy item (no options) is priced from the
// item itself and behaves as before. A quantity is never 0 or negative: whole units go to at least 1; a measured item to at least its minimum.
// TODO(contract:measure): quantity.js normalizeQuantity owns step rounding for measured items; this only keeps the amount positive.
import { hasCombinations, inStock, isSold, resolveVariant, variantsOf } from "./pricing/combination.js";
import { bestOffer, unitPrice } from "./pricing/deals.js";
import { lineTotal, toMs, wholeAmount } from "./pricing/money.js";

const cleanQty = (item, qty) => {
  const n = Number(qty);
  if (item?.quantityMode === "none") return 1;
  if (item?.quantity && typeof item.quantity === "object") {
    const min = Number(item.quantity.min) > 0 ? Number(item.quantity.min) : 1;
    return Number.isFinite(n) && n > 0 ? Math.max(n, min) : min;
  }
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
};

const tierFor = (tiers, qty) => (Array.isArray(tiers) ? tiers.find((t) => qty >= t.minQty && (t.maxQty === null || t.maxQty === undefined || qty <= t.maxQty)) : null);

export function priceFor(item, selection, qty, now) {
  const nowMs = toMs(now);
  const q = cleanQty(item, qty);
  let variant = null;
  if (hasCombinations(item)) {
    const found = resolveVariant(item, selection);
    if (!found.variant) return { available: false, reason: found.reason, qty: q };
    variant = found.variant;
    if (!isSold(variant)) return { available: false, reason: "not_sold", qty: q };
  }
  const base = wholeAmount(variant ? variant.price : (item?.regularPrice ?? item?.price ?? item?.pricing?.regularPrice));
  const tier = tierFor(variant?.priceTiers ?? item?.priceTiers, q);
  const listed = tier ? wholeAmount(tier.unitPrice) : base;
  if (listed === null) return { available: false, reason: "no_price", qty: q };

  const current = unitPrice(item, variant, listed, nowMs);
  const regular = lineTotal(listed, q);
  const offer = bestOffer(item, variant?.id ?? null, current.unit, q, nowMs);
  let total = lineTotal(current.unit, q);
  let source = current.source === "regular" && tier ? "tier" : current.source;
  if (offer && offer.total < total) {
    total = offer.total;
    source = "offer";
  }
  return {
    available: true,
    variantId: variant?.id ?? null,
    qty: q,
    unit: current.unit,
    total,
    was: total < regular ? regular : null,
    source,
    offerId: source === "offer" ? offer.offerId : null,
    inStock: variant ? inStock(variant) : item?.availability !== "out_of_stock"
  };
}

/**
 * The lowest and highest price a buyer can pay for one unit, over the sellable combinations. Combinations in stock count first:
 * when at least one is in stock the range ignores the sold-out ones, so "From KES X" is a price you can actually buy.
 * -> { min, max, hasRange, inStock } or null when nothing is sold.
 */
export function priceBounds(item, now) {
  const nowMs = toMs(now);
  const prices = (hasCombinations(item) ? variantsOf(item).filter(isSold).map((v) => priceFor(item, v.id, 1, nowMs)) : [priceFor(item, null, 1, nowMs)]).filter((p) => p.available);
  if (prices.length === 0) return null;
  const live = prices.filter((p) => p.inStock);
  const pool = live.length > 0 ? live : prices;
  const totals = pool.map((p) => p.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return { min, max, hasRange: min !== max, inStock: live.length > 0 };
}

export const priceMin = (item, now) => priceBounds(item, now)?.min ?? null;
export const priceMax = (item, now) => priceBounds(item, now)?.max ?? null;
