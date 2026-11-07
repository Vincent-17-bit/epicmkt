// A05: size charts and shoe conversion. Pure code, no browser or Node APIs.
//   * convertShoe(value, toSystem, chart?)      one shoe size in another system, using the admin-editable conversion chart
//   * shoeChartFrom(row) / cleanShoeConversion  the stored conversion chart <-> the shape A02's shoe scale reads (SHOE_CHART)
//   * shoeTable(chart, audience)                the buyer-facing rows for a men's, women's or kids' shoe size table
//   * pickSizeChart({item, type, charts})       which chart a buyer sees: the item's own, else the one its product type points at, else its category's
//   * SEED_SIZE_CHARTS                          the charts migration 0093 seeds (a DB test keeps the two equal)
// A02 owns the shoe scale and the chart's default data (shared/src/scales/shoeChart.js). This file never re-implements their maths.
import { parse } from "./scales/index.js";
import { shoeFromCm, shoeToCm } from "./scales/shoe.js";
import { SHOE_CHART } from "./scales/shoeChart.js";
import { sizeChartFor } from "./seller/options.js";

export const SHOE_SYSTEM_IDS = Object.freeze([...SHOE_CHART.systems]); // eu, uk, us-m, us-w, cm
const FIELD = { eu: "eu", uk: "uk", "us-m": "usM", "us-w": "usW", cm: "cm" };
export const SHOE_AUDIENCES = Object.freeze(["men", "women", "kids"]);
export const SHOE_CHART_LIMITS = Object.freeze({ rows: 60, eu: [10, 60], cm: [8, 40], other: [0, 25] });

const ROW_KEYS = ["eu", "uk", "usM", "usW", "cm"];
const fail = (code, message) => ({ ok: false, error: { code, message } });
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const label = (system, n) => (system === "eu" ? `EU ${n}` : system === "uk" ? `UK ${n}` : system === "us-m" ? `US ${n} (men)` : system === "us-w" ? `US ${n} (women)` : `${n} cm`);

/** The chart as stored ({adult, kids}) in the shape the shoe scale reads (adds version, systems and widths). Returns SHOE_CHART when row is empty. */
export function shoeChartFrom(row) {
  const stored = row && (row.chart ?? row);
  if (!isRecord(stored) || !Array.isArray(stored.adult)) return SHOE_CHART;
  return { version: Number(row?.version ?? stored.version ?? 1), systems: SHOE_CHART.systems, adult: stored.adult, kids: Array.isArray(stored.kids) ? stored.kids : [], widths: SHOE_CHART.widths };
}

/** The chart in the form the database stores: only the rows. */
export const shoeChartRows = (chart = SHOE_CHART) => ({ adult: chart.adult.map((r) => ({ ...r })), kids: (chart.kids ?? []).map((r) => ({ ...r })) });

/**
 * Validates an admin edit of the shoe conversion chart. Same rules as the database function shoe_chart_valid:
 * adult rows have every size (EU, UK, US men, US women, cm); kids rows have EU and cm and may leave the others null;
 * EU and cm rise from row to row, and so does every other size column that is filled in; kids end below where adult starts.
 * Returns { ok, errors: [text], value: {adult, kids} }.
 */
export function cleanShoeConversion(raw) {
  const errors = [];
  const L = SHOE_CHART_LIMITS;
  if (!isRecord(raw)) return { ok: false, errors: ["The chart must have adult and kids rows."], value: null };
  if (Object.keys(raw).some((k) => k !== "adult" && k !== "kids")) return { ok: false, errors: ["Only adult and kids rows are allowed."], value: null };
  const between = (n, [lo, hi]) => n !== null && n >= lo && n <= hi;
  const read = (rows, name, adult) => {
    if (!Array.isArray(rows) || rows.length > L.rows || (adult && rows.length < 2)) { errors.push(`${name}: add ${adult ? "2" : "0"} to ${L.rows} rows.`); return []; }
    const out = rows.map((r, i) => {
      if (!isRecord(r)) { errors.push(`${name} row ${i + 1}: not a row.`); return null; }
      if (Object.keys(r).some((k) => !ROW_KEYS.includes(k))) { errors.push(`${name} row ${i + 1}: only ${ROW_KEYS.join(", ")} are allowed.`); return null; }
      const row = { eu: num(r.eu), uk: r.uk == null ? null : num(r.uk), usM: r.usM == null ? null : num(r.usM), usW: r.usW == null ? null : num(r.usW), cm: num(r.cm) };
      if (!between(row.eu, L.eu)) errors.push(`${name} row ${i + 1}: EU must be ${L.eu[0]} to ${L.eu[1]}.`);
      if (!between(row.cm, L.cm)) errors.push(`${name} row ${i + 1}: foot length must be ${L.cm[0]} to ${L.cm[1]} cm.`);
      for (const k of ["uk", "usM", "usW"]) {
        if (row[k] === null ? adult : !between(row[k], L.other)) errors.push(`${name} row ${i + 1}: ${k === "uk" ? "UK" : k === "usM" ? "US men" : "US women"} ${adult ? "is needed and must be" : "must be"} ${L.other[0]} to ${L.other[1]}.`);
      }
      return row;
    });
    if (out.some((r) => r === null)) return [];
    for (const k of ["eu", "uk", "usM", "usW", "cm"]) {
      let last = null;
      for (const [i, r] of out.entries()) {
        if (r[k] === null) continue;
        if (last !== null && !(r[k] > last)) { errors.push(`${name} row ${i + 1}: ${k === "uk" ? "UK" : k === "usM" ? "US men" : k === "usW" ? "US women" : k === "eu" ? "EU" : "cm"} must be larger than the row above.`); break; }
        last = r[k];
      }
    }
    return out;
  };
  const adult = read(raw?.adult, "Adult", true);
  const kids = read(raw?.kids ?? [], "Kids", false);
  if (!errors.length && kids.length && adult.length && !(kids[kids.length - 1].cm < adult[0].cm && kids[kids.length - 1].eu < adult[0].eu)) errors.push("Kids sizes must end below where adult sizes start.");
  return errors.length ? { ok: false, errors, value: null } : { ok: true, errors: [], value: { adult, kids } };
}

/**
 * One shoe size in another system. value is a stored shoe value ({system, value, width?}, with or without `scale`) or text such as "EU 42".
 * toSystem is one of eu, uk, us-m, us-w, cm. chart is the conversion chart (default: A02's SHOE_CHART; pass shoeChartFrom(row) for admin data).
 * Sizes round to the nearest half size, foot length to 0.1 cm; the width is kept. Returns { ok, value } or { ok:false, error: {code, message} }.
 */
export function convertShoe(value, toSystem, chart = SHOE_CHART) {
  if (!SHOE_SYSTEM_IDS.includes(toSystem)) return fail("unknown-system", `"${toSystem}" is not a shoe system (use ${SHOE_SYSTEM_IDS.join(", ")}).`);
  let v = value;
  if (typeof value === "string") {
    const r = parse("shoe", value, {});
    if (!r.ok) return { ok: false, error: { code: r.error?.code ?? "not-a-shoe-size", message: r.error?.message ?? "That is not a shoe size." } };
    v = r.value;
  }
  if (!isRecord(v) || !SHOE_SYSTEM_IDS.includes(v.system) || num(v.value) === null) return fail("not-a-shoe-size", "That is not a shoe size.");
  const n = v.value;
  const out = (system, size) => {
    const o = { scale: "shoe", system, value: size };
    if (system === "cm") o.unit = "cm";
    if (v.width) o.width = v.width;
    return { ok: true, value: o };
  };
  const cm = shoeToCm(v.system, n, chart);
  if (cm === null) return fail("out-of-range", `${label(v.system, n)} is outside the shoe chart.`);
  if (v.system === toSystem) return out(toSystem, n);
  const size = shoeFromCm(toSystem, cm, chart);
  if (size === null) return fail("no-equivalent", `${label(v.system, n)} has no ${toSystem === "uk" ? "UK" : toSystem === "us-m" ? "US men's" : toSystem === "us-w" ? "US women's" : toSystem.toUpperCase()} size in the chart.`);
  return out(toSystem, size);
}

/** Buyer-facing rows of the shoe table: men -> {eu, uk, us, cm}, women -> same with US women's, kids -> {eu, cm}. */
export function shoeTable(chart = SHOE_CHART, audience = "men") {
  if (audience === "kids") return (chart.kids ?? []).map((r) => ({ eu: r.eu, cm: r.cm }));
  const f = audience === "women" ? "usW" : "usM";
  return chart.adult.filter((r) => r[f] !== null && r[f] !== undefined).map((r) => ({ eu: r.eu, uk: r.uk, us: r[f], cm: r.cm }));
}

/** Which chart a buyer sees, as sizeChartFor() returns it ({id, name, category, unit, columns, rows, overridden}) or null.
 *  Order: the item's own chart (item.sizeChartId, with its override when it still fits), then the product type's chart (type.sizeChartId, the contract's
 *  ProductType.sizeChartId; a chart's productTypeIds / product_type_ids are read too), then a chart of the shop's category that no type uses.
 *  item: { sizeChartId?, sizeChartOverride?: {rows}, productTypeId?, category? }; type: the item's product type, { id?, sizeChartId? } (optional);
 *  charts: the active charts (the public_size_charts view). Only the item's own chart takes the seller's override. */
export function pickSizeChart({ item = {}, type = null, charts = [] } = {}) {
  const active = (charts ?? []).filter((c) => c && c.active !== false);
  const typeIds = (c) => c.productTypeIds ?? c.product_type_ids ?? [];
  const own = item.sizeChartId ? active.find((c) => c.id === item.sizeChartId) : null;
  if (own) return sizeChartFor(own, item.sizeChartOverride ?? null);
  const typeId = item.productTypeId ?? type?.id ?? null;
  const byType = (type?.sizeChartId ? active.find((c) => c.id === type.sizeChartId) : null) ?? (typeId ? active.find((c) => typeIds(c).includes(typeId)) : null);
  const pick = byType ?? (item.category ? active.find((c) => c.category === item.category && typeIds(c).length === 0) : null);
  return pick ? sizeChartFor(pick, null) : null;
}

const SIZE_ROWS = (rows, key) => rows.map((r) => [String(r.eu), String(r.uk), String(r[key]), String(r.cm)]);
/** The five charts migration 0093 seeds. Shoe charts are built from A02's SHOE_CHART so the numbers have one source.
 *  productTypeIds are the types a chart is the default for (attach_default_size_charts): a type has ONE default chart, so the two shoe charts name none;
 *  a seller picks men's or women's per item (items.size_chart_id). */
export const SEED_SIZE_CHARTS = Object.freeze([
  {
    name: "Dresses and tops (cm)", category: null, unit: "cm", productTypeIds: ["dress"],
    columns: ["Size", "Bust", "Waist", "Hip"],
    rows: [["XS", "80", "62", "88"], ["S", "84", "66", "92"], ["M", "90", "72", "98"], ["L", "96", "78", "104"], ["XL", "102", "84", "110"]]
  },
  {
    name: "Shirt collar", category: null, unit: "in", productTypeIds: ["shirt"],
    columns: ["Collar (in)", "Collar (cm)", "Shirt size"],
    rows: [["14", "35.6", "S"], ["14.5", "36.8", "S"], ["15", "38.1", "M"], ["15.5", "39.4", "M"], ["16", "40.6", "L"], ["16.5", "41.9", "L"], ["17", "43.2", "XL"], ["17.5", "44.5", "XL"], ["18", "45.7", "2XL"]]
  },
  { name: "Men's shoes", category: null, unit: "cm", productTypeIds: [], columns: ["EU", "UK", "US men", "Foot length (cm)"], rows: SIZE_ROWS(SHOE_CHART.adult, "usM") },
  { name: "Women's shoes", category: null, unit: "cm", productTypeIds: [], columns: ["EU", "UK", "US women", "Foot length (cm)"], rows: SIZE_ROWS(SHOE_CHART.adult, "usW") },
  {
    name: "Kids clothes (age)", category: null, unit: "cm", productTypeIds: [],
    columns: ["Age", "Height", "Chest", "Waist"],
    rows: [["2-3 years", "98", "53", "52"], ["3-4 years", "104", "55", "53"], ["4-5 years", "110", "57", "54"], ["5-6 years", "116", "60", "55"], ["6-7 years", "122", "63", "56"], ["7-8 years", "128", "66", "58"], ["8-9 years", "134", "69", "59"], ["9-10 years", "140", "72", "61"]]
  }
]);
