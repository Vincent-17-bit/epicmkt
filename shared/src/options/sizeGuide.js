// The seller's own size guide for one item: a table the seller fills in on the item (columns they choose, one row per size they sell).
// Pure code, no browser or Node APIs. Stored as items.size_guide = { unit, columns:[text], rows:[[text]] } (migration 0101);
// in the editor each row also has an id so the screen can keep its place: { unit, columns, rows:[{ id, cells:[text] }] }. The first column is the size.
//   startGuide / guideFromChart / shoeGuide   three ways to begin: columns for the kind of item, an admin chart used as a template, shoe sizes converted
//   syncSizes / orderBySizes                  keep one row per size the seller offers, in the order they offer them
//   setCell, setHeader, addColumn, ...        small edits, each returns a new guide
//   checkGuide                                { errors, warnings }, same limits as the database function size_guide_valid
//   guidePayload / guideFromServer            the stored shape <-> the editor's
import { convertShoe } from "../sizeCharts.js";
import { parse } from "../scales/index.js";
import { convertCell, measurementColumns } from "../chartUnits.js";

export const GUIDE_LIMITS = Object.freeze({ columns: 12, rows: 60, header: 30, cell: 20 });
export const GUIDE_BLANK = "–"; // what an empty cell shows to buyers (the database does not keep empty cells)
export const GUIDE_UNITS = Object.freeze(["cm", "in"]);

export const SHOE_SYSTEMS = Object.freeze([
  { id: "eu", label: "EU", header: "EU" }, { id: "uk", label: "UK", header: "UK" },
  { id: "us-m", label: "US men", header: "US men" }, { id: "us-w", label: "US women", header: "US women" }, { id: "cm", label: "Foot length", header: "Foot length (cm)" }
]);

// Ready columns by kind. The first column is always the size the buyer picks.
export const GUIDE_TEMPLATES = Object.freeze([
  { id: "tops", name: "Tops and dresses", kind: "clothing", columns: ["Size", "Chest", "Waist", "Hips", "Length"] },
  { id: "bottoms", name: "Trousers and skirts", kind: "clothing", columns: ["Size", "Waist", "Hips", "Inseam"] },
  { id: "shirts", name: "Shirts with collar", kind: "clothing", columns: ["Size", "Collar", "Chest", "Sleeve"] },
  { id: "kids", name: "Kids", kind: "clothing", columns: ["Size", "Age", "Height", "Chest"] },
  { id: "plain", name: "Only my own columns", kind: "custom", columns: ["Size", "Measurement"] }
]);

const SHOE_WORDS = /\b(shoe|shoes|sneaker|sneakers|boot|boots|sandal|sandals|heel|heels|loafer|loafers|slipper|slippers|footwear|trainer|trainers|flip.?flops?)\b/i;
const SIZE_AXIS = /\b(size|sizes|saizi)\b/i;
const WEAR_WORDS = /\b(shirt|t-?shirt|tee|dress|trouser|trousers|jean|jeans|skirt|jacket|coat|hoodie|sweater|top|tops|suit|blouse|short|shorts|kitenge|ankara|abaya|vest|uniform|leggings?|gown|wear|clothing)\b/i;

export const isSizeAxisLabel = (label) => SIZE_AXIS.test(String(label ?? ""));
/** The sizes the seller offers: the values of the option type called Size (or Sizes), in their order. */
export const sizeLabels = (options) => {
  const axis = (options?.axes ?? []).find((a) => isSizeAxisLabel(a.label));
  return axis ? axis.values.map((v) => String(v.label ?? "").trim()).filter(Boolean) : [];
};
/** "shoe" | "clothing" | null for what a size guide helps: read from the product type's name and the item name. */
export const guideKindFor = (...names) => {
  const text = names.filter(Boolean).join(" ");
  if (SHOE_WORDS.test(text)) return "shoe";
  if (WEAR_WORDS.test(text)) return "clothing";
  return null;
};
/** Does this item deserve a Size guide step? It does when it has a guide, sells sizes, or is clothing or shoes. */
export const wantsGuide = ({ guide, options, typeName, itemName }) => Boolean(guide) || sizeLabels(options).length > 0 || guideKindFor(typeName, itemName) !== null;

let counter = 0;
const rid = () => `g${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const text = (v) => String(v ?? "").trim();
const sameSize = (a, b) => text(a).toLowerCase().replace(/\s+/g, " ") === text(b).toLowerCase().replace(/\s+/g, " ");
const row = (cells, width) => ({ id: rid(), cells: Array.from({ length: width }, (_, i) => text(cells?.[i]).slice(0, GUIDE_LIMITS.cell)) });

export const emptyGuide = (unit = "cm") => ({ unit, columns: ["Size"], rows: [] });

/** Columns for a kind of item with one blank row per size the seller offers. */
export function startGuide({ columns, sizes = [], unit = "cm" }) {
  const cols = (columns?.length ? columns : ["Size", "Measurement"]).slice(0, GUIDE_LIMITS.columns);
  return { unit, columns: cols, rows: sizes.slice(0, GUIDE_LIMITS.rows).map((s) => row([s], cols.length)) };
}

/** An admin chart used as a template: its columns and rows are copied, so later changes to the template never reach this item. */
export function guideFromChart(chart, { sizes = [], keepRows = true } = {}) {
  const cols = (chart.columns ?? []).slice(0, GUIDE_LIMITS.columns).map((c) => text(c));
  const unit = chart.unit === "in" ? "in" : "cm";
  const rows = keepRows ? (chart.rows ?? []).slice(0, GUIDE_LIMITS.rows).map((r) => row(r, cols.length)) : sizes.map((s) => row([s], cols.length));
  return { unit, columns: cols, rows };
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/**
 * Shoe table from the sizes the seller offers. Each size ("EU 42", "UK 8", or "42" read as `system`) is converted with the shared conversion
 * chart into UK, US men, US women and foot length. `include` picks the columns (default all four). `width` adds a Width column filled with that
 * text (for example "Standard"). Returns { guide, skipped: [sizes that are not shoe sizes or fall outside the chart] }.
 */
export function shoeGuide(sizes, { system = "eu", include = ["uk", "us-m", "us-w", "cm"], width = "", chart } = {}) {
  const systems = SHOE_SYSTEMS.filter((s) => include.includes(s.id));
  const columns = ["Size", ...systems.map((s) => s.header), ...(width ? ["Width"] : [])];
  const rows = [];
  const skipped = [];
  for (const label of sizes) {
    const read = parse("shoe", label, { system });
    if (!read.ok) { skipped.push(label); continue; }
    const cells = [label];
    let bad = false;
    for (const s of systems) {
      const r = convertShoe(read.value, s.id, chart);
      if (!r.ok) { bad = true; break; }
      cells.push(fmt(r.value.value));
    }
    if (bad) { skipped.push(label); continue; }
    if (width) cells.push(width);
    rows.push(row(cells, columns.length));
  }
  return { guide: { unit: "cm", columns, rows: rows.slice(0, GUIDE_LIMITS.rows) }, skipped };
}

/** Adds a blank row for every offered size that has none. Returns { guide, added: [sizes], extra: [row sizes the seller no longer offers] }. */
export function syncSizes(guide, sizes) {
  const have = guide.rows.map((r) => r.cells[0]);
  const missing = sizes.filter((s) => !have.some((h) => sameSize(h, s)));
  const room = Math.max(0, GUIDE_LIMITS.rows - guide.rows.length);
  const add = missing.slice(0, room).map((s) => row([s], guide.columns.length));
  const extra = have.filter((h) => text(h) && !sizes.some((s) => sameSize(h, s)));
  return { guide: add.length ? { ...guide, rows: [...guide.rows, ...add] } : guide, added: missing.slice(0, room), extra };
}

/** Puts rows in the order the seller lists the sizes; rows with no matching size stay at the end in their order. */
export function orderBySizes(guide, sizes) {
  const rank = (r) => { const i = sizes.findIndex((s) => sameSize(s, r.cells[0])); return i === -1 ? Infinity : i; };
  const rows = guide.rows.map((r, i) => ({ r, i })).sort((a, b) => (rank(a.r) - rank(b.r)) || a.i - b.i || 0).map((x) => x.r);
  return { ...guide, rows };
}

/** The guide in the other unit: number and range cells (not the size column) are converted, and a header that says cm or in is switched too. */
export function setUnit(guide, unit) {
  if (!GUIDE_UNITS.includes(unit) || unit === guide.unit) return guide;
  const from = guide.unit;
  const isM = measurementColumns(guide.rows.map((r) => r.cells)).map((m, i) => m && i > 0);
  const swap = (h) => String(h).replace(new RegExp(`\\b${from}\\b`, "gi"), unit);
  return { ...guide, unit, columns: guide.columns.map(swap), rows: guide.rows.map((r) => ({ ...r, cells: r.cells.map((c, i) => (isM[i] ? convertCell(c, from, unit) : c)) })) };
}
export const setHeader = (guide, col, value) => ({ ...guide, columns: guide.columns.map((c, i) => (i === col ? String(value).slice(0, GUIDE_LIMITS.header) : c)) });
export const canAddColumn = (guide) => guide.columns.length < GUIDE_LIMITS.columns;
export const addColumn = (guide, name = "") => (canAddColumn(guide) ? { ...guide, columns: [...guide.columns, name], rows: guide.rows.map((r) => ({ ...r, cells: [...r.cells, ""] })) } : guide);
/** The size column (the first) cannot be removed. */
export const removeColumn = (guide, col) => (col <= 0 || col >= guide.columns.length ? guide : { ...guide, columns: guide.columns.filter((_, i) => i !== col), rows: guide.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== col) })) });
export const moveColumn = (guide, col, delta) => {
  const to = col + delta;
  if (col <= 0 || to <= 0 || to >= guide.columns.length) return guide;
  const swap = (a) => { const b = [...a]; [b[col], b[to]] = [b[to], b[col]]; return b; };
  return { ...guide, columns: swap(guide.columns), rows: guide.rows.map((r) => ({ ...r, cells: swap(r.cells) })) };
};
export const canAddRow = (guide) => guide.rows.length < GUIDE_LIMITS.rows;
export const addRow = (guide, size = "") => (canAddRow(guide) ? { ...guide, rows: [...guide.rows, row([size], guide.columns.length)] } : guide);
export const removeRow = (guide, id) => ({ ...guide, rows: guide.rows.filter((r) => r.id !== id) });
export const moveRow = (guide, id, delta) => {
  const i = guide.rows.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= guide.rows.length) return guide;
  const rows = [...guide.rows];
  [rows[i], rows[j]] = [rows[j], rows[i]];
  return { ...guide, rows };
};
export const setCell = (guide, id, col, value) => ({ ...guide, rows: guide.rows.map((r) => (r.id === id ? { ...r, cells: r.cells.map((c, i) => (i === col ? String(value).slice(0, GUIDE_LIMITS.cell) : c)) } : r)) });
/** A new row with the same cells as another, size left blank. */
export const copyRow = (guide, id) => {
  const i = guide.rows.findIndex((r) => r.id === id);
  if (i < 0 || !canAddRow(guide)) return guide;
  const copy = { id: rid(), cells: guide.rows[i].cells.map((c, n) => (n === 0 ? "" : c)) };
  return { ...guide, rows: [...guide.rows.slice(0, i + 1), copy, ...guide.rows.slice(i + 1)] };
};

/**
 * What stops a save (errors, a map of path -> message) and what only deserves a look (warnings, a list).
 * Paths: "columns", "columns.2", "rows", "rows.<id>.0".
 */
export function checkGuide(guide, sizes = []) {
  const errors = {};
  const warnings = [];
  if (!guide) return { errors, warnings };
  if (guide.columns.length < 2) errors.columns = "Add at least one measurement column next to Size.";
  const seen = new Set();
  guide.columns.forEach((c, i) => {
    const t = text(c);
    if (!t) errors[`columns.${i}`] = "Give this column a name.";
    else if (t.length > GUIDE_LIMITS.header) errors[`columns.${i}`] = `Use ${GUIDE_LIMITS.header} characters or fewer.`;
    else if (seen.has(t.toLowerCase())) errors[`columns.${i}`] = `${t} is used twice. Give each column its own name.`;
    seen.add(t.toLowerCase());
  });
  if (guide.rows.length === 0) errors.rows = "Add at least one size row, or remove the guide.";
  const sizesSeen = new Set();
  let blanks = 0;
  for (const r of guide.rows) {
    r.cells.forEach((c, i) => {
      const t = text(c);
      if (t.length > GUIDE_LIMITS.cell) errors[`rows.${r.id}.${i}`] = `Use ${GUIDE_LIMITS.cell} characters or fewer.`;
      else if (!t && i === 0) errors[`rows.${r.id}.0`] = "Name this size.";
      else if (!t) blanks += 1;
    });
    const s = text(r.cells[0]).toLowerCase();
    if (s) { if (sizesSeen.has(s) && !errors[`rows.${r.id}.0`]) errors[`rows.${r.id}.0`] = `${text(r.cells[0])} is listed twice.`; sizesSeen.add(s); }
  }
  if (blanks) warnings.push({ code: "blank", count: blanks, message: `${blanks} empty ${blanks === 1 ? "cell" : "cells"} will show as ${GUIDE_BLANK}.` });
  const missing = sizes.filter((s) => !guide.rows.some((r) => sameSize(r.cells[0], s)));
  if (missing.length) warnings.push({ code: "missing", sizes: missing, message: `No row for ${missing.join(", ")}. Buyers who pick ${missing.length === 1 ? "it" : "one of them"} will not see their measurements.` });
  const extra = guide.rows.map((r) => r.cells[0]).filter((h) => text(h) && sizes.length && !sizes.some((s) => sameSize(h, s)));
  if (extra.length) warnings.push({ code: "extra", sizes: extra, message: `${extra.join(", ")} ${extra.length === 1 ? "is" : "are"} in the guide but not in your sizes.` });
  return { errors, warnings };
}

/** The stored shape, or null when there is nothing to keep (no guide, or no rows). Empty cells become the dash. */
export function guidePayload(guide) {
  if (!guide || guide.rows.length === 0) return null;
  return {
    unit: guide.unit === "in" ? "in" : "cm",
    columns: guide.columns.map(text),
    rows: guide.rows.map((r) => guide.columns.map((_, i) => text(r.cells[i]) || GUIDE_BLANK))
  };
}

/** The editor's guide from what the database kept (null when there is none). The dash we wrote for an empty cell comes back as empty. */
export function guideFromServer(data) {
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return null;
  const cols = data.columns.map(text);
  return { unit: data.unit === "in" ? "in" : "cm", columns: cols, rows: data.rows.map((r) => row((r ?? []).map((c) => (text(c) === GUIDE_BLANK ? "" : c)), cols.length)) };
}

/** What a buyer sees ({id, name, unit, columns, rows, own}), for the preview inside the editor. */
export const guideForBuyer = (guide) => {
  const p = guidePayload(guide);
  return p ? { id: null, name: "Size guide", category: null, ...p, overridden: false, own: true } : null;
};

