// The seller's own size guide for one item: a table the seller fills in on the item (columns they choose, one row per size they sell).
// Pure code, no browser or Node APIs. Stored as items.size_guide = { unit, columns:[text], rows:[[text]] } (migration 0103);
// in the editor each row also has an id so the screen can keep its place: { unit, columns, rows:[{ id, cells:[text] }] }. The first column is the size.
//   startGuide / guideFromChart / shoeGuide   three ways to begin: columns for the kind of item, an admin chart used as a template, shoe sizes converted
//   syncSizes / orderBySizes                  keep one row per size the seller offers, in the order they offer them
//   setCell, setHeader, addColumn, ...        small edits, each returns a new guide
//   checkGuide                                { errors, warnings }, same limits as the database function size_guide_valid
//   guidePayload / guideFromServer            the stored shape <-> the editor's
import { convertShoe } from "../sizeCharts.js";
import { parse } from "../scales/index.js";
import { convertCell, isLengthHeader, measurementColumns } from "../chartUnits.js";

export const GUIDE_LIMITS = Object.freeze({ columns: 12, rows: 60, header: 30, cell: 20 });
export const GUIDE_BLANK = "–"; // what an empty cell shows to buyers (the database does not keep empty cells)
export const GUIDE_UNITS = Object.freeze(["cm", "in"]);

export const SHOE_SYSTEMS = Object.freeze([
  { id: "eu", label: "EU", header: "EU" }, { id: "uk", label: "UK", header: "UK" },
  { id: "us-m", label: "US men", header: "US men" }, { id: "us-w", label: "US women", header: "US women" }, { id: "cm", label: "Foot length", header: "Foot length (cm)" }
]);

// What kind of item a guide is for decides which tables are suggested first. Every kind can still use any table.
export const GUIDE_KINDS = Object.freeze([
  { id: "shoe", label: "Shoes", about: "Shoe sizes change from one country to another, so each size is shown in EU, UK, US and foot length." },
  { id: "clothing", label: "Clothing", about: "Body measurements for each size, so buyers can match their own." },
  { id: "bag", label: "Bags and luggage", about: "Outside size, capacity and weight, so buyers know what fits and whether it can go on a plane." },
  { id: "dimensions", label: "Wood, furniture and building", about: "Length, width, height or thickness for each size or cut." },
  { id: "drink", label: "Drinks and bottles", about: "Bottle or pack volumes, so buyers can compare sizes." },
  { id: "food", label: "Bread, cakes and food", about: "Weight, slices or servings for each size." },
  { id: "hardware", label: "Hardware, paint and tools", about: "Pack size, weight, volume, gauge or power for each size, so buyers pick the right one." }
]);
export const kindLabel = (id) => GUIDE_KINDS.find((k) => k.id === id)?.label ?? "Other";

// Ready columns by kind. The first column is always the size the buyer picks. `unit` is for lengths (cm or in); a table with no length column has none.
// `fill` fills a column from the size names when they say the amount ("750ml", "1.5 L", "400g", "1 kg").
export const GUIDE_TEMPLATES = Object.freeze([
  { id: "tops", name: "Tops and dresses", kind: "clothing", unit: "cm", columns: ["Size", "Chest", "Waist", "Hips", "Length"] },
  { id: "bottoms", name: "Trousers and skirts", kind: "clothing", unit: "cm", columns: ["Size", "Waist", "Hips", "Inseam"] },
  { id: "shirts", name: "Shirts with collar", kind: "clothing", unit: "cm", columns: ["Size", "Collar", "Chest", "Sleeve"] },
  { id: "kids", name: "Kids", kind: "clothing", unit: "cm", columns: ["Size", "Age", "Height", "Chest"] },
  { id: "handbag", name: "Handbags and purses", kind: "bag", unit: "cm", columns: ["Size", "Height", "Width", "Depth", "Fits"] },
  { id: "travel", name: "Travel bags and suitcases", kind: "bag", unit: "cm", columns: ["Size", "Height", "Width", "Depth", "Capacity (L)", "Weight (kg)", "Cabin size"] },
  { id: "backpack", name: "Backpacks", kind: "bag", unit: "cm", columns: ["Size", "Height", "Width", "Depth", "Capacity (L)", "Laptop fits"] },
  { id: "timber", name: "Timber and boards", kind: "dimensions", unit: "cm", columns: ["Size", "Thickness", "Width", "Length"] },
  { id: "furniture", name: "Furniture and fittings", kind: "dimensions", unit: "cm", columns: ["Size", "Length", "Width", "Height"] },
  { id: "flat", name: "Mattresses, rugs, curtains and sheets", kind: "dimensions", unit: "cm", columns: ["Size", "Length", "Width"] },
  { id: "bottles", name: "Bottle sizes", kind: "drink", unit: null, columns: ["Size", "Volume (ml)", "Servings"], fill: { col: 1, read: "volume" } },
  { id: "perfume", name: "Perfumes and sprays", kind: "drink", unit: null, columns: ["Size", "Volume (ml)", "Type"], fill: { col: 1, read: "volume" } },
  { id: "packs", name: "Packs and crates", kind: "drink", unit: null, columns: ["Size", "Bottles in pack", "Volume (ml)"], fill: { col: 2, read: "volume" } },
  { id: "loaf", name: "Bread and loaves", kind: "food", unit: null, columns: ["Size", "Weight (g)", "Slices"], fill: { col: 1, read: "weight" } },
  { id: "cake", name: "Cakes", kind: "food", unit: "in", columns: ["Size", "Diameter (in)", "Serves"] },
  { id: "weight", name: "Packs by weight", kind: "food", unit: null, columns: ["Size", "Weight (g)", "Pieces"], fill: { col: 1, read: "weight" } },
  { id: "paint", name: "Paint and liquids", kind: "hardware", unit: null, columns: ["Size", "Volume (L)", "Coverage (m²)", "Finish"] },
  { id: "cement", name: "Cement, sand and bulk", kind: "hardware", unit: null, columns: ["Size", "Weight (kg)", "Pack of"] },
  { id: "fasteners", name: "Nails, screws and bolts", kind: "hardware", unit: null, columns: ["Size", "Gauge", "Pack of", "Weight (kg)"] },
  { id: "wire", name: "Wire and cable", kind: "hardware", unit: null, columns: ["Size", "Core size", "Rating", "Roll (m)"] },
  { id: "tools", name: "Tools and equipment", kind: "hardware", unit: null, columns: ["Size", "Power (W)", "Voltage", "Weight (kg)"] },
  { id: "plain", name: "Only my own columns", kind: "custom", unit: "cm", columns: ["Size", "Measurement"] }
]);

// Column ideas to add, by kind.
export const GUIDE_COLUMN_IDEAS = Object.freeze({
  shoe: ["Width", "Heel height", "Fits"],
  clothing: ["Chest", "Waist", "Hips", "Length", "Shoulder", "Sleeve"],
  bag: ["Height", "Width", "Depth", "Capacity (L)", "Weight (kg)", "Strap drop"],
  dimensions: ["Length", "Width", "Height", "Thickness", "Weight (kg)", "Fits"],
  drink: ["Volume (ml)", "Servings", "Bottles in pack", "Alcohol (%)", "Type"],
  hardware: ["Pack of", "Weight (kg)", "Volume (L)", "Gauge", "Power (W)", "Voltage", "Coverage (m²)"],
  food: ["Weight (g)", "Slices", "Serves", "Pieces"],
  custom: ["Length", "Width", "Height", "Weight (kg)", "Volume (ml)", "Notes"]
});

const WORDS = [
  ["shoe", /\b(shoe|shoes|sneaker|sneakers|boot|boots|sandal|sandals|heel|heels|loafer|loafers|slipper|slippers|footwear|trainer|trainers|flip.?flops?)\b/i],
  ["bag", /\b(bag|bags|handbag|handbags|backpack|backpacks|suitcase|suitcases|luggage|duffel|duffle|tote|totes|purse|purses|wallet|wallets|satchel|briefcase|rucksack|trolley|clutch)\b/i],
  ["drink", /\b(liquor|whisky|whiskey|vodka|gin|rum|wine|wines|beer|beers|lager|cider|spirit|spirits|brandy|tequila|champagne|cognac|juice|soda|water|perfume|perfumes|fragrance|fragrances|cologne|colognes|parfum|deodorant|drink|drinks|beverage|beverages|bottle|bottles|milk)\b/i],
  ["food", /\b(bread|loaf|loaves|bun|buns|cake|cakes|pastry|pastries|cookie|cookies|biscuit|biscuits|flour|sugar|rice|maize|meat|cheese|bakery|food|snack|snacks|butter|yogurt|honey|oil)\b/i],
  ["hardware", /\b(hardware|paint|paints|varnish|cement|sand|nail|nails|screw|screws|bolt|bolts|nut|nuts|rivet|rivets|wire|wires|cable|cables|tool|tools|drill|drills|hammer|hammers|spanner|spanners|saw|saws|glue|adhesive|sealant|padlock|padlocks|hinge|hinges|bulb|bulbs)\b/i],
  ["dimensions", /\b(wood|wooden|timber|plank|planks|board|boards|lumber|plywood|mdf|beam|beams|post|posts|pole|poles|log|logs|furniture|table|tables|chair|chairs|sofa|sofas|bed|beds|mattress|door|doors|window|windows|pipe|pipes|tile|tiles|glass|sheet|sheets|carpet|rug|rugs|curtain|curtains|shelf|shelves|desk|desks|cabinet|wardrobe|frame|mirror|fabric|mat|mats)\b/i],
  ["clothing", /\b(shirt|t-?shirt|tee|dress|trouser|trousers|jean|jeans|skirt|jacket|coat|hoodie|sweater|top|tops|suit|blouse|short|shorts|kitenge|ankara|abaya|vest|uniform|leggings?|gown|wear|clothing)\b/i]
];
// Size-like option types: the one called Size first, then the others that say how big or how much.
const SIZE_WORDS = [/\b(size|sizes|saizi)\b/i, /\b(volume|capacity|weight|length|dimensions?|thickness|diameter|pack|bottle|loaf|width)\b/i];

export const isSizeAxisLabel = (label) => SIZE_WORDS.some((w) => w.test(String(label ?? "")));
const sizeAxisOf = (options) => {
  const axes = options?.axes ?? [];
  for (const w of SIZE_WORDS) { const hit = axes.find((a) => w.test(String(a.label ?? ""))); if (hit) return hit; }
  return null;
};
/** The sizes the seller offers: the values of their Size option (or Volume, Weight, Length... when that is how the item is sized), in their order. */
export const sizeLabels = (options) => {
  const axis = sizeAxisOf(options);
  return axis ? axis.values.map((v) => String(v.label ?? "").trim()).filter(Boolean) : [];
};
/** One of GUIDE_KINDS ids, or null, read from the product type's name and the item name (the first match in the order shoe, bag, drink, food, wood and furniture, clothing). */
export const guideKindFor = (...names) => {
  const text = names.filter(Boolean).join(" ");
  return WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
};
/** Has the seller put a "Size" row in the item's specifications? (rows are { group, label, value }) */
export const hasSizeSpec = (specs) => (Array.isArray(specs) ? specs : []).some((r) => /^\s*(sizes?|saizi)\s*$/i.test(String(r?.label ?? "")));
/** Does this item deserve a Size guide step? It does when it has a guide, sells sizes, or is a kind of item that has one. */
export const wantsGuide = ({ guide, options, typeName, itemName }) => Boolean(guide) || sizeLabels(options).length > 0 || guideKindFor(typeName, itemName) !== null;

// ---- reading amounts from size names ----
const num = (t) => Number(String(t).replace(",", "."));
/** "750ml" -> 750, "1.5 L" -> 1500, "75cl" -> 750, "2 litres" -> 2000. null when the name does not say. */
export const parseVolumeMl = (label) => {
  const m = String(label ?? "").match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|ltrs?|litres?|liters?|l)\b/i);
  if (!m) return null;
  const n = num(m[1]);
  const u = m[2].toLowerCase();
  const ml = u === "ml" ? n : u === "cl" ? n * 10 : n * 1000;
  return Number.isFinite(ml) && ml > 0 ? Math.round(ml) : null;
};
/** "400g" -> 400, "1.5kg" -> 1500, "2 lb" -> 907, "8 oz" -> 227. null when the name does not say. */
export const parseWeightG = (label) => {
  const m = String(label ?? "").match(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|kilograms?|grams?|gms?|g|lbs?|pounds?|oz|ounces?)\b/i);
  if (!m) return null;
  const n = num(m[1]);
  const u = m[2].toLowerCase();
  const g = /^(kg|kilo)/.test(u) ? n * 1000 : /^(lb|pound)/.test(u) ? n * 453.592 : /^(oz|ounce)/.test(u) ? n * 28.3495 : n;
  return Number.isFinite(g) && g > 0 ? Math.round(g) : null;
};
const READERS = { volume: parseVolumeMl, weight: parseWeightG };

/** Does the guide have a column that holds a length (so a cm / inches switch means something)? */
export const hasLengthColumn = (guide) => Boolean(guide) && guide.columns.some((c, i) => i > 0 && isLengthHeader(c));

let counter = 0;
const rid = () => `g${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const text = (v) => String(v ?? "").trim();
const sameSize = (a, b) => text(a).toLowerCase().replace(/\s+/g, " ") === text(b).toLowerCase().replace(/\s+/g, " ");
const row = (cells, width) => ({ id: rid(), cells: Array.from({ length: width }, (_, i) => text(cells?.[i]).slice(0, GUIDE_LIMITS.cell)) });

export const emptyGuide = (unit = null) => ({ unit, columns: ["Size"], rows: [] });

/**
 * Columns for a kind of item with one row per size the seller offers, the size filled in. `template.fill` also fills an amount column
 * from the size names ("750ml" gives 750); a size that does not say its amount is left blank for the seller to type.
 */
export function startGuide({ columns, sizes = [], unit = "cm", fill }) {
  const cols = (columns?.length ? columns : ["Size", "Measurement"]).slice(0, GUIDE_LIMITS.columns);
  const read = fill ? READERS[fill.read] : null;
  const rows = sizes.slice(0, GUIDE_LIMITS.rows).map((size) => {
    const cells = [size];
    if (read && fill.col > 0 && fill.col < cols.length) { const v = read(size); cells[fill.col] = v === null ? "" : String(v); }
    return row(cells, cols.length);
  });
  return { unit, columns: cols, rows };
}

/** An admin chart used as a template: its columns and rows are copied, so later changes to the template never reach this item. */
export function guideFromChart(chart, { sizes = [], keepRows = true } = {}) {
  const cols = (chart.columns ?? []).slice(0, GUIDE_LIMITS.columns).map((c) => text(c));
  const unit = chart.unit === "in" ? "in" : chart.unit === "cm" ? "cm" : null;
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

/**
 * The guide in the other unit. Only length columns change (by their header: Chest, Width, Thickness, "(cm)"...); a column of UK sizes, litres, grams,
 * slices or an age is never converted. Header words that say cm or in are switched too. A guide with no unit counts as cm.
 */
export function setUnit(guide, unit) {
  if (!GUIDE_UNITS.includes(unit)) return guide;
  const from = guide.unit ?? "cm";
  if (unit === from) return guide.unit === unit ? guide : { ...guide, unit };
  const isM = measurementColumns(guide.rows.map((r) => r.cells), guide.columns).map((m, i) => m && i > 0);
  const swap = (h, i) => (i > 0 && isLengthHeader(h) ? String(h).replace(new RegExp(`\\b${from}\\b`, "gi"), unit) : h);
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
    unit: hasLengthColumn(guide) ? (guide.unit === "in" ? "in" : "cm") : null, // no length column: no unit, so no cm / inches switch for buyers
    columns: guide.columns.map(text),
    rows: guide.rows.map((r) => guide.columns.map((_, i) => text(r.cells[i]) || GUIDE_BLANK))
  };
}

/** The editor's guide from what the database kept (null when there is none). The dash we wrote for an empty cell comes back as empty. */
export function guideFromServer(data) {
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return null;
  const cols = data.columns.map(text);
  return { unit: data.unit === "in" || data.unit === "cm" ? data.unit : null, columns: cols, rows: data.rows.map((r) => row((r ?? []).map((c) => (text(c) === GUIDE_BLANK ? "" : c)), cols.length)) };
}

/** What a buyer sees ({id, name, unit, columns, rows, own}), for the preview inside the editor. */
export const guideForBuyer = (guide) => {
  const p = guidePayload(guide);
  return p ? { id: null, name: "Size guide", category: null, ...p, overridden: false, own: true } : null;
};

