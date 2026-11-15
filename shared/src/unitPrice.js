// "KES 144 per kg" / "KES 4 per L" under a price when the size is a weight or a volume (A21, C23).
import { parse, toBase } from "./scales/index.js";
import { formatKes } from "./utils.js";

const SCALES = { weight: { base: 1000, unit: "kg" }, volume: { base: 1000, unit: "L" } };

/** The size read as a weight or a volume: { scale, amount (in g or ml) } or null. A size that is neither (a shoe, "Large") gives null. */
export function measureOf(size) {
  if (size === null || size === undefined) return null;
  for (const scale of Object.keys(SCALES)) {
    const res = parse(scale, size);
    if (res.ok) return { scale, amount: toBase(res.value) };
  }
  return null;
}

/** Price per kg or per L, rounded to a whole shilling (half up). -> { amount, unit, text } or null when the size is not a weight or volume or the price is not a positive number. */
export function unitPrice(price, size) {
  const p = Number(price);
  const m = measureOf(size);
  if (!m || !Number.isFinite(p) || p <= 0 || m.amount <= 0) return null;
  const { base, unit } = SCALES[m.scale];
  const amount = Math.round((p * base) / m.amount);
  return { amount, unit, text: `${formatKes(amount)} per ${unit}` };
}
