// Quantity by quantityMode: "units" (whole, at least 1), "measure" (a step per type, like 0.25 kg) and "none" (the price is not per quantity).
//
// Rules, all tested in quantity.test.js:
//   - A typed amount is rounded to the NEAREST step, halves up (1.6 kg at a 0.25 step -> 1.5; 1.625 -> 1.75; 2.5 units -> 3).
//   - Then it is held between the minimum (one step unless the type says more) and the maximum (the stock, in whole steps).
//   - The result is never 0 or negative, whatever is typed: empty, text, NaN, 0, a negative number all give the minimum.
//   - If the stock is below the minimum nothing can be bought: normalizeQuantity still returns the minimum (so a cart never holds 0)
//     and checkQuantity says why.
//   - Maths is done in thousandths, so 0.1 + 0.2 style float errors cannot leak into a quantity or a price.
// Legacy items have no quantityMode: they are whole-unit items and behave exactly as before.

export const QUANTITY_MODES = ["units", "measure", "none"];
export const DEFAULT_MEASURE_STEP = 0.25;

const K = 1000;
const thousandths = (n) => Math.round(n * K);

/** The mode of an item: its quantityMode, else "measure" when it carries a quantity { min, step, unit }, else whole units. */
export const quantityModeOf = (item) => (QUANTITY_MODES.includes(item?.quantityMode) ? item.quantityMode : item?.quantity && typeof item.quantity === "object" ? "measure" : "units");

/** A number from a number or a plain numeric text ("1.5", " 2 "). Anything else (empty, "1,5", "abc", Infinity) is null. */
export function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\s*-?\d+(\.\d+)?\s*$/.test(value)) return null;
  return Number(value);
}

/**
 * The limits for a mode, in thousandths internally and plain numbers out: { mode, min, step, max, unit }.
 * `quantity` is the item's { min, step, unit }; `stock` is how much is left (null or missing = no limit).
 * "none": exactly 1. `max` is null when there is no limit.
 */
export function quantityRules(mode, { quantity = null, stock = null } = {}) {
  if (mode === "none") return { mode, min: 1, step: 1, max: 1, unit: null };
  const left = parseAmount(stock);
  if (mode === "measure") {
    const step = Number(quantity?.step) > 0 ? Number(quantity.step) : DEFAULT_MEASURE_STEP;
    const min = Number(quantity?.min) > 0 ? Number(quantity.min) : step;
    const stepK = thousandths(step);
    const max = left === null ? null : (Math.floor(Math.max(0, thousandths(left)) / stepK) * stepK) / K;
    return { mode, min, step, max, unit: quantity?.unit ?? null };
  }
  return { mode: "units", min: 1, step: 1, max: left === null ? null : Math.floor(Math.max(0, left)), unit: null };
}

/** { value, changed, reason } where reason is null or "not_a_number" | "below_min" | "above_max" | "sold_out" (stock under the minimum). */
export function checkQuantity(mode, value, opts = {}) {
  const rules = quantityRules(mode, opts);
  const typed = parseAmount(value);
  if (rules.mode === "none") return { value: 1, changed: typed !== 1, reason: null, rules };
  if (typed === null) return { value: rules.min, changed: true, reason: "not_a_number", rules };
  const stepK = thousandths(rules.step);
  const rounded = (Math.floor((thousandths(typed) + stepK / 2) / stepK) * stepK) / K;
  let out = rounded;
  let reason = null;
  if (out < rules.min) {
    out = rules.min;
    reason = "below_min";
  }
  if (rules.max !== null && out > rules.max) {
    if (rules.max < rules.min) return { value: rules.min, changed: rules.min !== typed, reason: "sold_out", rules };
    out = rules.max;
    reason = "above_max";
  }
  return { value: out, changed: out !== typed, reason, rules };
}

/** The quantity to use: nearest step, held between minimum and maximum, never 0 or negative. */
export const normalizeQuantity = (mode, value, opts = {}) => checkQuantity(mode, value, opts).value;
