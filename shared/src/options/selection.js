// What the option picker needs beyond the basics in dependent.js: the choice in the URL, which values are available next to the
// current choice, and the price a value's card shows. Pure functions over the public payload ({ options, optionVariants }).

import { isBuyable, payPrice } from "./defaultVariant.js";
import { dependentValues, variantForChoice } from "./dependent.js";

// ---- ?v= : the whole choice in one short value, "grey.256" (value ids in axis order, joined by a dot; ids never contain one) ----

export const choiceToParam = (axes, choice) => {
  const list = Array.isArray(axes) ? axes : [];
  if (list.length === 0 || !choice) return "";
  const parts = list.map((a) => choice[a.key]);
  return parts.every((p) => typeof p === "string" && p) ? parts.join(".") : "";
};

// A partial choice from the text: only the values that really exist on their axis. Anything else is ignored, so an old or hand-edited
// link falls back to the default for the axes it got wrong. Wrong length or non-text gives {}.
export const choiceFromParam = (axes, text) => {
  const list = Array.isArray(axes) ? axes : [];
  if (typeof text !== "string" || list.length === 0) return {};
  const parts = text.split(".");
  if (parts.length !== list.length) return {};
  const out = {};
  list.forEach((a, i) => {
    if (a.values?.some((v) => v.id === parts[i])) out[a.key] = parts[i];
  });
  return out;
};

// ---- availability of one value next to the rest of the choice ----

// The variant you would get by picking `valueId` on `axisKey` and keeping the other axes as they are.
const variantWith = (axes, variants, choice, axisKey, valueId) => variantForChoice(axes, variants, { ...choice, [axisKey]: valueId });

// "available" | "limited_stock" | "out_of_stock" | "unavailable" (a variant the seller switched off) | "not_sold" (no such combination).
export const valueStatus = (axes, variants, choice, axisKey, valueId) => variantWith(axes, variants, choice, axisKey, valueId)?.status ?? "not_sold";

// The values of an axis the picker draws, with what each card shows. `showPrice` is true only when the prices differ across the
// axis's values (next to the rest of the choice); otherwise the cards stay clean. A value with no sold combination has no price.
export const axisCards = (axes, variants, choice, axisKey) => {
  const axis = (axes ?? []).find((a) => a.key === axisKey);
  if (!axis) return { values: [], showPrice: false };
  const values = dependentValues(axes, variants, axisKey, choice).map((value) => {
    const variant = variantWith(axes, variants, choice, axisKey, value.id);
    const status = variant?.status ?? "not_sold";
    const hasSale = variant && variant.salePrice !== null && variant.salePrice !== undefined && variant.salePrice < variant.price;
    return {
      value,
      variant,
      status,
      available: isBuyable(variant),
      price: variant ? payPrice(variant) : null,
      was: hasSale ? variant.price : null
    };
  });
  const prices = new Set(values.filter((c) => c.price !== null && Number.isFinite(c.price)).map((c) => c.price));
  return { values, showPrice: prices.size > 1 };
};

// "Grey / 256 GB": the label of a choice, for the message to the seller when no variant carries one.
export const choiceLabel = (axes, choice) =>
  (axes ?? []).map((a) => a.values?.find((v) => v.id === choice?.[a.key])?.label).filter(Boolean).join(" / ");
