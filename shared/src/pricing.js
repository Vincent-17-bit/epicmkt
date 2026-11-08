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
//   next    with quantity tiers: { from, more, unit, text } for the next tier ("Add 3 more for KES 7 each"), else null.
//   bands   with graduated tiers: [{ from, qty, unit, subtotal }], else null. In graduated mode `unit` is the average price per unit.
//
// Selecting a combination with no price, or one the seller switched off, is "not_sold". A legacy item (no options) is priced from the
// item itself and behaves as before. A quantity is never 0 or negative: whole units go to at least 1; a measured item to at least its minimum.
// TODO(contract:measure): quantity.js normalizeQuantity owns step rounding for measured items; this only keeps the amount positive.
import { hasCombinations, inStock, isSold, resolveVariant, variantsOf } from "./pricing/combination.js";
import { bestOffer, unitPrice } from "./pricing/deals.js";
import { lineTotal, toMs, wholeAmount } from "./pricing/money.js";
import { nextTierHint, priceTiered, tierIndex, validateTiers } from "./pricing/tiers.js";

const cleanQty = (item, qty) => {
  const n = Number(qty);
  if (item?.quantityMode === "none") return 1;
  if (item?.quantity && typeof item.quantity === "object") {
    const min = Number(item.quantity.min) > 0 ? Number(item.quantity.min) : 1;
    return Number.isFinite(n) && n > 0 ? Math.max(n, min) : min;
  }
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
};

const tiersOf = (item, variant) => {
  const tiers = variant?.priceTiers ?? item?.priceTiers;
  const mode = variant?.priceTierMode ?? item?.priceTierMode ?? "whole";
  return Array.isArray(tiers) && tiers.length > 0 && validateTiers(tiers, mode).ok ? { tiers, mode } : null;
};

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
  const set = tiersOf(item, variant);
  const tier = set ? set.tiers[tierIndex(set.tiers, q)] : null;
  const listed = tier ? wholeAmount(tier.unitPrice) : base;
  if (listed === null) return { available: false, reason: "no_price", qty: q };

  const current = unitPrice(item, variant, listed, nowMs);
  let regular = lineTotal(listed, q);
  let unit = current.unit;
  let total = lineTotal(current.unit, q);
  let source = current.source === "regular" && tier ? "tier" : current.source;
  let bands = null;
  if (set?.mode === "graduated" && Number.isInteger(q)) {
    const listedBands = priceTiered({ tiers: set.tiers, mode: set.mode, qty: q });
    const paid = priceTiered({ tiers: set.tiers, mode: set.mode, qty: q, adjust: (n) => unitPrice(item, variant, n, nowMs).unit });
    regular = listedBands.total;
    total = paid.total;
    unit = paid.unit;
    bands = paid.bands;
    source = total < regular ? (listedBands.bands.map((b) => unitPrice(item, variant, b.unit, nowMs).source).find((x) => x !== "regular") ?? "tier") : "tier";
  }
  const offer = bestOffer(item, variant?.id ?? null, unit, q, nowMs);
  if (offer && offer.total < total) {
    total = offer.total;
    source = "offer";
  }
  return {
    available: true,
    variantId: variant?.id ?? null,
    qty: q,
    unit,
    total,
    was: total < regular ? regular : null,
    source,
    offerId: source === "offer" ? offer.offerId : null,
    inStock: variant ? inStock(variant) : item?.availability !== "out_of_stock",
    next: set ? nextTierHint(set.tiers, q, (n) => unitPrice(item, variant, n, nowMs).unit) : null,
    bands
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
