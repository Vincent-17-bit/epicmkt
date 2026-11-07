import { checkPriceTiers } from "../contracts/validators.js";

export const TIER_MODES = ["whole", "graduated"];
export const TIER_LIMITS = { tiers: 10, qty: 1_000_000, price: 9_999_999_999.99 };

const TIER_KEYS = ["minQty", "maxQty", "unitPrice"];

export const toMinor = (kes) => Math.round(kes * 100);

export const kesText = (minor) => `KES ${minor % 100 === 0 ? minor / 100 : (minor / 100).toFixed(2)}`;

const isWhole = (n) => typeof n === "number" && Number.isInteger(n);

const cents = (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

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
    if (typeof t.unitPrice === "number" && (t.unitPrice <= 0 || t.unitPrice > TIER_LIMITS.price || !cents(t.unitPrice))) {
      errors.push(`priceTiers.${i}.unitPrice: above 0, at most 2 decimals`);
    }
  });
  errors.push(...checkPriceTiers(tiers));
  const unique = [...new Set(errors)];
  return unique.length ? { ok: false, errors: unique } : { ok: true, errors: [] };
}

const bandFor = (tiers, qty) => {
  const i = tiers.findIndex((t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty));
  return i < 0 ? tiers.length - 1 : i;
};

export function nextTierHint(tiers, qty, adjust = (m) => m) {
  const next = tiers[bandFor(tiers, qty) + 1];
  if (!next) return null;
  const more = next.minQty - qty;
  const unit = adjust(toMinor(next.unitPrice));
  return { from: next.minQty, more, unit, text: `Add ${more} more for ${kesText(unit)} each` };
}

export function priceTiered({ tiers, mode = "whole", qty, adjust = (m) => m }) {
  const check = validateTiers(tiers, mode);
  if (!check.ok) throw new RangeError(check.errors[0]);
  if (!isWhole(qty) || qty < 1) throw new RangeError("qty must be a whole number of 1 or more");
  const last = bandFor(tiers, qty);
  const bands = [];
  if (mode === "whole") {
    const unit = adjust(toMinor(tiers[last].unitPrice));
    bands.push({ from: tiers[last].minQty, qty, unit, subtotal: unit * qty });
  } else {
    for (let i = 0; i <= last; i += 1) {
      const t = tiers[i];
      const upTo = t.maxQty === null ? qty : Math.min(qty, t.maxQty);
      const count = upTo - t.minQty + 1;
      const unit = adjust(toMinor(t.unitPrice));
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

const flashAdjust = (flash) => (minor) => {
  const v = Number(flash.discountValue);
  if (flash.discountType === "percent") return Math.round((minor * (100 - v)) / 100);
  if (flash.discountType === "amount_off") return Math.max(0, minor - toMinor(v));
  return Math.min(minor, toMinor(v));
};

const flashLive = (flash, nowMs) => {
  if (!flash || !["percent", "amount_off", "sale_price"].includes(flash.discountType)) return false;
  const start = flash.startsAt ? Date.parse(flash.startsAt) : -Infinity;
  const end = flash.endsAt ? Date.parse(flash.endsAt) : Infinity;
  return nowMs >= start && nowMs < end;
};

const sameChoice = (a, b) => {
  const ka = Object.keys(a ?? {});
  return ka.length === Object.keys(b ?? {}).length && ka.every((k) => a[k] === b[k]);
};

const findVariant = (item, selection) => {
  const list = item.optionVariants ?? item.variants ?? [];
  if (!selection) return null;
  if (selection.variantId) return list.find((v) => v.id === selection.variantId) ?? null;
  if (selection.choice) return list.find((v) => sameChoice(v.choice, selection.choice)) ?? null;
  return null;
};

export function priceFor(item, selection, qty, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const variant = findVariant(item, selection);
  const tiers = variant?.priceTiers ?? item.priceTiers ?? null;
  const mode = variant?.priceTierMode ?? item.priceTierMode ?? "whole";
  // TODO(contract:flash-variants): the per-variant flash data of the public payload; today only a flash on the item itself is read
  const flash = variant?.flash ?? item.flash ?? null;
  const live = flashLive(flash, nowMs);
  const adjust = live ? flashAdjust(flash) : (m) => m;

  if (tiers) {
    const regular = priceTiered({ tiers, mode, qty });
    const priced = live ? priceTiered({ tiers, mode, qty, adjust }) : regular;
    return {
      unit: priced.unit,
      total: priced.total,
      was: regular.total,
      source: live && priced.total < regular.total ? "flash" : "tier",
      bands: priced.bands,
      next: priced.next
    };
  }

  if (!isWhole(qty) || qty < 1) throw new RangeError("qty must be a whole number of 1 or more");
  const base = variant?.price ?? item.regularPrice;
  if (typeof base !== "number" || !Number.isFinite(base)) throw new RangeError("item has no price");
  const sale = variant?.salePrice ?? item.salePrice ?? null;
  const regularUnit = toMinor(base);
  const saleUnit = typeof sale === "number" && sale < base ? toMinor(sale) : regularUnit;
  const flashUnit = live ? adjust(regularUnit) : regularUnit;
  const unit = Math.min(saleUnit, flashUnit);
  const source = live && flashUnit < saleUnit ? "flash" : saleUnit < regularUnit ? "sale" : "regular";
  return { unit, total: unit * qty, was: regularUnit * qty, source, bands: [{ from: 1, qty, unit, subtotal: unit * qty }], next: null };
}
