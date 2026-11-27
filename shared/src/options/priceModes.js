// Prompt 4.6: "What changes the price?". Pure rules, no React.
// Prices are always stored per combination (one absolute price per row). These helpers only decide which options the seller
// types prices for, and write the typed price to every combination it covers. A warning is advice and never blocks a save.

import { byUnit, isMoney, liveRows, rowKeyOf, setSold } from "./editor.js";

const clean = (v) => String(v ?? "").replace(/,/g, "").trim();
const amount = (v) => (isMoney(v) ? Number(clean(v)) : null);
const priceText = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const sellable = (options) => liveRows(options).filter((r) => r.sold);

// Which options actually change the price today: an option counts when two combinations that differ ONLY in that option
// have different prices. Rows with no price are ignored. Returns option keys in axis order ([] = one price for everything).
export const inferPriceAxes = (options) => {
  const rows = sellable(options).filter((r) => amount(r.price) !== null);
  const out = [];
  for (const axis of options.axes) {
    const seen = new Map();
    let varies = false;
    for (const r of rows) {
      const rest = options.axes.filter((a) => a.key !== axis.key).map((a) => r.choice[a.key]).join("|");
      const n = amount(r.price);
      if (seen.has(rest) && seen.get(rest) !== n) varies = true;
      if (!seen.has(rest)) seen.set(rest, n);
    }
    if (varies) out.push(axis.key);
  }
  return out;
};

// How to show the prices: one option -> a list, two -> a grid (or base + difference), three or more -> the full table,
// none -> a single price.
export const priceLayout = (priceAxes = []) => (priceAxes.length === 0 ? "single" : priceAxes.length === 1 ? "list" : priceAxes.length === 2 ? "grid" : "table");

const onlyKnown = (options, keys) => options.axes.map((a) => a.key).filter((k) => keys.includes(k));
const group = (options, keys, r) => keys.map((k) => r.choice[k]).join("|");

// The price shown for a group of combinations (those sharing the same value on every price option): the first one on sale
// that has a price, else "". Used to fill a list row or a grid cell.
export const groupPrice = (options, priceAxes, choice) => {
  const keys = onlyKnown(options, priceAxes);
  const want = keys.map((k) => choice[k]).join("|");
  const hit = sellable(options).find((r) => group(options, keys, r) === want && clean(r.price) !== "");
  return hit ? hit.price : "";
};

// Type one price for a list row or a grid cell: every sellable combination with that value on the price options gets it.
// Not sold combinations keep what they had. Typed text is stored as typed (it is checked on save), so a half-typed "2," survives.
export const setGroupPrice = (options, priceAxes, choice, value) => {
  const keys = onlyKnown(options, priceAxes);
  const want = keys.map((k) => choice[k]).join("|");
  const text = String(value ?? "");
  return { ...options, rows: options.rows.map((r) => (rowKeyOf(options, r.choice) !== null && r.sold && group(options, keys, r) === want ? { ...r, price: text } : r)) };
};

// The unit typed for a list row or a grid cell ("per jar of 48"): the first sellable combination in the group that has one. Same
// grouping as the price, so a seller who prices by Size also units by Size.
export const groupUnit = (options, priceAxes, choice) => {
  const keys = onlyKnown(options, priceAxes);
  const want = keys.map((k) => choice[k]).join("|");
  const hit = sellable(options).find((r) => group(options, keys, r) === want && clean(r.unit) !== "");
  return hit ? String(hit.unit).trim() : "";
};

// Type one unit for a list row or a grid cell: every sellable combination in the group gets it (blank clears it).
export const setGroupUnit = (options, priceAxes, choice, value) => {
  const keys = onlyKnown(options, priceAxes);
  const want = keys.map((k) => choice[k]).join("|");
  const text = String(value ?? "");
  return { ...options, rows: options.rows.map((r) => (rowKeyOf(options, r.choice) !== null && r.sold && group(options, keys, r) === want ? { ...r, unit: text } : r)) };
};

// "Size sets the unit": { "3-cubes": "per 3 cubes", "whole-jar": "per jar of 48" } sets the unit of every combination with that value.
export const setUnitsByAxis = (options, axisKey, units = {}) => ({
  ...options,
  rows: options.rows.map((r) => (rowKeyOf(options, r.choice) !== null && r.sold && typeof units[r.choice[axisKey]] === "string" ? { ...r, unit: units[r.choice[axisKey]] } : r)),
});

const inGroup = (options, keys, choice) => {
  const want = keys.map((k) => choice[k]).join("|");
  return liveRows(options).filter((r) => group(options, keys, r) === want);
};

export const groupSold = (options, priceAxes, choice) => {
  const rows = inGroup(options, onlyKnown(options, priceAxes), choice);
  return rows.length === 0 || rows.some((r) => r.sold);
};

export const setGroupSold = (options, priceAxes, choice, sold) =>
  inGroup(options, onlyKnown(options, priceAxes), choice).reduce((acc, r) => setSold(acc, rowKeyOf(acc, r.choice), sold), options);

// The seller ticks which options change the price. An option that is NOT ticked stops changing the price: every combination
// takes the price of the first one in its group (same value on the ticked options), so the saved prices match what is shown.
export const collapseToPriceAxes = (options, priceAxes) => {
  const keys = onlyKnown(options, priceAxes);
  const first = new Map();
  for (const r of sellable(options)) {
    const g = group(options, keys, r);
    if (!first.has(g) && clean(r.price) !== "") first.set(g, r.price);
  }
  return { ...options, rows: options.rows.map((r) => (rowKeyOf(options, r.choice) !== null && r.sold && first.has(group(options, keys, r)) ? { ...r, price: first.get(group(options, keys, r)) } : r)) };
};

// "Grey = Black - 1,000": every combination of `valueId` on `axisKey` takes the price of the matching combination with `fromId`,
// plus `delta` (negative to subtract). A result at or below zero, or a match with no price, is left alone.
export const setRelativePrice = (options, axisKey, valueId, fromId, delta) => {
  const d = Number(clean(delta));
  if (!Number.isFinite(d)) return options;
  const restOf = (r) => options.axes.filter((a) => a.key !== axisKey).map((a) => r.choice[a.key]).join("|");
  const source = new Map(sellable(options).filter((r) => r.choice[axisKey] === fromId && amount(r.price) !== null).map((r) => [restOf(r), amount(r.price)]));
  return { ...options, rows: options.rows.map((r) => {
    if (rowKeyOf(options, r.choice) === null || !r.sold || r.choice[axisKey] !== valueId) return r;
    const base = source.get(restOf(r));
    return base === undefined || base + d <= 0 ? r : { ...r, price: priceText(base + d) };
  }) };
};

// Plain-language problems with the prices. Never blocks. Each issue: { key, kind: "missing" | "inherited" | "far", text }.
//   missing:   a combination on sale has no price (and the item has no price of its own to fall back on)
//   inherited: some combinations have a price and this one has not, so buyers would pay the item price. Usually a forgotten cell
//              (a KES 10 sachet price quietly showing on the 48-piece jar), so it is pointed out instead of being silent.
//   far:       a price is five times or more away from the typical price (2,400 typed instead of 24,000), compared only with
//              combinations sold by the same unit
export const priceIssues = (options, { itemPrice = null, itemUnit = "", name = (r) => rowKeyOf(options, r.choice) } = {}) => {
  const rows = sellable(options);
  const issues = [];
  const fallback = amount(itemPrice) !== null && amount(itemPrice) > 0;
  const priced = rows.filter((r) => amount(r.price) !== null && amount(r.price) > 0);
  const mixed = priced.length > 0 && priced.length < rows.length;
  for (const r of rows) {
    if (clean(r.price) !== "") continue;
    if (!fallback) issues.push({ key: rowKeyOf(options, r.choice), kind: "missing", text: `${name(r)} has no price.` });
    else if (mixed) issues.push({ key: rowKeyOf(options, r.choice), kind: "inherited", text: `${name(r)} has no price of its own, so buyers pay the item price (KES ${Math.round(amount(itemPrice)).toLocaleString("en-KE")}). Type its price.` });
  }
  for (const set of byUnit(priced, itemUnit)) {
    if (set.length < 3) continue;
    const sorted = set.map((r) => amount(r.price)).sort((a, b) => a - b);
    const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const near = Math.round(mid).toLocaleString("en-KE");
    for (const r of set) {
      const n = amount(r.price);
      if (n * 5 <= mid) issues.push({ key: rowKeyOf(options, r.choice), kind: "far", text: `${name(r)} is far below the others (around ${near}). Check the number.` });
      else if (n >= mid * 5) issues.push({ key: rowKeyOf(options, r.choice), kind: "far", text: `${name(r)} is far above the others (around ${near}). Check the number.` });
    }
  }
  return issues;
};
