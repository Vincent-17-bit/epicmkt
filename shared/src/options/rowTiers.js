// Quantity prices of ONE combination ("the 128 GB model: 1 for 50, 5 or more for 45"). The form keeps text rows [{ from, price }]; what is
// saved is [{ minQty, maxQty, unitPrice }] (the same shape as the item's own tiers). A combination with none uses the item's quantity prices.
// Pure code, no browser or Node APIs.
import { validateTiers } from "../pricing/tiers.js";

const whole = (text) => (/^\d{1,9}$/.test(String(text ?? "").trim()) ? Number(String(text).trim()) : null);

/** Text rows -> stored tiers, or null while a row is incomplete or not a whole number. */
export function rowTiersToStored(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const from = whole(list[i]?.from);
    const price = whole(list[i]?.price);
    if (from === null || price === null) return null;
    const next = i + 1 < list.length ? whole(list[i + 1]?.from) : null;
    if (i + 1 < list.length && next === null) return null;
    out.push({ minQty: from, maxQty: i + 1 < list.length ? next - 1 : null, unitPrice: price });
  }
  return out;
}

/** Stored tiers -> text rows. */
export const rowTiersFromStored = (tiers) => (Array.isArray(tiers) ? tiers.map((t) => ({ from: String(t.minQty), price: String(t.unitPrice) })) : []);

/** The first thing wrong with a combination's quantity prices, or "" when they can be saved (or there are none). */
export function rowTiersProblem(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  if (rows.length < 2) return "Add at least two quantity prices for this combination, or use the item's.";
  const stored = rowTiersToStored(rows);
  if (!stored) return "Fill in every quantity price with whole numbers, or remove them.";
  const check = validateTiers(stored, "whole");
  return check.ok ? "" : String(check.errors?.[0] ?? "Check the quantity prices.");
}
