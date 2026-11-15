// Unmet demand (Prompt A22 with the buyer button C21, the seller page B23 and the admin view C30): what a buyer wanted that the shop does
// not sell, said in plain words. The database keeps the counts; these helpers choose the closest matches and write the sentences, so the
// three screens and the CSV all say the same thing.

import { isBuyable } from "./options/defaultVariant.js";
import { variantForChoice } from "./options/dependent.js";

const UNITS = new Set(["gb", "tb", "mb", "kb", "ml", "l", "kg", "g", "mm", "cm", "m", "w", "v", "ah", "mah", "kw", "kva", "hz", "gsm", "ppm", "mp"]);

/** "samsung" -> "Samsung", "512 gb" -> "512 GB", "e27" -> "E27". Values come back lower case from the database. */
export const prettyValue = (text) =>
  String(text ?? "").trim().split(/\s+/).filter(Boolean)
    .map((w) => (UNITS.has(w.toLowerCase()) || /^[a-z]\d{1,3}$/i.test(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

/** { brand: "samsung", storage: "512 gb" } -> "Samsung, 512 GB" (in key order, so the same filters always read the same). */
export const filterLabel = (filters) =>
  Object.keys(filters && typeof filters === "object" ? filters : {}).sort().map((k) => prettyValue(filters[k])).filter(Boolean).join(", ");

const slugKey = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

/** The filters to log for a wanted choice: { axisKey: label as the buyer saw it }. Keys are made safe for the database. */
export function wantedFilters(axes, wanted) {
  const out = {};
  for (const a of Array.isArray(axes) ? axes : []) {
    const id = wanted?.[a.key];
    const value = a.values?.find((v) => v.id === id);
    const key = slugKey(a.key);
    if (value?.label && /^[a-z]/.test(key)) out[key] = String(value.label).slice(0, 40);
  }
  return out;
}

/**
 * The buyer picked a combination: is there something to buy? Returns null when there is. Otherwise why not
 * ("not_sold" | "out_of_stock" | "unavailable"), the filters to log, and up to `limit` combinations that are on sale and share the most
 * values with what they wanted (cheapest first among equals).
 */
export function noMatch(axes, variants, wanted, limit = 3) {
  const list = Array.isArray(axes) ? axes : [];
  if (list.length === 0 || !wanted) return null;
  const hit = variantForChoice(list, variants, wanted);
  if (hit && isBuyable(hit)) return null;
  const shared = (v) => list.filter((a) => v.choice?.[a.key] === wanted[a.key]).length;
  const closest = (variants ?? [])
    .filter((v) => isBuyable(v))
    .map((v) => ({ variant: v, shared: shared(v) }))
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || (a.variant.salePrice ?? a.variant.price ?? 0) - (b.variant.salePrice ?? b.variant.price ?? 0))
    .slice(0, limit)
    .map((r) => r.variant);
  return { reason: hit?.status && hit.status !== "available" ? hit.status : "not_sold", filters: wantedFilters(list, wanted), closest };
}

/** "12 shoppers looked for Samsung, 512 GB" */
export const demandLine = (count, filters) => `${count} ${count === 1 ? "shopper" : "shoppers"} looked for ${filterLabel(filters) || "something you do not list"}`;

/** What the seller could do about it: the value that is missing, in words. */
export function demandSuggestion(filters, itemName) {
  const values = Object.keys(filters ?? {}).sort().map((k) => prettyValue(filters[k])).filter(Boolean);
  if (values.length === 0) return null;
  return `Add ${values[values.length - 1]}${values.length > 1 ? ` (${values.slice(0, -1).join(", ")})` : ""} as an option${itemName ? ` to ${itemName}` : ""}.`;
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;   // a spreadsheet must not run a typed filter as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The admin export: one line per category, type and filter, with the shops behind it. */
export function demandCsv(rows, { period = 7, names = {} } = {}) {
  const head = ["category", "product type", "filters", "shoppers", "top shops", "period (days)"];
  const lines = [head.join(",")];
  for (const r of Array.isArray(rows) ? rows : []) {
    const shops = (r.shops ?? []).map((s) => `${s.name} (${s.count})`).join("; ");
    lines.push([names[r.categoryId] ?? r.categoryId, r.productTypeId ?? "", filterLabel(r.filters), r.count, shops, period].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
