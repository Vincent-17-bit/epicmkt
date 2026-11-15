// Quantity-tier prices in the editor: "from quantity, unit price" rows and a mode. The rows hold what the seller typed (text); the stored
// shape is [{ minQty, maxQty, unitPrice }] with each maxQty one below the next row's start and null on the last row, which is what
// validateTiers (shared, the same check the database makes) accepts.
import { TIER_LIMITS, priceTiered, validateTiers } from "@epicmkt/shared";

export const TIER_TYPES_NOTE = "Quantity prices need the price type “Starting from”.";
export const blankTiers = () => ({ mode: "whole", rows: [{ from: "1", price: "" }, { from: "", price: "" }] });

const whole = (text) => (/^\d{1,9}$/.test(String(text ?? "").trim()) ? Number(String(text).trim()) : null);

/** Stored tiers -> editor state. */
export const tiersFromServer = (read) => {
  const list = Array.isArray(read?.tiers) ? read.tiers : [];
  if (list.length === 0) return null;
  return { mode: read.mode === "graduated" ? "graduated" : "whole", rows: list.map((t) => ({ from: String(t.minQty), price: String(t.unitPrice) })) };
};

/** Editor rows -> stored tiers, or null while a row is incomplete or not a whole number. */
export function tiersOf(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const from = whole(list[i].from);
    const price = whole(list[i].price);
    if (from === null || price === null) return null;
    const next = i + 1 < list.length ? whole(list[i + 1].from) : null;
    if (i + 1 < list.length && next === null) return null;
    out.push({ minQty: from, maxQty: i + 1 < list.length ? next - 1 : null, unitPrice: price });
  }
  return out;
}

/** What is wrong, per row ({ from?, price? }) and as a list for a summary. Empty when the tiers can be saved. */
export function tierIssues(state) {
  const rows = Array.isArray(state?.rows) ? state.rows : [];
  const perRow = rows.map(() => ({}));
  const list = [];
  const add = (i, key, text) => { if (!perRow[i][key]) perRow[i][key] = text; list.push(text); };
  if (rows.length < 2) list.push("Add at least two quantity prices, or turn quantity prices off.");
  if (rows.length > TIER_LIMITS.tiers) list.push(`Use at most ${TIER_LIMITS.tiers} quantity prices.`);
  let previous = 0;
  rows.forEach((r, i) => {
    const from = whole(r.from);
    const price = whole(r.price);
    if (from === null) add(i, "from", i === 0 ? "Start at 1." : "Enter a whole number.");
    else if (i === 0 && from !== 1) add(i, "from", "The first quantity must be 1.");
    else if (from > TIER_LIMITS.qty) add(i, "from", `At most ${TIER_LIMITS.qty.toLocaleString("en-KE")}.`);
    else if (i > 0 && from <= previous) add(i, "from", `Must be more than ${previous}.`);
    if (from !== null) previous = Math.max(previous, from);
    if (price === null || price < 1) add(i, "price", "Enter a price of KES 1 or more, without cents.");
    else if (price > TIER_LIMITS.price) add(i, "price", "That price is too high.");
    else if (i > 0 && whole(rows[i - 1].price) !== null && price > whole(rows[i - 1].price)) add(i, "price", "A bigger quantity should not cost more each.");
  });
  if (list.length === 0) {
    const tiers = tiersOf(rows);
    const check = tiers ? validateTiers(tiers, state.mode) : { ok: false, errors: ["Check the quantity prices."] };
    if (!check.ok) list.push(check.errors[0]);
  }
  return { rows: perRow, list: [...new Set(list)] };
}

/** "50 pages = KES 350 (whole) or KES 380 (graduated)": the same quantity both ways, so the seller sees what the mode does. */
export function tierPreview(state, qty = 50, unit = "item") {
  if (tierIssues(state).list.length > 0) return null;
  const tiers = tiersOf(state.rows);
  const w = priceTiered({ tiers, mode: "whole", qty }).total;
  const g = priceTiered({ tiers, mode: "graduated", qty }).total;
  const plural = qty === 1 || /s$/i.test(unit) ? unit : `${unit}s`;
  return { qty, whole: w, graduated: g, text: `${qty} ${plural} = KES ${w.toLocaleString("en-KE")} (whole) or KES ${g.toLocaleString("en-KE")} (graduated)` };
}

/**
 * What a save sends: nothing for an item that never had tiers; the tiers and the mode when they are on and the type allows them; null to
 * clear them when they were turned off (or the price type moved away from "from"). Absent keys leave what is stored alone.
 */
export function tiersPayload(state, { priceType, had }) {
  if (state === undefined) return had && priceType !== "from" ? { priceTiers: null } : undefined;   // never touched: leave what is stored, unless the type no longer allows it
  const on = state && priceType === "from" && tiersOf(state.rows);
  if (on) return { priceTiers: on, priceTierMode: state.mode === "graduated" ? "graduated" : "whole" };
  return had ? { priceTiers: null } : undefined;
}
