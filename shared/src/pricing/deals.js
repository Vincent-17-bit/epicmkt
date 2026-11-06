// Flash sale, sale price and offers on one unit price. The order is the one the shop already shows (see offers.js, offerSavings):
//   1. the listed price,
//   2. the sale price and any live flash sale price: the buyer pays the lower of the two (flash is never worse than the sale it sits on),
//   3. an offer works on that current price ("a flash sale price counts") and only changes the TOTAL for the quantity bought.
import { flashPrice } from "../seller/flash.js";
import { liveOffers, offerAvailableNow } from "../offers.js";
import { percentOf, wholeAmount } from "./money.js";

const entryId = (e) => (typeof e === "string" ? e : (e?.variantId ?? e?.id ?? null));

/**
 * Per-combination targeting. `entries` is a flash sale's variantOverrides (migration 0013) or an offer's variantIds/variantOverrides:
 * a list of variant ids or { variantId, discount? }. Empty or missing = the whole item.
 * -> null (does not apply), or the entry that applies ({} for a whole-item deal).
 * TODO(contract:A01): the stored shape of variant_overrides entries is not fixed yet; today it is always [].
 */
export function targetOf(entries, variantId) {
  if (!Array.isArray(entries) || entries.length === 0) return {};
  const hit = entries.find((e) => entryId(e) === variantId);
  return hit === undefined ? null : typeof hit === "string" ? {} : hit;
}

/** The live flash sale of the item, whether given as the sale itself or as { sale }. */
const liveFlash = (item, nowMs) => {
  const sale = item?.flash?.sale ?? item?.flash;
  if (!sale?.discount) return null;
  if (sale.status === "ended" || sale.status === "cancelled") return null;
  const starts = sale.startsAt ? Date.parse(sale.startsAt) : null;
  const ends = sale.endsAt ? Date.parse(sale.endsAt) : null;
  if ((starts !== null && starts > nowMs) || (ends !== null && ends <= nowMs)) return null;
  return sale;
};

/** { unit, source, flash } for one listed price: the lowest of listed, sale and flash. */
export function unitPrice(item, variant, listed, nowMs) {
  const out = { unit: listed, source: "regular" };
  const salePrice = wholeAmount(variant ? variant.salePrice : (item?.salePrice ?? item?.pricing?.salePrice));
  if (salePrice !== null && salePrice < out.unit) Object.assign(out, { unit: salePrice, source: "sale" });
  const sale = liveFlash(item, nowMs);
  const target = sale ? targetOf(sale.variantOverrides, variant?.id ?? null) : null;
  if (sale && target) {
    const discount = target.discount ?? sale.discount;
    const price = flashPrice(discount.type, Number(discount.value), listed);
    if (price > 0 && price < out.unit) Object.assign(out, { unit: price, source: "flash" });
  }
  return out;
}

/** What `qty` units cost under one offer, or null when the offer does not change the price. Percent and fractions are half up. */
export function offerTotal(offer, unit, qty) {
  const c = offer?.config ?? {};
  const full = unit * qty;
  switch (offer?.kind) {
    case "percent_off":
      return (unit - percentOf(unit, c.percent)) * qty;
    case "amount_off":
      return Math.max(0, unit - Math.round(Number(c.amount))) * qty;
    case "buy_x_get_y": {
      const groups = Math.floor(qty / (c.buy + c.get));
      return full - percentOf(unit * c.get * groups, c.discountPercent);
    }
    case "multi_buy": {
      const groups = Math.floor(qty / c.qty);
      return groups >= 1 ? groups * Math.round(Number(c.price)) + (qty - groups * c.qty) * unit : null;
    }
    case "volume": {
      const tier = [...(c.tiers ?? [])].reverse().find((t) => qty >= t.qty);
      return tier ? (unit - percentOf(unit, tier.percent)) * qty : null;
    }
    default:
      return null; // bundle, free gift and store offers are shown beside the price, they do not change it
  }
}

/** The best live offer for this combination and quantity: { total, offerId } or null. A free (0) total is a mistake in the offer and is ignored. */
export function bestOffer(item, variantId, unit, qty, nowMs) {
  let best = null;
  for (const offer of liveOffers(item?.offers, nowMs)) {
    if (offer.scope === "store" || !offerAvailableNow(offer, nowMs, item?.business?.timeZone)) continue;
    if (!targetOf(offer.variantIds ?? offer.variantOverrides, variantId)) continue;
    const total = offerTotal(offer, unit, qty);
    if (total !== null && total > 0 && total < unit * qty && (best === null || total < best.total)) best = { total, offerId: offer.id ?? null };
  }
  return best;
}
