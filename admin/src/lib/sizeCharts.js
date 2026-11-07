// Model for the admin size chart and shoe conversion editor (A05, migration 0093). Pure: no React, no network.
// The form keeps text (what a person types); cleanDraft turns it into the fields admin_save_size_chart takes, using the same
// validator as the seller side (cleanSizeChart) so the page, the seller form and the database agree.
import { SIZE_CHART_LIMITS, SIZE_CHART_UNITS, cleanSizeChart, cleanShoeConversion, shoeTable } from "@epicmkt/shared";

export { SIZE_CHART_LIMITS, SIZE_CHART_UNITS };
export const UNIT_LABELS = { cm: "Centimetres (cm)", in: "Inches (in)", mm: "Millimetres (mm)", kg: "Kilograms (kg)", lb: "Pounds (lb)", none: "No unit" };

export const SIZE_ERRORS = {
  duplicate_chart: "A chart with that name already exists.",
  invalid_name: "Use 2 to 80 characters for the name.",
  invalid_unit: "Choose a unit from the list.",
  invalid_category: "That category is not valid.",
  invalid_chart: "The columns or rows are not valid. Every row needs one cell per column.",
  invalid_type_ids: "One of those product types does not exist.",
  invalid_shoe_chart: "The shoe chart is not valid. Check that every column rises from row to row.",
  size_chart_in_use: "Items or product types still use this chart. Move them to another chart first.",
  chart_not_found: "That chart no longer exists. Reload the list.",
  forbidden: "Only Owners can change size charts.",
};
export const sizeError = (error) => SIZE_ERRORS[error?.code] ?? SIZE_ERRORS[error?.message] ?? "Could not save. Try again.";

/** A new blank chart: a Size column, three measurement columns and three rows. */
export const blankChart = () => ({ id: null, name: "", category: "", unit: "cm", columns: ["Size", "Chest", "Waist", "Hip"], rows: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]], active: true, productTypeIds: [], itemsUsing: 0 });

/** A stored chart (admin_size_charts_list row) as an editable draft. */
export const toDraft = (row) => ({
  id: row.id ?? null, name: row.name ?? "", category: row.category ?? "", unit: row.unit ?? "cm",
  columns: [...(row.columns ?? [])], rows: (row.rows ?? []).map((r) => [...r]), active: row.active !== false,
  productTypeIds: [...(row.product_type_ids ?? row.productTypeIds ?? [])], itemsUsing: Number(row.items_using ?? row.itemsUsing ?? 0),
});

const TYPE_ID = /^[a-z0-9][a-z0-9_-]{0,59}$/;
/** "dress, shirt" -> ["dress", "shirt"]. Returns { ids, bad } where bad are the entries that are not a type id. */
export function parseTypeIds(text) {
  const parts = String(text ?? "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ids = [...new Set(parts.filter((p) => TYPE_ID.test(p)))];
  return { ids, bad: parts.filter((p) => !TYPE_ID.test(p)) };
}

/** Validates a draft. Returns { ok, errors: {field: text}, fields } where fields is what admin_save_size_chart takes. */
export function cleanDraft(draft) {
  const base = cleanSizeChart(draft);
  const errors = { ...base.errors };
  if (draft.productTypeIds.some((id) => !TYPE_ID.test(id))) errors.productTypeIds = "A product type id uses lowercase letters, numbers, - and _.";
  if (!base.ok || errors.productTypeIds) return { ok: false, errors, fields: null };
  return { ok: true, errors: {}, fields: { ...base.value, product_type_ids: [...draft.productTypeIds] } };
}

export const isDirty = (draft, saved) => JSON.stringify(draft) !== JSON.stringify(saved);

// Row and column edits. Each returns a new draft; limits come from SIZE_CHART_LIMITS.
export const addRow = (d) => (d.rows.length >= SIZE_CHART_LIMITS.rows ? d : { ...d, rows: [...d.rows, d.columns.map(() => "")] });
export const removeRow = (d, i) => ({ ...d, rows: d.rows.filter((_, r) => r !== i) });
export const addColumn = (d) => (d.columns.length >= SIZE_CHART_LIMITS.columns ? d : { ...d, columns: [...d.columns, `Column ${d.columns.length + 1}`], rows: d.rows.map((r) => [...r, ""]) });
export const removeColumn = (d, c) => (d.columns.length <= 1 ? d : { ...d, columns: d.columns.filter((_, i) => i !== c), rows: d.rows.map((r) => r.filter((_, i) => i !== c)) });
export const setCell = (d, r, c, value) => ({ ...d, rows: d.rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)) });
export const setColumn = (d, c, value) => ({ ...d, columns: d.columns.map((x, i) => (i === c ? value : x)) });

// ---- Shoe conversion ----
export const SHOE_COLUMNS = [
  { key: "eu", label: "EU", step: "1" }, { key: "uk", label: "UK", step: "0.5" }, { key: "usM", label: "US men", step: "0.5" },
  { key: "usW", label: "US women", step: "0.5" }, { key: "cm", label: "Foot (cm)", step: "0.1" },
];
export const SHOE_GROUPS = [{ id: "adult", label: "Adult" }, { id: "kids", label: "Kids" }];

/** The stored chart ({adult:[{eu,...}], kids}) as text rows, so a half-typed number is not lost. */
export const shoeToDraft = (chart) => ({
  adult: (chart?.adult ?? []).map((r) => Object.fromEntries(SHOE_COLUMNS.map((c) => [c.key, r[c.key] == null ? "" : String(r[c.key])]))),
  kids: (chart?.kids ?? []).map((r) => Object.fromEntries(SHOE_COLUMNS.map((c) => [c.key, r[c.key] == null ? "" : String(r[c.key])]))),
});
const toNumber = (s) => (String(s).trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
export const shoeFromDraft = (draft) => ({
  adult: draft.adult.map((r) => Object.fromEntries(SHOE_COLUMNS.map((c) => [c.key, toNumber(r[c.key])]))),
  kids: draft.kids.map((r) => Object.fromEntries(SHOE_COLUMNS.map((c) => [c.key, toNumber(r[c.key])]))),
});
export const cleanShoeDraft = (draft) => cleanShoeConversion(shoeFromDraft(draft));
export const addShoeRow = (draft, group) => ({ ...draft, [group]: [...draft[group], Object.fromEntries(SHOE_COLUMNS.map((c) => [c.key, ""]))] });
export const removeShoeRow = (draft, group, i) => ({ ...draft, [group]: draft[group].filter((_, r) => r !== i) });
export const setShoeCell = (draft, group, i, key, value) => ({ ...draft, [group]: draft[group].map((r, j) => (j === i ? { ...r, [key]: value } : r)) });

/** What the buyer sees for each audience, from a draft that is valid so far (an invalid draft previews as empty tables). */
export function shoePreview(draft) {
  const clean = cleanShoeDraft(draft);
  if (!clean.ok) return { ok: false, men: [], women: [], kids: [] };
  const chart = { adult: clean.value.adult, kids: clean.value.kids };
  return { ok: true, men: shoeTable(chart, "men"), women: shoeTable(chart, "women"), kids: shoeTable(chart, "kids") };
}
