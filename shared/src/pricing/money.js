// Money maths for pricing. Amounts are integers in the unit the item's prices are stored in (whole shillings today).
// Nothing here returns a fraction, 0 or a negative price by accident; every rounding is "half up" and is tested.

/** A stored amount as an integer, or null when it is not a usable price (missing, text, negative, NaN). */
export const wholeAmount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** unit x percent, half up: roundedShare(750, 15) = 112.5 -> 113. Percent may be fractional. */
export const percentOf = (amount, percent) => Math.round((amount * percent) / 100);

/**
 * unit price x quantity as an integer, half up. Quantity may have up to three decimals (1.5 kg, 0.25 m): it is scaled to
 * thousandths first so 800 x 1.5 is exactly 1,200 and never 1,199.9999999.
 */
export const lineTotal = (unit, qty) => {
  const thousandths = Math.round(Number(qty) * 1000);
  if (!Number.isFinite(thousandths) || !Number.isFinite(Number(unit))) return 0;
  return Math.floor((Math.round(unit) * thousandths + 500) / 1000);
};

/** Milliseconds from a Date, an ISO string or a number; the current time when none is given. */
export const toMs = (now) => {
  if (now === undefined || now === null) return Date.now();
  const ms = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  return Number.isFinite(ms) ? ms : Date.now();
};
