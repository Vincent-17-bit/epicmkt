// Demo data for the size charts and shoe conversion pages (migration 0093). Local development only; same rules as the database functions.
import { SEED_SIZE_CHARTS, cleanShoeConversion, cleanSizeChart, shoeChartRows } from "@epicmkt/shared";
import { ApiError } from "./errors.js";

const latency = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
let charts = [];
let shoe = null;
let seq = 0;

export function resetMockSizeCharts() {
  seq = 0;
  charts = SEED_SIZE_CHARTS.map((c) => ({ id: `sc-${++seq}`, name: c.name, category: c.category, unit: c.unit, columns: [...c.columns], rows: c.rows.map((r) => [...r]), active: true, product_type_ids: [...c.productTypeIds], items_using: c.productTypeIds.length ? 12 : 0, updated_at: new Date().toISOString() }));
  shoe = { chart: shoeChartRows(), version: 1 };
}
resetMockSizeCharts();

export async function listSizeCharts() { await latency(); return charts.map((c) => ({ ...c, columns: [...c.columns], rows: c.rows.map((r) => [...r]), product_type_ids: [...c.product_type_ids] })); }

export async function saveSizeChart(id, fields) {
  await latency();
  const clean = cleanSizeChart(fields);
  if (!clean.ok) throw new ApiError(clean.errors.name ? "invalid_name" : clean.errors.unit ? "invalid_unit" : "invalid_chart");
  const name = clean.value.name.toLowerCase();
  if (charts.some((c) => c.id !== id && c.name.toLowerCase() === name)) throw new ApiError("duplicate_chart");
  const typeIds = Array.isArray(fields.product_type_ids) ? fields.product_type_ids : null;
  if (typeIds) charts = charts.map((c) => (c.id === id ? c : { ...c, product_type_ids: c.product_type_ids.filter((t) => !typeIds.includes(t)) })); // a type has one chart
  const existing = charts.find((c) => c.id === id);
  const row = { ...(existing ?? { id: `sc-${++seq}`, items_using: 0 }), ...clean.value, product_type_ids: typeIds ?? existing?.product_type_ids ?? [], updated_at: new Date().toISOString() };
  charts = existing ? charts.map((c) => (c.id === id ? row : c)) : [...charts, row];
  return row.id;
}

export async function deleteSizeChart(id) {
  await latency();
  const c = charts.find((x) => x.id === id);
  if (!c) throw new ApiError("chart_not_found");
  if (c.items_using > 0 || c.product_type_ids.length > 0) throw new ApiError("size_chart_in_use");
  charts = charts.filter((x) => x.id !== id);
}

export async function getShoeConversion() { await latency(); return { chart: JSON.parse(JSON.stringify(shoe.chart)), version: shoe.version }; }

export async function saveShoeConversion(chart) {
  await latency();
  const clean = cleanShoeConversion(chart);
  if (!clean.ok) throw new ApiError("invalid_shoe_chart");
  shoe = { chart: clean.value, version: shoe.version + 1 };
  return shoe.version;
}
