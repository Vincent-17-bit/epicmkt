import { checkPriceTiers } from "../contracts/validators.js";

export const TIER_MODES = ["whole", "graduated"];
export const TIER_LIMITS = { tiers: 10, qty: 1_000_000, price: 9_999_999_999 };

const TIER_KEYS = ["minQty", "maxQty", "unitPrice"];

export const kesText = (amount) => `KES ${amount}`;

const isWhole = (n) => typeof n === "number" && Number.isInteger(n);

export function validateTiers(tiers, mode = "whole") {
  const errors = [];
  if (!TIER_MODES.includes(mode)) errors.push(`mode: must be one of ${TIER_MODES.join(", ")}`);
  if (!Array.isArray(tiers)) return { ok: false, errors: [...errors, ...checkPriceTiers(tiers)] };
  if (tiers.length > TIER_LIMITS.tiers) errors.push(`priceTiers: at most ${TIER_LIMITS.tiers} tiers`);
  tiers.forEach((t, i) => {
    if (t === null || typeof t !== "object" || Array.isArray(t)) return;
    for (const k of Object.keys(t)) if (!TIER_KEYS.includes(k)) errors.push(`priceTiers.${i}.${k}: not a tier field`);
    if (!("maxQty" in t)) errors.push(`priceTiers.${i}.maxQty: required (null on the last tier)`);
    if (isWhole(t.minQty) && t.minQty > TIER_LIMITS.qty) errors.push(`priceTiers.${i}.minQty: at most ${TIER_LIMITS.qty}`);
    if (isWhole(t.maxQty) && t.maxQty > TIER_LIMITS.qty) errors.push(`priceTiers.${i}.maxQty: at most ${TIER_LIMITS.qty}`);
    if (typeof t.unitPrice === "number" && (!Number.isInteger(t.unitPrice) || t.unitPrice < 1 || t.unitPrice > TIER_LIMITS.price)) {
      errors.push(`priceTiers.${i}.unitPrice: a whole amount of 1 or more`);
    }
  });
  errors.push(...checkPriceTiers(tiers));
  const unique = [...new Set(errors)];
  return unique.length ? { ok: false, errors: unique } : { ok: true, errors: [] };
}

export const tierIndex = (tiers, qty) => {
  const i = tiers.findIndex((t) => qty >= t.minQty && (t.maxQty === null || t.maxQty === undefined || qty <= t.maxQty));
  return i < 0 ? tiers.length - 1 : i;
};

export function nextTierHint(tiers, qty, adjust = (n) => n) {
  const next = tiers[tierIndex(tiers, qty) + 1];
  if (!next) return null;
  const more = Math.ceil(next.minQty - qty);
  const unit = adjust(next.unitPrice);
  return { from: next.minQty, more, unit, text: `Add ${more} more for ${kesText(unit)} each` };
}

export function priceTiered({ tiers, mode = "whole", qty, adjust = (n) => n }) {
  const check = validateTiers(tiers, mode);
  if (!check.ok) throw new RangeError(check.errors[0]);
  if (!isWhole(qty) || qty < 1) throw new RangeError("qty must be a whole number of 1 or more");
  const last = tierIndex(tiers, qty);
  const bands = [];
  if (mode === "whole") {
    const unit = adjust(tiers[last].unitPrice);
    bands.push({ from: tiers[last].minQty, qty, unit, subtotal: unit * qty });
  } else {
    for (let i = 0; i <= last; i += 1) {
      const t = tiers[i];
      const upTo = t.maxQty === null ? qty : Math.min(qty, t.maxQty);
      const count = upTo - t.minQty + 1;
      const unit = adjust(t.unitPrice);
      bands.push({ from: t.minQty, qty: count, unit, subtotal: unit * count });
    }
  }
  const total = bands.reduce((sum, b) => sum + b.subtotal, 0);
  return {
    unit: mode === "whole" ? bands[0].unit : Math.round(total / qty),
    marginal: bands[bands.length - 1].unit,
    total,
    bands,
    tier: last,
    next: nextTierHint(tiers, qty, adjust)
  };
}
