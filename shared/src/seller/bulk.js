export const MAX_PERCENT = 500;
export const ROUNDING_RULE = "Prices are rounded to the nearest whole shilling, with .5 rounding up.";

export function parsePercent(value) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Enter a percentage above 0." };
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-9) return { ok: false, error: "Use at most 2 decimal places." };
  if (n > MAX_PERCENT) return { ok: false, error: `Use ${MAX_PERCENT}% or less.` };
  return { ok: true, value: n };
}

export function scaleKes(amount, percent, direction) {
  const basis = Math.round(percent * 100);
  const factor = direction === "lower" ? 10000 - basis : 10000 + basis;
  return Math.floor((amount * factor + 5000) / 10000);
}

export function previewPriceChange(items, percent, direction) {
  const rows = [];
  const skipped = [];
  for (const item of items) {
    if (item.hiddenByAdmin || item.removedByAdmin) {
      skipped.push({ id: item.id, name: item.name, reason: "Locked by admin" });
      continue;
    }
    if (item.priceType === "free" || item.priceType === "contact" || item.price === null) {
      skipped.push({ id: item.id, name: item.name, reason: "No price to change" });
      continue;
    }
    const after = {
      price: scaleKes(item.price, percent, direction),
      priceMax: item.priceMax === null ? null : scaleKes(item.priceMax, percent, direction),
      salePrice: item.salePrice === null ? null : scaleKes(item.salePrice, percent, direction)
    };
    if (after.price < 1) {
      skipped.push({ id: item.id, name: item.name, reason: "Price would drop below KSh 1" });
      continue;
    }
    if (after.priceMax !== null && after.priceMax <= after.price) {
      skipped.push({ id: item.id, name: item.name, reason: "Price range would collapse" });
      continue;
    }
    if (after.salePrice !== null && after.salePrice >= after.price) {
      skipped.push({ id: item.id, name: item.name, reason: "Sale price would reach the price" });
      continue;
    }
    rows.push({ id: item.id, name: item.name, before: { price: item.price, priceMax: item.priceMax, salePrice: item.salePrice }, after });
  }
  return { rows, skipped };
}

export const BULK_ACTIONS = ["hide", "show", "delete", "move_section", "set_availability", "price_percent", "confirm_prices"];

export function applyBulkLocal(items, action, ids, args = {}) {
  const set = new Set(ids);
  const now = args.now ?? new Date().toISOString();
  const touched = [];
  const next = items.map((item) => {
    if (!set.has(item.id)) return item;
    if (item.hiddenByAdmin || item.removedByAdmin) return item;
    touched.push(item.id);
    switch (action) {
      case "hide":
        return { ...item, visible: false, updatedAt: now };
      case "show":
        return { ...item, visible: true, draft: false, updatedAt: now };
      case "move_section":
        return { ...item, section: args.section ?? "", updatedAt: now };
      case "set_availability":
        return { ...item, availability: args.availability, updatedAt: now };
      case "confirm_prices":
        return { ...item, priceConfirmedAt: now };
      default:
        return item;
    }
  });
  return { items: next, touched };
}
