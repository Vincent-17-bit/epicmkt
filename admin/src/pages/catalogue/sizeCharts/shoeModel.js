// The shoe conversion table editor, with no React. State: { adult: [row], kids: [row] }, a row being text cells { eu, uk, usM, usW, cm }.
// Saving sends numbers: { adult: [{eu, uk, usM, usW, cm}], kids: [...] } checked by cleanShoeConversion (the database rules).
import { SHOE_CHART_LIMITS, cleanShoeConversion, convertShoe, scales, shoeChartFrom, shoeTable } from "@epicmkt/shared";

const SHOE_CHART = scales.SHOE_CHART;

export const FIELDS = ["eu", "uk", "usM", "usW", "cm"];
export const FIELD_LABELS = { eu: "EU", uk: "UK", usM: "US men", usW: "US women", cm: "Foot length (cm)" };
export const KIDS_FIELDS = ["eu", "cm"];
export const GROUPS = [{ id: "adult", label: "Adult" }, { id: "kids", label: "Kids" }];
export const MAX_ROWS = SHOE_CHART_LIMITS.rows;

const text = (n) => (n === null || n === undefined ? "" : String(n));

export const fromChart = (chart) => {
  const c = shoeChartFrom(chart);
  const row = (r) => Object.fromEntries(FIELDS.map((f) => [f, text(r[f])]));
  return { adult: c.adult.map(row), kids: (c.kids ?? []).map(row) };
};

export const defaultState = () => fromChart(SHOE_CHART);

/** The numbers as the database stores them. An empty cell is null; text that is not a number stays NaN so validation names the row. */
export function toChart(state) {
  const read = (v) => {
    const t = String(v ?? "").trim().replace(",", ".");
    if (t === "") return null;
    return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : NaN;
  };
  const row = (r) => Object.fromEntries(FIELDS.map((f) => [f, read(r[f])]));
  return { adult: state.adult.map(row), kids: state.kids.map(row) };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isDirty = (state, original) => !same(state, original);

export function editCell(state, group, r, field, value) {
  if (!state[group]?.[r] || !FIELDS.includes(field)) return state;
  return { ...state, [group]: state[group].map((row, i) => (i === r ? { ...row, [field]: String(value ?? "").slice(0, 6) } : row)) };
}

/** Adds a row after `after` (default: the end). The new row continues the last one by one EU size and 0.7 cm, so a long table is quick to extend. */
export function addRow(state, group, after = state[group].length - 1) {
  const rows = state[group];
  if (rows.length >= MAX_ROWS) return { state, index: -1 };
  const at = Math.min(Math.max(after + 1, 0), rows.length);
  const prev = rows[at - 1];
  const bump = (v, by) => (v !== "" && Number.isFinite(Number(v)) ? String(Math.round((Number(v) + by) * 10) / 10) : "");
  const row = prev ? { eu: bump(prev.eu, 1), uk: group === "adult" ? bump(prev.uk, 1) : "", usM: group === "adult" ? bump(prev.usM, 1) : "", usW: group === "adult" ? bump(prev.usW, 1) : "", cm: bump(prev.cm, 0.7) } : Object.fromEntries(FIELDS.map((f) => [f, ""]));
  return { state: { ...state, [group]: [...rows.slice(0, at), row, ...rows.slice(at)] }, index: at };
}

export function removeRow(state, group, r) {
  const min = group === "adult" ? 2 : 0;
  if (!state[group]?.[r] || state[group].length <= min) return state;
  return { ...state, [group]: state[group].filter((_, i) => i !== r) };
}

/**
 * validate(state) -> { ok, messages: [text], rows: { "adult:3": [text] }, general: [text], value }
 * `rows` maps each message from cleanShoeConversion ("Adult row 3: ...") to its row so the screen can show it beside the row.
 */
export function validate(state) {
  const chart = toChart(state);
  const hasBadNumber = [...chart.adult, ...chart.kids].some((r) => FIELDS.some((f) => Number.isNaN(r[f])));
  // NaN is not a number to the checker, which then reports the row; a typo gives the same message as a blank.
  const result = cleanShoeConversion(chart);
  const rows = {};
  const general = [];
  for (const message of result.errors) {
    const m = message.match(/^(Adult|Kids) row (\d+): (.*)$/);
    if (m) (rows[`${m[1].toLowerCase()}:${Number(m[2]) - 1}`] ??= []).push(m[3]);
    else general.push(message);
  }
  if (hasBadNumber && result.ok) general.push("Use numbers only.");
  return { ok: result.ok && !hasBadNumber, messages: result.errors, rows, general, value: result.value };
}

export const summary = (v) => (v.ok ? "Ready to save." : `Fix ${v.messages.length} ${v.messages.length === 1 ? "problem" : "problems"} before saving.`);

/** What a buyer sees for an audience, from the table as edited (the last good version when the edit does not validate). */
export function preview(state, audience, fallback = SHOE_CHART) {
  const v = validate(state);
  const chart = v.ok ? shoeChartFrom({ adult: v.value.adult, kids: v.value.kids }) : fallback;
  return { valid: v.ok, rows: shoeTable(chart, audience), chart };
}

/** "Try a size": text such as "EU 42" or "UK 8" in every system, using the table as edited. Returns { ok, lines } or { ok:false, message }. */
export function tryConvert(state, input) {
  const v = validate(state);
  if (!v.ok) return { ok: false, message: "Fix the table first, then try a size." };
  const chart = shoeChartFrom({ adult: v.value.adult, kids: v.value.kids });
  const lines = [];
  let first = null;
  for (const system of ["eu", "uk", "us-m", "us-w", "cm"]) {
    const r = convertShoe(String(input ?? "").trim(), system, chart);
    if (!r.ok) {
      if (system === "eu" && r.error?.code !== "no-equivalent") return { ok: false, message: r.error?.message ?? "Enter a size such as EU 42 or UK 8." };
      continue;
    }
    first ??= r.value;
    lines.push({ system, text: r.value.system === "cm" ? `${r.value.value} cm` : formatSystem(system, r.value.value) });
  }
  return lines.length ? { ok: true, lines } : { ok: false, message: "That size is not in the table." };
}

const formatSystem = (system, n) => (system === "eu" ? `EU ${n}` : system === "uk" ? `UK ${n}` : system === "us-m" ? `US ${n} (men)` : `US ${n} (women)`);
