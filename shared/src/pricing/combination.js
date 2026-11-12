// Which sellable combination a selection means. Reads the public payload the fixtures and the mock API serve today:
// item.options (axes) and item.optionVariants ({ id, choice, price, salePrice, status }).
// TODO(contract:A01): Contract v1 names these `variants[]` with `combo`; until that is merged this follows the W0 fixtures.
import { variantForChoice } from "../options/dependent.js";
import { isBuyable } from "../options/defaultVariant.js";
import { wholeAmount } from "./money.js";

export const variantsOf = (item) => (Array.isArray(item?.optionVariants) ? item.optionVariants : []);

/** True for items that sell through combinations. Legacy items (no options) are priced from the item itself. */
export const hasCombinations = (item) => variantsOf(item).length > 0 && Array.isArray(item?.options) && item.options.length > 0;

/**
 * selection: a variant id, { variantId }, or a choice { axisKey: valueId }.
 * -> { variant } or { reason: "incomplete" | "not_sold" }.
 * A choice that names every axis but matches no combination is "not_sold"; a choice that is missing an axis is "incomplete".
 * A single-combination item needs no selection.
 */
export function resolveVariant(item, selection) {
  const variants = variantsOf(item);
  const axes = item?.options ?? [];
  const id = typeof selection === "string" ? selection : selection?.variantId;
  if (id) {
    const found = variants.find((v) => v.id === id);
    return found ? { variant: found } : { reason: "not_sold" };
  }
  const choice = selection && typeof selection === "object" ? (selection.choice ?? selection) : {};
  if (axes.every((a) => typeof choice[a.key] === "string" && choice[a.key])) {
    const found = variantForChoice(axes, variants, choice);
    return found ? { variant: found } : { reason: "not_sold" };
  }
  if (variants.length === 1) return { variant: variants[0] };
  return { reason: "incomplete" };
}

/** A combination the shop sells: it has a price and the seller has not switched it off. Out of stock still counts as sold. */
export const isSold = (variant) => wholeAmount(variant?.price) !== null && variant?.status !== "unavailable";

export const inStock = (variant) => isBuyable(variant);
