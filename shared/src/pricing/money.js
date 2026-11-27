// Money maths for pricing. Amounts are shillings with up to two decimals (cents): KES 210.99 is 210.99, never 211.
// Nothing here returns 0 or a negative price by accident; every rounding is "half up" to the cent and is tested.

/** Round to the cent, half up, free of binary noise (1.005 -> 1.01). */
export const cents = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** A stored amount to the cent, or null when it is not a usable price (missing, text, negative, NaN). */
export const wholeAmount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? cents(n) : null;
};

/** unit x percent, half up: percentOf(750, 15) = 112.5; percentOf(210.99, 10) = 21.10. Percent may be fractional. */
export const percentOf = (amount, percent) => cents((amount * percent) / 100);

/**
 * unit price x quantity to the cent, half up. Quantity may have up to three decimals (1.5 kg, 0.25 m): it is scaled to
 * thousandths first so 800 x 1.5 is exactly 1,200 and never 1,199.9999999.
 */
export const lineTotal = (unit, qty) => {
  const thousandths = Math.round(Number(qty) * 1000);
  if (!Number.isFinite(thousandths) || !Number.isFinite(Number(unit))) return 0;
  return Math.floor((Math.round(Number(unit) * 100) * thousandths + 500) / 1000) / 100;
};

/** Milliseconds from a Date, an ISO string or a number; the current time when none is given. */
export const toMs = (now) => {
  if (now === undefined || now === null) return Date.now();
  const ms = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  return Number.isFinite(ms) ? ms : Date.now();
};
