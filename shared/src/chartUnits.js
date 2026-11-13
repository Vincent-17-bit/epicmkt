// Size chart cells in cm or inches. Pure helpers shared by the buyer size chart modal and the admin chart editor.
//
// A cell is converted only when it is a measurement: "86", "86.5", "86-90", "86 - 90", "86 to 90". Anything else ("S", "Regular",
// "EU 38") is kept as it is. Results are rounded to one decimal in both units
// (a trailing ".0" is dropped), so 86 cm shows as "33.9" in and 34 in shows as "86.4" cm.

const CM_PER_IN = 2.54;
const NUM = "\\d+(?:\\.\\d+)?";
const RANGE = new RegExp(`^(${NUM})\\s*(?:-|–|to)\\s*(${NUM})$`, "i");
const SINGLE = new RegExp(`^(${NUM})$`);

const round1 = (n) => Math.round(n * 10) / 10;
const text = (n) => String(round1(n));

export const convertLength = (n, from, to) => (from === to ? n : from === "cm" ? n / CM_PER_IN : n * CM_PER_IN);

/** Convert one cell. `from` and `to` are "cm" or "in". Non-measurements come back unchanged. */
export function convertCell(cell, from, to) {
  const raw = String(cell ?? "").trim();
  if (from === to) return raw;
  const range = raw.match(RANGE);
  if (range) return `${text(convertLength(Number(range[1]), from, to))}-${text(convertLength(Number(range[2]), from, to))}`;
  const single = raw.match(SINGLE);
  if (single) return text(convertLength(Number(single[1]), from, to));
  return raw;
}

// Only a length can switch between cm and inches. A column of UK shoe sizes, litres, grams, an age or a count is numbers too, but never a length,
// so the header decides: it must say cm, in or mm, or name a length (chest, width, thickness...), and must not name another unit.
const OTHER_UNIT = /\b(ml|cl|l|ltr|litre|litres|liter|liters|g|kg|lb|lbs|oz|weight|capacity|volume|servings?|serves|slices|pieces?|pcs|age|years?|months?|abv|price|kes|ksh|stock|qty|quantity|eu|uk|us|size)\b|%/i;
const LENGTH_WORD = /\b(cm|in|inch|inches|mm|chest|bust|waist|hips?|length|width|height|depth|thickness|inseam|sleeve|shoulder|collar|neck|diameter|foot|breadth|girth|rise|thigh|drop|handle|strap|measurement|dimensions?)\b/i;
export const isLengthHeader = (header) => {
  const h = String(header ?? "");
  if (/\b(cm|in|inch|inches|mm)\b/i.test(h)) return true; // the header says so, whatever else it names
  return LENGTH_WORD.test(h) && !OTHER_UNIT.test(h);
};

/** A column is a measurement column when every non-empty cell in it is a number or a range (and, when the headers are given, a length by its header). */
export function measurementColumns(rows, columns) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const out = [];
  for (let c = 0; c < width; c++) {
    const cells = rows.map((r) => String(r[c] ?? "").trim()).filter(Boolean);
    out.push(cells.length > 0 && cells.every((x) => RANGE.test(x) || SINGLE.test(x)) && (!columns || isLengthHeader(columns[c])));
  }
  return out;
}

/** The chart in the other unit. Header text mentioning the unit ("Bust (cm)") is switched too. */
export function chartInUnit(chart, to) {
  const from = chart.unit === "in" ? "in" : "cm";
  if (from === to) return { ...chart, unit: to };
  const isM = measurementColumns(chart.rows, chart.columns).map((m, i) => m && i > 0); // column 0 holds the size labels, never converted
  const swap = (h) => String(h).replace(new RegExp(`\\b${from}\\b`, "gi"), to);
  return {
    ...chart,
    unit: to,
    columns: chart.columns.map(swap),
    rows: chart.rows.map((r) => r.map((cell, i) => (isM[i] ? convertCell(cell, from, to) : cell)))
  };
}

/** True when a unit toggle makes sense (at least one measurement column and the chart says cm or in). */
export const canToggleUnit = (chart) => (chart.unit === "cm" || chart.unit === "in") && measurementColumns(chart.rows, chart.columns).some((m, i) => m && i > 0);

/** The row index whose first cell matches the selected size label ("M", "EU 42" vs "42"), or -1. */
export function matchRow(chart, label) {
  const want = String(label ?? "").trim().toLowerCase().replace(/^(eu|uk|us)\s+/, "");
  if (!want) return -1;
  return chart.rows.findIndex((r) => String(r[0] ?? "").trim().toLowerCase().replace(/^(eu|uk|us)\s+/, "") === want);
}
