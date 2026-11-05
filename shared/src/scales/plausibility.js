// plausible(typeId, axisKey, value) -> { ok, warn? }
//   ok: false  the value cannot be right for this axis (wrong scale, or outside the hard limits)
//   ok: true + warn  allowed, but unusual: show the seller a "check this" hint
// Limits are in each scale's toBase() unit (GB, cm, ml, g). Keyed "<product type id>.<axis key>".
import { getScale, isStored, toBase } from "./registry.js";

// TODO(contract:A01): keyed by the 13 Wave 0 product type ids and axis keys. When A01 gives types AxisDef.scale, derive the scale from the axis and keep only the limits here.
export const PLAUSIBILITY_RULES = {
  "phone.storage": { scale: "storage", typical: [16, 2048], hard: [1, 8192] },
  "memory-card.capacity": { scale: "storage", typical: [1, 2048], hard: [0.0625, 8192] },
  "shoes-eu.size": { scale: "shoe", typical: [22, 30.7], hard: [10, 33] },
  "bread.weight": { scale: "weight", typical: [200, 2500], hard: [20, 25000] },
  "drinking-water.size": { scale: "volume", typical: [300, 20000], hard: [50, 100000] },
  "fragrance.volume": { scale: "volume", typical: [5, 500], hard: [1, 5000] }
};

export const plausible = (typeId, axisKey, value) => {
  if (!isStored(value) || !getScale(value.scale)) return { ok: false, warn: "Not a stored scale value" };
  const scale = getScale(value.scale);
  const own = scale.plausibleFor ? scale.plausibleFor(typeId, axisKey, value) : scale.plausible ? scale.plausible(value) : { ok: true };
  if (!own.ok) return own;
  const rule = PLAUSIBILITY_RULES[`${typeId}.${axisKey}`];
  if (!rule) return own;
  if (rule.scale !== value.scale) return { ok: false, warn: `${axisKey} expects a ${rule.scale} value, not ${value.scale}` };
  const base = toBase(value);
  if (typeof base !== "number") return own;
  const shown = scale.format(value);
  if (base < rule.hard[0] || base > rule.hard[1]) return { ok: false, warn: `${shown} is not a realistic ${axisKey} for this product` };
  if (base < rule.typical[0] || base > rule.typical[1]) return { ok: true, warn: own.warn ?? `${shown} is unusual for this product, check it` };
  return own;
};
