// Flash sale per option, seller side (B15). The rules are validateFlashVariants (the same check the database makes); this file only reads
// the seller's option data into rows, builds what a sale sends, and works out the before and after prices for the table.
import { comboKey } from "./options.js";
import { flashPrice } from "./flash.js";
import { validateFlashVariants, FLASH_OVERRIDE_LIMIT } from "../flash/validateFlashVariants.js";

/** The option read of an item ({ axes, variants }) as rows: [{ combo, label, regular, sold }]. A combination is sold when it has its own price and is not unavailable. */
export function flashOptionRows(options) {
  const axes = Array.isArray(options?.axes) ? options.axes : [];
  const label = (choice) => axes.map((a) => a.values?.find((v) => v.id === choice?.[a.key])?.label).filter(Boolean).join(" / ");
  return (Array.isArray(options?.variants) ? options.variants : []).flatMap((v) => {
    const combo = comboKey(axes, v.choice);
    if (!combo) return [];
    const regular = Number.isFinite(Number(v.price)) && v.price !== null ? Number(v.price) : null;
    return [{ combo, label: label(v.choice) || combo, regular, sold: regular !== null && v.status !== "unavailable" }];
  });
}

/**
 * What a sale sends for its options: { variantTarget, variantOverrides }. `chosen` maps a combination to { type, value } (text or number).
 * "all" sends no overrides. Nothing is sent for an item without options (the caller leaves the sale as a single-price sale).
 */
export function flashVariantFields(target, chosen = {}) {
  if (target !== "chosen") return { variantTarget: "all", variantOverrides: [] };
  const list = Object.entries(chosen).map(([combo, c]) => ({ combo, type: c.type, value: Number(c.value) }));
  return { variantTarget: "chosen", variantOverrides: list };
}

/**
 * The before and after price table for a sale on an item with options.
 * -> { ok, error, rows: [{ combo, label, regular, sale (null when this one is not on sale), percent }], lowest (the lowest sale price or null) }
 * `flash`: { discountType, discountValue, variantTarget, variantOverrides }. The error is the first code validateFlashVariants gives.
 */
export function flashOptionTable(options, flash) {
  const rows = flashOptionRows(options);
  const item = { options: options?.axes ?? [], optionVariants: (options?.variants ?? []).map((v) => ({ choice: v.choice, price: v.price ?? null, status: v.status ?? "available", combo: comboKey(options?.axes ?? [], v.choice) })) };
  const checked = validateFlashVariants({ discountType: flash.discountType, discountValue: Number(flash.discountValue), variantTarget: flash.variantTarget ?? "all", variantOverrides: flash.variantOverrides ?? [] }, item);
  const byCombo = new Map((checked.targets ?? []).map((t) => [t.combo, t.salePrice]));
  const table = rows.map((r) => {
    const sale = checked.ok && r.sold ? (byCombo.get(r.combo) ?? null) : null;
    return { ...r, sale, percent: sale !== null && r.regular ? Math.round((1 - sale / r.regular) * 100) : 0 };
  });
  const prices = table.map((r) => r.sale).filter((p) => p !== null);
  return { ok: checked.ok, error: checked.ok ? null : checked.errors[0]?.code ?? "invalid_flash_overrides", errorCombo: checked.ok ? null : checked.errors[0]?.combo ?? null, rows: table, lowest: prices.length ? Math.min(...prices) : null };
}

export { FLASH_OVERRIDE_LIMIT, flashPrice as flashOptionPrice };
