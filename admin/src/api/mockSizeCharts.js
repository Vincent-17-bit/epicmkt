// Demo data for the size charts page (migration 0093). Local development only; it follows the same rules as the database functions.
import { PRODUCT_TYPES, SEED_SIZE_CHARTS, cleanShoeConversion, cleanSizeChart, scales, shoeChartRows } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const latency = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

let charts = [];
let types = [];
let shoe = null;
let seq = 0;

export function resetMockSizeCharts() {
  seq = 0;
  charts = SEED_SIZE_CHARTS.map((c) => ({ id: `sc-${++seq}`, name: c.name, category: c.category, unit: c.unit, columns: [...c.columns], rows: c.rows.map((r) => [...r]), active: true, updated_at: new Date(Date.now() - seq * 86400000).toISOString(), items_using: seq === 1 ? 3 : 0 }));
  types = PRODUCT_TYPES.map((t) => ({ id: t.id, name: t.name, sizeChartId: null }));
  for (const [i, c] of SEED_SIZE_CHARTS.entries()) for (const id of c.productTypeIds ?? []) {
    const t = types.find((x) => x.id === id);
    if (t) t.sizeChartId = charts[i].id;
  }
  shoe = { chart: shoeChartRows(scales.SHOE_CHART), version: 1 };
}
resetMockSizeCharts();

const withTypes = (c) => ({ ...structuredClone(c), product_type_ids: types.filter((t) => t.sizeChartId === c.id).map((t) => t.id).sort() });

export async function listSizeCharts() {
  await latency();
  return charts.map(withTypes).sort((a, b) => (a.category ?? "~").localeCompare(b.category ?? "~") || a.name.localeCompare(b.name));
}

export async function listProductTypes() {
  await latency(40);
  return types.map((t) => ({ ...t })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveSizeChart(id, fields = {}) {
  await latency();
  const r = cleanSizeChart(fields);
  if (!r.ok) throw new ApiError(r.errors.name ? "invalid_name" : r.errors.unit ? "invalid_unit" : "invalid_chart");
  const ids = "product_type_ids" in fields ? (fields.product_type_ids ?? []) : null;
  if (ids && (!Array.isArray(ids) || ids.length > 20 || new Set(ids).size !== ids.length || ids.some((t) => !types.some((x) => x.id === t)))) throw new ApiError("invalid_type_ids");
  if (charts.some((c) => c.id !== id && c.name.toLowerCase() === r.value.name.toLowerCase() && (c.category ?? null) === r.value.category)) throw new ApiError("duplicate_chart");
  let chart = id ? charts.find((c) => c.id === id) : null;
  if (id && !chart) throw new ApiError("chart_not_found");
  if (!chart) {
    chart = { id: `sc-${++seq}`, items_using: 0 };
    charts.push(chart);
  }
  Object.assign(chart, { name: r.value.name, category: r.value.category, unit: r.value.unit, columns: r.value.columns, rows: r.value.rows, active: r.value.active, updated_at: new Date().toISOString() });
  if (ids) for (const t of types) {
    if (ids.includes(t.id)) t.sizeChartId = chart.id;
    else if (t.sizeChartId === chart.id) t.sizeChartId = null;
  }
  return chart.id;
}

export async function deleteSizeChart(id) {
  await latency();
  const chart = charts.find((c) => c.id === id);
  if (!chart) throw new ApiError("chart_not_found");
  if (chart.items_using > 0 || types.some((t) => t.sizeChartId === id)) throw new ApiError("size_chart_in_use");
  charts = charts.filter((c) => c.id !== id);
}

export async function getShoeConversion() {
  await latency();
  return structuredClone(shoe);
}

export async function saveShoeConversion(chart) {
  await latency();
  const r = cleanShoeConversion(chart);
  if (!r.ok) throw new ApiError("invalid_shoe_chart");
  shoe = { chart: structuredClone(r.value), version: shoe.version + 1 };
  return shoe.version;
}
