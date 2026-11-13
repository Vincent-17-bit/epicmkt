// Size filters for the home products (prompt 1.8). Pure functions, free of browser, Node and Supabase imports, because
// productFilters.js (which uses them) also runs on the edge.
//
// A product exposes `sizeValues`: the stored scale values of its sizes ({scale, system?, value, unit?}).
// The product list carries `sizeValues` since migration 0104 (see docs/requests/2026-11-07-sizes-to-client-list-size-values.md). A product without
// the field simply has no sizes and the Size section stays hidden.
//
// Rules
//  - Sizes are grouped by scale first, then by sizeKey, so shoe 42 never mixes with a dress 42 or a 42-inch screen.
//  - A shoe is keyed by its EU size, so EU 42 and UK 8 are one choice (the buyer's system only changes the label).
//  - length and screen-inch are filtered by a range (strip light 5 to 10 m, TV 32 to 55 in); everything else is a list of choices,
//    sorted with the scale's own compare (so 512 GB comes before 1 TB).
import * as scales from "../../../shared/src/scales/index.js";
import { convertShoe } from "../../../shared/src/sizeCharts.js";

/** Scales filtered by a range, with the unit the range is typed in and how to turn the scale's base number into it. */
export const RANGE_SCALES = Object.freeze({
  length: { unit: "m", label: "Length", fromBase: (mm) => mm / 1000 },
  "screen-inch": { unit: "in", label: "Screen size", fromBase: (inch) => inch }
});

export const SIZE_GROUP_LABELS = Object.freeze({
  shoe: "Shoe size",
  "apparel-alpha": "Clothing size",
  "apparel-numeric": "Clothing size (numbers)",
  "kids-age": "Kids age",
  "collar-inch": "Shirt collar",
  storage: "Storage",
  "screen-inch": "Screen size",
  length: "Length",
  weight: "Weight",
  volume: "Volume",
  power: "Power",
  count: "Count",
  dimensions: "Dimensions",
  "paper-size": "Paper size",
  "bed-size": "Bed size",
  "tyre-size": "Tyre size",
  "ring-size": "Ring size"
});

const isStored = (v) => v && typeof v === "object" && typeof v.scale === "string" && "value" in v && Boolean(scales.getScale(v.scale));

/** The product's stored size values (never throws; unknown or malformed entries are skipped). */
export const sizesOf = (product) => (Array.isArray(product?.sizeValues) ? product.sizeValues.filter(isStored) : []);

/** The key a size is filtered by. A shoe in any system is keyed by its EU size. */
export function filterKey(value) {
  try {
    if (value.scale === "shoe" && value.system !== "eu") {
      const eu = convertShoe(value, "eu");
      if (eu.ok) return scales.sizeKey(eu.value);
    }
    return scales.sizeKey(value);
  } catch {
    return null;
  }
}

/** A value as the facet keeps it: shoes in EU so the label can be written in any system. */
function canonical(value) {
  if (value.scale === "shoe" && value.system !== "eu") {
    const eu = convertShoe(value, "eu");
    if (eu.ok) return eu.value;
  }
  return value;
}

const displayNumber = (scale, value) => {
  try {
    const base = scales.toBase(value);
    return typeof base === "number" ? RANGE_SCALES[scale].fromBase(base) : null;
  } catch {
    return null;
  }
};
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Everything a shopper can pick, over the whole list:
 *   [{ scale, label, mode: "choice", options: [{ key, value, count }] }
 *    { scale, label, mode: "range", unit, min, max, count }]
 * Groups are ordered by how many products they cover, then by label.
 */
export function sizeFacets(products) {
  const groups = new Map();
  for (const p of products) {
    const seen = new Set(); // a product counts once per option
    for (const v of sizesOf(p)) {
      const key = filterKey(v);
      if (!key) continue;
      let g = groups.get(v.scale);
      if (!g) groups.set(v.scale, (g = { scale: v.scale, options: new Map(), products: new Set(), numbers: [] }));
      g.products.add(p.id ?? p);
      if (RANGE_SCALES[v.scale]) {
        const n = displayNumber(v.scale, v);
        if (n !== null) g.numbers.push(n);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = g.options.get(key) ?? { key, value: canonical(v), count: 0 };
      entry.count += 1;
      g.options.set(key, entry);
    }
  }
  const out = [];
  for (const g of groups.values()) {
    const label = SIZE_GROUP_LABELS[g.scale] ?? scales.getScale(g.scale)?.label ?? g.scale;
    if (RANGE_SCALES[g.scale]) {
      if (g.numbers.length === 0) continue;
      out.push({ scale: g.scale, label: RANGE_SCALES[g.scale].label, mode: "range", unit: RANGE_SCALES[g.scale].unit, min: round2(Math.min(...g.numbers)), max: round2(Math.max(...g.numbers)), count: g.products.size });
    } else {
      const options = [...g.options.values()].sort((a, b) => {
        try { return scales.compare(a.value, b.value); } catch { return 0; }
      });
      if (options.length) out.push({ scale: g.scale, label, mode: "choice", options, count: g.products.size });
    }
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const num = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));

/**
 * Does a product pass the size filters? `sizes` is the list of chosen filter keys, `ranges` is { scale: { min, max } } (strings, "" is open).
 * Within one scale the choices are OR; different scales (and a range) must all match.
 */
export function matchesSizes(product, sizes = [], ranges = {}) {
  const chosen = new Map();
  for (const key of sizes) {
    const scale = String(key).split(":")[0];
    (chosen.get(scale) ?? chosen.set(scale, new Set()).get(scale)).add(key);
  }
  const rangeScales = Object.entries(ranges).filter(([scale, r]) => RANGE_SCALES[scale] && (num(r?.min) !== null || num(r?.max) !== null));
  if (chosen.size === 0 && rangeScales.length === 0) return true;
  const mine = sizesOf(product);
  for (const [scale, keys] of chosen) {
    if (!mine.some((v) => v.scale === scale && keys.has(filterKey(v)))) return false;
  }
  for (const [scale, r] of rangeScales) {
    let lo = num(r.min);
    let hi = num(r.max);
    if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
    const ok = mine.some((v) => {
      if (v.scale !== scale) return false;
      const n = displayNumber(scale, v);
      return n !== null && (lo === null || n >= lo) && (hi === null || n <= hi);
    });
    if (!ok) return false;
  }
  return true;
}

/** How many products each size choice would leave, given every other filter in `rows` (rows = the list narrowed by the other filters). */
export function sizeCounts(rows) {
  const map = new Map();
  for (const p of rows) {
    const keys = new Set(sizesOf(p).map(filterKey).filter(Boolean));
    for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

// ---- Page address: psize=shoe:eu:42,storage:-:1024:GB   prange=length:5-10,screen-inch:32-65 ----

const RANGE_NUMBER = /^\d{1,6}(?:\.\d{1,2})?$/;
const list = (value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);

export function parseSizes(params) {
  const sizes = list(params.get("psize")).filter((k) => /^[a-z][a-z0-9-]*:/.test(k) && scales.getScale(k.split(":")[0])).slice(0, 40);
  const ranges = {};
  for (const part of list(params.get("prange"))) {
    const [scale, span = ""] = part.split(":");
    if (!RANGE_SCALES[scale]) continue;
    const [min = "", max = ""] = span.split("-");
    const r = { min: RANGE_NUMBER.test(min) ? min : "", max: RANGE_NUMBER.test(max) ? max : "" };
    if (r.min !== "" || r.max !== "") ranges[scale] = r;
  }
  return { sizes, ranges };
}

export function writeSizes(params, { sizes = [], ranges = {} }) {
  params.delete("psize");
  params.delete("prange");
  if (sizes.length) params.set("psize", sizes.join(","));
  const parts = Object.entries(ranges)
    .filter(([scale, r]) => RANGE_SCALES[scale] && ((r?.min ?? "") !== "" || (r?.max ?? "") !== ""))
    .map(([scale, r]) => `${scale}:${r.min ?? ""}-${r.max ?? ""}`);
  if (parts.length) params.set("prange", parts.join(","));
  return params;
}

export const rangeCount = (ranges = {}) => Object.values(ranges).filter((r) => (r?.min ?? "") !== "" || (r?.max ?? "") !== "").length;

/** "5 to 10 m", "32 in and up", "Up to 10 m". */
export function rangeText(scale, { min = "", max = "" } = {}) {
  const unit = RANGE_SCALES[scale]?.unit ?? "";
  if (min !== "" && max !== "") return `${min} to ${max} ${unit}`;
  if (min !== "") return `${min} ${unit} and up`;
  return `Up to ${max} ${unit}`;
}
