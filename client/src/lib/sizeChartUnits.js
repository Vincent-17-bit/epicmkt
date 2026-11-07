// Size chart unit toggle (cm / in). Pure. A chart stores its rows as text in the chart's own unit (chart.unit). Only columns that are
// lengths are converted: a column whose header names a unit "(cm)" / "(in)", or any column of a chart whose unit is cm or in, unless the
// header is a label column (Size, EU, UK, US..., Age). Anything that is not a plain number is left as typed (XS, "2-3 years").
const LABEL_COLUMN = /^(size|eu|uk|us|age|shirt size)\b/i;
const HEADER_UNIT = /\((cm|in)\)\s*$/i;
const IN_CM = 2.54;

export const canToggleUnit = (chart) => Boolean(chart) && (chart.unit === "cm" || chart.unit === "in");

const isNumber = (s) => /^-?\d+(\.\d+)?$/.test(String(s).trim());
const round1 = (n) => String(Math.round(n * 10) / 10);

/** Which unit a column is in right now: its header's "(cm)" / "(in)", else the chart's unit for a length column, else null (a label column). */
function columnUnit(chart, header) {
  const m = HEADER_UNIT.exec(header);
  if (m) return m[1].toLowerCase();
  if (LABEL_COLUMN.test(header)) return null;
  return chart.unit === "cm" || chart.unit === "in" ? chart.unit : null;
}

const convert = (n, from, to) => (from === to ? n : from === "cm" ? n / IN_CM : n * IN_CM);

/** The chart as the buyer should see it in `unit`: { columns, rows, unit }. A column already in `unit` is untouched, so "Collar (in)" and
 *  "Collar (cm)" side by side stay what they say. */
export function chartInUnit(chart, unit) {
  if (!chart) return { columns: [], rows: [], unit };
  if (!canToggleUnit(chart) || (unit !== "cm" && unit !== "in")) return { columns: chart.columns, rows: chart.rows, unit: chart.unit };
  const units = chart.columns.map((h) => columnUnit(chart, h));
  const columns = chart.columns.map((h, i) => (units[i] && HEADER_UNIT.test(h) && units[i] !== unit ? h.replace(HEADER_UNIT, `(${unit})`) : h));
  const rows = chart.rows.map((row) => row.map((cell, i) => (units[i] && units[i] !== unit && isNumber(cell) ? round1(convert(Number(cell), units[i], unit)) : cell)));
  return { columns, rows, unit };
}
