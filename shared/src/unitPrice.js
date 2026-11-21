// "KES 144 per kg" / "KES 4 per L" / "KES 250 per piece" under a price when the size is a weight, a volume or a pack of pieces (A21, C23).
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

const PIECE_SYSTEMS = ["pieces", "set", "pack", "box"];

/** The size read as a number of pieces: "Pack of 6", "12 pcs", "Set of 4", "x12". A bare number is never read as a count (it may be a shoe or storage size). -> count or null. */
export function pieceCountOf(size) {
  if (size === null || size === undefined || !/[a-z×]/i.test(String(size))) return null;
  const res = parse("count", size);
  if (!res.ok || !PIECE_SYSTEMS.includes(res.value.system ?? "pieces")) return null;
  return res.value.value > 1 ? res.value.value : null;
}

/** Price per kg, per L or per piece, rounded to a whole shilling (half up). -> { amount, unit, text } or null when the size is not a weight, volume or pack count or the price is not a positive number. */
export function unitPrice(price, size) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const m = measureOf(size);
  if (m) {
    if (m.amount <= 0) return null;
    const { base, unit } = SCALES[m.scale];
    const amount = Math.round((p * base) / m.amount);
    return { amount, unit, text: `${formatKes(amount)} per ${unit}` };
  }
  const pieces = pieceCountOf(size);
  if (!pieces) return null;
  const amount = Math.round(p / pieces);
  if (amount < 1) return null;
  return { amount, unit: "piece", text: `${formatKes(amount)} per piece` };
}
