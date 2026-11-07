// Size filters (B08). A product carries `sizes`: the stored scale values of its size-like options ({scale, system?, value, unit?}).
// Everything groups by scale and by a canonical key, so shoe 42 never mixes with dress 42 or a 42 inch TV, the same shoe in EU and UK is one
// choice, and 5 m is the same length as 500 cm. Pure functions: they run in the browser, in the edge function and in tests.
//
// TODO(contract:A06): the item list carries `sizes` per product (stored scale values). Until A06 ships it, products without it simply have no size facets.
// Relative imports, like productFilters.js: this file also runs in the edge function, which cannot resolve the workspace alias.
import * as scales from "../../../shared/src/scales/index.js";
import { convertShoe } from "../../../shared/src/sizeCharts.js";

// How each scale is offered: a list of choices, or a numeric range in a display unit (`perBase` = how many base units make one display unit).
const GROUPS = [
  { scale: "apparel-alpha", title: "Clothing size", kind: "choice" },
  { scale: "apparel-numeric", title: "Dress size", kind: "choice" },
  { scale: "kids-age", title: "Kids age", kind: "choice" },
  { scale: "collar-inch", title: "Collar size", kind: "choice" },
  { scale: "shoe", title: "Shoe size", kind: "choice" },
  { scale: "storage", title: "Storage", kind: "choice" },
  { scale: "screen-inch", title: "Screen size", kind: "range", unit: "in", perBase: 1 },
  { scale: "length", title: "Length", kind: "range", unit: "m", perBase: 1000 }
];
const GROUP = new Map(GROUPS.map((g) => [g.scale, g]));
export const SIZE_GROUPS = GROUPS;

const parseable = (v) => v && typeof v === "object" && typeof v.scale === "string" && GROUP.has(v.scale);
const baseOf = (v) => {
  const n = Number(scales.toBase(v));
  return Number.isFinite(n) ? n : null;
};

/** The canonical key of a stored value: shoes and lengths by their real size (so EU 42 = UK 8, 5 m = 500 cm), everything else by sizeKey. */
export function canonicalKey(v) {
  if (!parseable(v)) return null;
  if (v.scale === "shoe" || GROUP.get(v.scale).kind === "range" || v.scale === "storage" || v.scale === "collar-inch") {
    const base = baseOf(v);
    return base === null ? null : `${v.scale}:${base}`;
  }
  return scales.sizeKey(v);
}
const scaleOfKey = (key) => String(key).split(":")[0];

/** The distinct canonical keys of one product (a product with two EU 42 variants counts once). */
export const keysOf = (p) => [...new Set((p.sizes ?? []).map(canonicalKey).filter(Boolean))];

/** What a shopper can pick, over the whole list: [{scale, title, kind, options:[{key, value, count}] | range:{min,max,unit}}], in a fixed group order. */
export function sizeFacets(products) {
  const byScale = new Map();
  for (const p of products) {
    const seen = new Set();
    for (const v of p.sizes ?? []) {
      const key = canonicalKey(v);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const group = byScale.get(v.scale) ?? new Map();
      const entry = group.get(key) ?? { key, value: v, count: 0 };
      entry.count += 1;
      group.set(key, entry);
      byScale.set(v.scale, group);
    }
  }
  return GROUPS.filter((g) => byScale.has(g.scale)).map((g) => {
    const entries = [...byScale.get(g.scale).values()].sort((a, b) => scales.compare(a.value, b.value) || (a.key < b.key ? -1 : 1));
    if (g.kind === "choice") return { scale: g.scale, title: g.title, kind: "choice", options: entries };
    const bases = entries.map((e) => baseOf(e.value)).filter((n) => n !== null);
    const lo = Math.min(...bases) / g.perBase;
    const hi = Math.max(...bases) / g.perBase;
    return { scale: g.scale, title: g.title, kind: "range", unit: g.unit, range: { min: lo, max: hi }, options: entries };
  });
}

/** The text of one choice. Shoes read in the buyer's system (`system`: eu, uk, us-m, us-w, cm), everything else through its scale's own format. */
export function optionLabel(value, system = null) {
  if (value?.scale === "shoe" && system && system !== value.system) {
    const out = convertShoe(value, system);
    if (out.ok) return scales.format(out.value);
  }
  return scales.format(value);
}

// ---- matching ----

const inRange = (p, scale, range) => {
  const g = GROUP.get(scale);
  return (p.sizes ?? []).some((v) => {
    if (v?.scale !== scale) return false;
    const b = baseOf(v);
    if (b === null) return false;
    const x = b / g.perBase;
    return (range.min === "" || x >= Number(range.min)) && (range.max === "" || x <= Number(range.max));
  });
};

/** OR inside a scale, AND between scales. A product with no sizes never matches a size filter. */
export function matchesSizes(p, filters) {
  const picked = filters.sizes ?? [];
  const ranges = filters.ranges ?? {};
  if (!picked.length && !Object.keys(ranges).length) return true;
  const keys = new Set(keysOf(p));
  const wanted = new Map();
  for (const k of picked) wanted.set(scaleOfKey(k), [...(wanted.get(scaleOfKey(k)) ?? []), k]);
  for (const [scale, list] of wanted) if (!list.some((k) => keys.has(k))) return false;
  for (const [scale, range] of Object.entries(ranges)) if (!inRange(p, scale, range)) return false;
  return true;
}

// ---- address ----
// psize=shoe:26.7,apparel-alpha:2    prange=screen-inch:32-55,length:5-10   (a missing end is left empty: length:5-)

const num = (s) => (/^\d{1,6}(\.\d{1,2})?$/.test(s ?? "") ? s : "");
export function parseSizes(params) {
  const sizes = (params.get("psize") ?? "").split(",").map((s) => s.trim()).filter((k) => GROUP.has(scaleOfKey(k)) && k.includes(":"));
  const ranges = {};
  for (const part of (params.get("prange") ?? "").split(",")) {
    const m = /^([a-z-]+):(\d*\.?\d*)-(\d*\.?\d*)$/.exec(part.trim());
    if (!m || GROUP.get(m[1])?.kind !== "range") continue;
    const min = num(m[2]);
    const max = num(m[3]);
    if (min !== "" || max !== "") ranges[m[1]] = { min, max };
  }
  return { sizes: [...new Set(sizes)], ranges };
}
export function writeSizes(next, filters) {
  next.delete("psize");
  next.delete("prange");
  if (filters.sizes?.length) next.set("psize", filters.sizes.join(","));
  const parts = Object.entries(filters.ranges ?? {}).filter(([, r]) => r.min !== "" || r.max !== "").map(([s, r]) => `${s}:${r.min}-${r.max}`);
  if (parts.length) next.set("prange", parts.join(","));
  return next;
}

/** Live counts for each size choice, given every OTHER filter in force (the caller passes the rows with sizes already cleared). */
export function sizeCounts(rows) {
  const map = new Map();
  for (const p of rows) for (const k of keysOf(p)) map.set(k, (map.get(k) ?? 0) + 1);
  return map;
}

/** Chip text for one picked key / one range. `facets` gives the representative value so a shoe chip follows the buyer's system. */
export function chipLabel(key, facets, system) {
  for (const g of facets ?? []) {
    const hit = g.options?.find((o) => o.key === key);
    if (hit) return `${g.title}: ${optionLabel(hit.value, system)}`;
  }
  return key;
}
export function rangeLabel(scale, range) {
  const g = GROUP.get(scale);
  const unit = g.unit === "in" ? '"' : ` ${g.unit}`;
  const t = g.title;
  if (range.min !== "" && range.max !== "") return `${t}: ${range.min} to ${range.max}${unit}`;
  return range.min !== "" ? `${t}: ${range.min}${unit} and up` : `${t}: up to ${range.max}${unit}`;
}
