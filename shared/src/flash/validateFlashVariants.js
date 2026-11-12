import { flashPrice } from "../seller/flash.js";
import { comboKey } from "../seller/options.js";

export const FLASH_TARGETS = ["all", "chosen"];
export const FLASH_OVERRIDE_LIMIT = 200;

const TYPES = ["percent", "amount_off", "sale_price"];
const KEYS = ["combo", "type", "value"];
const LEGACY_KEYS = ["variantId", "salePrice"];
const MAX = 9_999_999_999.99;

const cents = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function overridesShapeValid(list) {
  if (!Array.isArray(list) || list.length > FLASH_OVERRIDE_LIMIT) return false;
  const seen = new Set();
  for (const e of list) {
    if (!isRecord(e)) return false;
    const keys = Object.keys(e);
    if ("variantId" in e) {
      if (!keys.every((k) => LEGACY_KEYS.includes(k))) return false;
      continue;
    }
    if (!keys.every((k) => KEYS.includes(k))) return false;
    if (typeof e.combo !== "string" || typeof e.type !== "string" || typeof e.value !== "number" || !Number.isFinite(e.value)) return false;
    if (e.combo.length < 3 || e.combo.length > 400 || !TYPES.includes(e.type)) return false;
    if (e.value <= 0 || e.value > MAX || !cents(e.value)) return false;
    if (e.type === "percent" && (e.value < 1 || e.value > 99)) return false;
    if (seen.has(e.combo)) return false;
    seen.add(e.combo);
  }
  return true;
}

export function flashComboPrice(flash, combo, regular) {
  if (!Number.isFinite(regular)) return null;
  const own = (flash.variantOverrides ?? []).find((o) => o.combo === combo);
  const type = own ? own.type : flash.variantTarget === "chosen" ? null : flash.discountType;
  if (!type) return null;
  const price = flashPrice(type, own ? own.value : flash.discountValue, regular);
  return price <= 0 || price >= regular ? null : price;
}

export function validateFlashVariants(flash, item) {
  const target = flash?.variantTarget ?? "all";
  const overrides = flash?.variantOverrides ?? [];
  const fail = (code, combo) => ({ ok: false, errors: [{ code, ...(combo ? { combo } : {}) }], targets: [] });
  if (!FLASH_TARGETS.includes(target) || !overridesShapeValid(overrides)) return fail("invalid_flash_overrides");

  const stored = (item?.optionVariants ?? item?.variants ?? []).map((v) => ({ combo: v.combo ?? v.key ?? comboKey(item.options ?? item.axes ?? [], v.choice), price: v.price ?? null, status: v.status ?? "available" }));
  const sold = stored.filter((v) => v.combo && v.status !== "unavailable" && v.price !== null);
  const chosen = overrides.filter((o) => "combo" in o);
  if (target === "chosen" && (!stored.length || !chosen.length)) return fail("flash_needs_combinations");

  const errors = [];
  for (const o of chosen) {
    const v = sold.find((s) => s.combo === o.combo);
    if (!v) { errors.push({ code: "invalid_flash_target", combo: o.combo }); break; }
    const price = flashPrice(o.type, o.value, v.price);
    if (price <= 0) { errors.push({ code: "discount_too_large", combo: o.combo }); break; }
    if (price >= v.price) { errors.push({ code: "sale_price_not_lower", combo: o.combo }); break; }
  }
  if (errors.length) return { ok: false, errors, targets: [] };

  const targets = sold.flatMap((v) => {
    const salePrice = flashComboPrice({ ...flash, variantTarget: target, variantOverrides: chosen }, v.combo, v.price);
    return salePrice === null ? [] : [{ combo: v.combo, regularPrice: v.price, salePrice }];
  });
  return { ok: true, errors: [], targets };
}
