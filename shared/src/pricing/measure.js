// Measured quantity: the price is per unit of measure (KES 800 per kg), the buyer picks an amount (1.5 kg).
// Total = price per unit x amount, rounded half up to a whole shilling, with the amount held in thousandths (see lineTotal).
//   800 per kg x 1.5 kg = 1,200        750 per kg x 0.25 kg = 187.5 -> 188        450 per m x 2.75 m = 1,237.5 -> 1,238
import { formatKes } from "../utils.js";
import { checkQuantity, quantityModeOf } from "../quantity.js";
import { lineTotal, wholeAmount } from "./money.js";

/** The amount as text: up to three decimals, no trailing zeros: 1.5, 0.25, 2. */
export const formatAmount = (amount) => String(Number(Number(amount).toFixed(3)));

/** "1.5 kg" (the unit is optional). */
export const amountText = (amount, unit) => `${formatAmount(amount)}${unit ? ` ${unit}` : ""}`;

/** "KES 800 per kg". */
export const perUnitText = (unitPrice, unit) => `${formatKes(unitPrice)}${unit ? ` per ${unit}` : ""}`;

/** The price of an amount: integer, half up. */
export const measureTotal = (unitPrice, amount) => lineTotal(wholeAmount(unitPrice) ?? 0, amount);

/** The line the seller receives: "Beef, 1.5 kg, KES 1,200". */
export const measuredMessage = ({ name, amount, unit, total }) => `${name}, ${amountText(amount, unit)}, ${formatKes(total)}`;

/**
 * One order line for a measured item. `item` carries quantityMode or quantity { min, step, unit }; `unitPrice` is the price per unit of measure
 * (from priceFor(...).unit); `typed` is what the buyer entered; `stock` what is left.
 * -> { amount, unit, total, message, reason }. For a whole-unit item (legacy) the amount is a whole number and the unit is the item's own, if any.
 */
export function measuredLine(item, unitPrice, typed, { stock = null } = {}) {
  const mode = quantityModeOf(item);
  const checked = checkQuantity(mode, typed, { quantity: item?.quantity, stock });
  const unit = mode === "measure" ? (item?.quantity?.unit ?? item?.unit ?? null) : null;
  const total = measureTotal(unitPrice, checked.value);
  return { amount: checked.value, unit, total, message: measuredMessage({ name: item?.name ?? "", amount: checked.value, unit, total }), reason: checked.reason };
}
