// The one place the item page, the Saved drawer and the message to a shop take a line's money from. It wraps the maths the item page has
// always used (orderLine over the price the page shows), so all three always agree. Nothing here multiplies a price by a quantity itself:
// totals come from orderLine, which uses the shared lineTotal / priceTiered. Format only at display time.
import { choiceFromParam, choiceLabel, isBuyable, variantForChoice } from "@epicmkt/shared";
import { quantityInfo, orderLine } from "./itemView.js";
import { tiersFor } from "../components/item/Tiers.jsx";
import { isServiceItem } from "./listing.js";

// What the header and the message to the seller use for a chosen combination: its price in the shape of pricing (regular, sale, savings),
// and its name. A combination the seller does not sell has a name and no price. During a flash sale the item's own flash pricing stays in
// charge of the header (price rules for options come later), but the chat still names the choice.
export function optionShown(option, current) {
  const v = option.variant;
  // The combination's own unit ("per jar of 48") wins; without one, the item's unit applies as before.
  const unit = (typeof v?.unit === "string" && v.unit.trim() !== "" ? v.unit.trim() : null) ?? current?.pricing?.unit ?? null;
  const base = { id: v?.id ?? null, label: option.label };
  if (!v || !Number.isFinite(v.price)) return { ...base, regularPrice: NaN, salePrice: NaN, savings: 0, discountPercent: 0, unit };
  const sale = Number.isFinite(v.salePrice) && v.salePrice < v.price ? v.salePrice : v.price;
  const savings = v.price - sale;
  return { ...base, regularPrice: v.price, salePrice: sale, savings, discountPercent: savings > 0 ? Math.round((savings / v.price) * 100) : 0, unit, plainSale: true };
}

const hasOptions = (item) => Array.isArray(item?.options) && item.options.length > 0 && Array.isArray(item?.optionVariants) && item.optionVariants.length > 0;

/**
 * The option a saved line points at, from the same text the item page's ?v= link uses.
 * -> null (the item has no options) | { state: "none" } (never chosen) | { state: "gone" } (no longer sold) | { state: "ok", variant, label, axes }
 */
export function resolveOption(item, optionParam) {
  if (!hasOptions(item)) return null;
  if (!optionParam) return { state: "none" };
  const choice = choiceFromParam(item.options, optionParam);
  const variant = variantForChoice(item.options, item.optionVariants, choice);
  if (!variant || !isBuyable(variant)) return { state: "gone" };
  return { state: "ok", variant, label: variant.label || choiceLabel(item.options, choice), axes: item.options };
}

/**
 * One line's price. `option` is what the page's option picker (or resolveOption) chose: { variant, label } or null; `legacyVariant` is a
 * legacy variant of an item without option axes. `qty` null means "the least that can be bought".
 * -> { shown, tiers, info, qty, order, total, unit, was, priced }
 *   order  the page's order line (null when the item has no quantity control, as for a service): what the order button and message use
 *   total  what `qty` of it cost, in whole KES, or null when there is no price
 */
export function lineFor({ item, option = null, legacyVariant = null, qty = null }) {
  const shown = option ? (item?.flash ? item.pricing : option.variant ? optionShown(option, item) : null) : (legacyVariant ?? item?.pricing ?? null);
  const tiers = item ? tiersFor(item, option?.variant ?? null) : null;
  const info = item ? quantityInfo(item, option?.variant ?? null) : null;
  const wanted = Number.isFinite(qty) ? qty : (info?.rules.min ?? 1);
  const order = tiers || info ? orderLine({ shown, tiers, info, qty: wanted }) : null;
  // A line with no quantity control (a service, quantity mode "none") is one of the thing.
  const one = order ?? orderLine({ shown, tiers: null, info: null, qty: 1 });
  const regular = Number.isFinite(shown?.regularPrice) ? shown.regularPrice : null;
  return {
    shown,
    tiers,
    info,
    qty: one ? one.qty : wanted,
    order,
    total: one ? one.total : null,
    unit: one ? one.unit : null,
    // The struck-through price scales with the quantity: the listed price of what is being bought (not for tiers, which price the order whole).
    was: one && !tiers && regular !== null && Number.isFinite(shown?.salePrice) && shown.salePrice < regular && one.unit !== null ? orderLine({ shown: { regularPrice: regular, salePrice: regular }, info, qty: one.qty })?.total ?? null : null,
    priced: Boolean(one && Number.isFinite(one.total))
  };
}

/**
 * A saved line, judged against today's data. `status` is the one thing the line has to say:
 *   unavailable | option_gone | choose_options | no_price | ok
 * Lines that are not "ok" are shown but left out of every total (see Part E).
 */
export function savedLine({ entry, item }) {
  if (!item) return { status: "unavailable", total: null, qty: entry.qty, priced: false };
  const service = isServiceItem(item);
  const option = resolveOption(item, entry.optionParam);
  const base = { service, option };
  if (option?.state === "none") {
    const from = Number.isFinite(item.pricing?.priceMin) ? item.pricing.priceMin : Number.isFinite(item.pricing?.salePrice) ? item.pricing.salePrice : null;
    return { ...base, status: "choose_options", from, total: null, qty: entry.qty, priced: false };
  }
  if (option?.state === "gone") return { ...base, status: "option_gone", total: null, qty: entry.qty, priced: false };
  const withOption = option?.state === "ok" ? { variant: option.variant, label: option.label } : null;
  const info = service ? null : quantityInfo(item, withOption?.variant ?? null);
  // Held at what is in stock: the stored quantity changes only when the buyer touches the buttons.
  const stock = info?.rules.max;
  const wanted = info && Number.isFinite(stock) ? Math.min(entry.qty, stock) : entry.qty;
  const line = lineFor({ item: service ? { ...item, quantityMode: "none" } : item, option: withOption, qty: info ? Math.max(wanted, info.rules.min) : 1 });
  return { ...base, ...line, status: line.priced ? "ok" : "no_price", capped: info && Number.isFinite(stock) && entry.qty > stock ? stock : null };
}

/**
 * The price the page shows for the chosen quantity: the same shape as `shown`, but the amounts are what that many cost, so a price that
 * triples never looks like a price rise (the page says "for 3" under it). One of the thing, or no quantity control, changes nothing.
 */
export function shownForQty(shown, line) {
  if (!shown || !line?.order || !line.priced || line.qty === 1) return shown;
  const sale = line.total;
  const regular = line.was ?? line.total;
  return { ...shown, regularPrice: regular, salePrice: sale, savings: Math.max(0, regular - sale) };
}
