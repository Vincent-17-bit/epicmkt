// The size chart editor, with no React: every change is a pure function from one chart to the next, so the rules are tested without a screen.
//
// A chart in the editor: { id, name, category, unit, columns: [text], rows: [[text]], active, productTypeIds: [id] }.
// Every cell is text while it is being edited; validation (cleanSizeChart, the same rules as the database) runs on the whole chart.
import { SIZE_CHART_LIMITS, SIZE_CHART_UNITS, canToggleUnit, chartInUnit, cleanSizeChart } from "@epicmkt/shared";

export const LIMITS = SIZE_CHART_LIMITS;
export const UNITS = SIZE_CHART_UNITS;
export const UNIT_LABELS = { cm: "Centimetres (cm)", in: "Inches (in)", mm: "Millimetres (mm)", kg: "Kilograms (kg)", lb: "Pounds (lb)", none: "No unit (ages, labels)" };
export const MAX_TYPES = 20;

export const blankChart = () => ({ id: null, name: "", category: "", unit: "cm", columns: ["Size", "Bust", "Waist"], rows: [["S", "", ""], ["M", "", ""]], active: true, productTypeIds: [] });

/** An admin_size_charts_list row (or a public chart) as an editable chart. */
export const fromRow = (row) => ({
  id: row.id ?? null,
  name: row.name ?? "",
  category: row.category ?? "",
  unit: row.unit ?? "cm",
  columns: [...(row.columns ?? [])],
  rows: (row.rows ?? []).map((r) => [...r]),
  active: row.active !== false,
  productTypeIds: [...(row.product_type_ids ?? row.productTypeIds ?? [])]
});

export const duplicateOf = (chart) => ({ ...chart, id: null, name: `${chart.name} (copy)`.slice(0, LIMITS.name), productTypeIds: [] });

/** What admin_save_size_chart takes. */
export const toFields = (chart) => ({
  name: chart.name.trim(),
  category: chart.category?.trim() || null,
  unit: chart.unit,
  columns: chart.columns.map((c) => c.trim()),
  rows: chart.rows.map((r) => r.map((c) => c.trim())),
  active: chart.active,
  product_type_ids: chart.productTypeIds
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** True when the chart differs from what was loaded (or from a blank chart for a new one). */
export const isDirty = (chart, original) => !same(toFields(chart), toFields(original ?? blankChart()));

// ---- cells, rows and columns ----

const clampText = (text, max) => String(text ?? "").slice(0, max);
const blankRow = (n) => Array.from({ length: n }, () => "");
const replaceAt = (list, i, value) => list.map((x, k) => (k === i ? value : x));
const swap = (list, a, b) => {
  const out = [...list];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
};
const inRange = (i, n) => Number.isInteger(i) && i >= 0 && i < n;

export const setField = (chart, patch) => ({ ...chart, ...patch });

export function editCell(chart, r, c, text) {
  if (!inRange(r, chart.rows.length) || !inRange(c, chart.columns.length)) return chart;
  return { ...chart, rows: chart.rows.map((row, i) => (i === r ? replaceAt(row, c, clampText(text, LIMITS.cell)) : row)) };
}

export function renameColumn(chart, c, text) {
  if (!inRange(c, chart.columns.length)) return chart;
  return { ...chart, columns: replaceAt(chart.columns, c, clampText(text, LIMITS.column)) };
}

/** Adds a row after `after` (default: at the end). Returns { chart, index } (the new row's index), or the chart unchanged when full. */
export function addRow(chart, after = chart.rows.length - 1) {
  if (chart.rows.length >= LIMITS.rows) return { chart, index: -1 };
  const at = Math.min(Math.max(after + 1, 0), chart.rows.length);
  const rows = [...chart.rows.slice(0, at), blankRow(chart.columns.length), ...chart.rows.slice(at)];
  return { chart: { ...chart, rows }, index: at };
}

/** Removes a row. The last row cannot be removed (a chart needs one). */
export function removeRow(chart, r) {
  if (!inRange(r, chart.rows.length) || chart.rows.length <= 1) return chart;
  return { ...chart, rows: chart.rows.filter((_, i) => i !== r) };
}

export function moveRow(chart, r, step) {
  const to = r + step;
  if (!inRange(r, chart.rows.length) || !inRange(to, chart.rows.length)) return chart;
  return { ...chart, rows: swap(chart.rows, r, to) };
}

export function addColumn(chart, after = chart.columns.length - 1) {
  if (chart.columns.length >= LIMITS.columns) return { chart, index: -1 };
  const at = Math.min(Math.max(after + 1, 0), chart.columns.length);
  const name = uniqueName(chart.columns, "New column");
  return {
    chart: { ...chart, columns: [...chart.columns.slice(0, at), name, ...chart.columns.slice(at)], rows: chart.rows.map((row) => [...row.slice(0, at), "", ...row.slice(at)]) },
    index: at
  };
}

export function removeColumn(chart, c) {
  if (!inRange(c, chart.columns.length) || chart.columns.length <= 1) return chart;
  return { ...chart, columns: chart.columns.filter((_, i) => i !== c), rows: chart.rows.map((row) => row.filter((_, i) => i !== c)) };
}

export function moveColumn(chart, c, step) {
  const to = c + step;
  if (!inRange(c, chart.columns.length) || !inRange(to, chart.columns.length)) return chart;
  return { ...chart, columns: swap(chart.columns, c, to), rows: chart.rows.map((row) => swap(row, c, to)) };
}

function uniqueName(existing, base) {
  const lower = new Set(existing.map((x) => x.trim().toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; n < 100; n++) if (!lower.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  return base;
}

/**
 * Pastes a block copied from a spreadsheet (tab separated; commas when there are no tabs) with its top-left cell at (r, c).
 * Rows are added as needed (up to the limit); columns beyond the chart are ignored. Returns { chart, rows, cells, clipped }.
 */
export function pasteBlock(chart, r, c, text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const grid = lines.map((line) => (line.includes("\t") ? line.split("\t") : line.split(",")));
  let next = chart;
  let cells = 0;
  let clipped = false;
  grid.forEach((cols, i) => {
    const row = r + i;
    if (row >= next.rows.length) {
      const added = addRow(next, next.rows.length - 1);
      if (added.index < 0) { clipped = true; return; }
      next = added.chart;
    }
    cols.forEach((cell, j) => {
      const col = c + j;
      if (col >= next.columns.length) { clipped = true; return; }
      next = editCell(next, row, col, cell.trim());
      cells += 1;
    });
  });
  return { chart: next, rows: grid.length, cells, clipped };
}

// ---- unit ----

/** Changes the unit. cm <-> in can also convert the numbers (rounded to one decimal) and the unit in the column names. */
export function setUnit(chart, unit, { convert = false } = {}) {
  if (!UNITS.includes(unit) || unit === chart.unit) return chart;
  const both = (chart.unit === "cm" || chart.unit === "in") && (unit === "cm" || unit === "in");
  if (convert && both) {
    const out = chartInUnit({ unit: chart.unit, columns: chart.columns, rows: chart.rows }, unit);
    return { ...chart, unit, columns: out.columns, rows: out.rows };
  }
  return { ...chart, unit };
}

export const canConvert = (chart) => canToggleUnit({ unit: chart.unit, columns: chart.columns, rows: chart.rows });

// ---- types ----

export function toggleType(chart, id) {
  const has = chart.productTypeIds.includes(id);
  if (!has && chart.productTypeIds.length >= MAX_TYPES) return chart;
  return { ...chart, productTypeIds: has ? chart.productTypeIds.filter((t) => t !== id) : [...chart.productTypeIds, id] };
}

/** The types picked that currently use a different chart: saving moves them. [{ id, name, from }] */
export const movedTypes = (chart, types) =>
  types.filter((t) => chart.productTypeIds.includes(t.id) && t.sizeChartId && t.sizeChartId !== chart.id).map((t) => ({ id: t.id, name: t.name, from: t.sizeChartId }));

/** Types that this chart has now but the edit drops: saving releases them. */
export const releasedTypes = (chart, original) => (original?.productTypeIds ?? []).filter((id) => !chart.productTypeIds.includes(id));

// ---- validation ----

/**
 * validate(chart) -> { ok, errors: { name?, unit?, columns?, rows? }, cells: { "r:c": text }, columnErrors: { c: text }, count, value }
 * `errors` come from cleanSizeChart (the database rules); `cells` point at the exact cells so each can be described to a screen reader.
 */
export function validate(chart) {
  const base = cleanSizeChart(toFields(chart));
  const cells = {};
  const columnErrors = {};
  const seen = new Map();
  chart.columns.forEach((c, i) => {
    const t = c.trim();
    if (!t) columnErrors[i] = "Name this column.";
    else if (seen.has(t.toLowerCase())) columnErrors[i] = `Same name as column ${seen.get(t.toLowerCase()) + 1}.`;
    else seen.set(t.toLowerCase(), i);
  });
  chart.rows.forEach((row, r) => row.forEach((cell, c) => {
    const t = cell.trim();
    if (!t) cells[`${r}:${c}`] = "Enter a value.";
    else if (t.length > LIMITS.cell) cells[`${r}:${c}`] = `Use ${LIMITS.cell} characters or fewer.`;
  }));
  const typeError = chart.productTypeIds.length > MAX_TYPES ? `Pick ${MAX_TYPES} types or fewer.` : null;
  const errors = { ...base.errors, ...(typeError ? { types: typeError } : {}) };
  const count = Object.keys(errors).length + Object.keys(cells).length + Object.keys(columnErrors).length;
  return { ok: base.ok && !typeError && Object.keys(cells).length === 0 && Object.keys(columnErrors).length === 0, errors, cells, columnErrors, count, value: base.value };
}

/** One sentence a screen reader hears after a failed save. */
export function summary(v) {
  if (v.ok) return "Ready to save.";
  const parts = [];
  if (v.errors.name) parts.push("the name");
  if (v.errors.unit) parts.push("the unit");
  if (Object.keys(v.columnErrors).length) parts.push(`${Object.keys(v.columnErrors).length} column ${Object.keys(v.columnErrors).length === 1 ? "name" : "names"}`);
  if (Object.keys(v.cells).length) parts.push(`${Object.keys(v.cells).length} empty or long ${Object.keys(v.cells).length === 1 ? "cell" : "cells"}`);
  if (v.errors.types) parts.push("the types");
  return `Fix ${parts.join(", ") || "the chart"} before saving.`;
}

/** Charts for the list: filtered by a search over name, category and type ids. */
export function filterCharts(charts, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return charts;
  return charts.filter((c) => [c.name, c.category ?? "", ...(c.product_type_ids ?? [])].some((x) => String(x).toLowerCase().includes(q)));
}
