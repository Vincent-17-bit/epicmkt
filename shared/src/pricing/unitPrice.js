import { toBase } from "../scales/index.js";
import { perUnitText } from "./measure.js";
import { wholeAmount } from "./money.js";

const PER = { weight: { base: 1000, unit: "kg" }, volume: { base: 1000, unit: "L" } };

export function unitPriceText(price, size) {
  const per = PER[size?.scale];
  const amount = wholeAmount(price);
  if (!per || amount === null || amount === 0) return null;
  const base = Number(toBase(size));
  if (!Number.isFinite(base) || base <= 0) return null;
  return perUnitText(Math.round((amount * per.base) / base), per.unit);
}
