// The logic behind the size and measurement editors (B04, B05). Pure: no React. Every value goes through the shared scales API,
// so what is stored is always {scale, system?, value, unit?, width?, shape?}, never bare text.
import { scales, shoeSummary } from "@epicmkt/shared";

const { DIMENSION_PROFILES, dimensionProfileId, format, getScale, parse, plausible, sizeKey, toBase } = scales;

export const MAX_VALUES = 60;

/**
 * Two values are the same entry when they are the same size: "20 litres" and "20 L" are one value, and so are 5 m and 500 cm. A value with a
 * unit is compared by its base amount (the scale's toBase); everything else, and shoes (a seller who types EU 42 and UK 8 meant two entries),
 * by sizeKey. A shoe's width is part of the entry.
 */
export function mergeKey(v) {
  const base = v?.unit && v.scale !== "shoe" ? toBase(v) : null;
  const core = typeof base === "number" && Number.isFinite(base) ? `${v.scale}:${v.system ?? "-"}:${base}` : sizeKey(v);
  return `${core}${v?.width ? `:${v.width}` : ""}`;
}

/** Adds one value; a duplicate is not added twice. Returns { values, added, merged }. */
export function addValue(values, value) {
  if (values.some((v) => mergeKey(v) === mergeKey(value))) return { values, added: false, merged: true };
  if (values.length >= MAX_VALUES) return { values, added: false, merged: false, full: true };
  return { values: [...values, value], added: true, merged: false };
}

export function moveValue(values, index, by) {
  const to = index + by;
  if (index < 0 || index >= values.length || to < 0 || to >= values.length) return values;
  const next = [...values];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
export const removeValue = (values, index) => values.filter((_, i) => i !== index);

/** What the buyer will read for a value. `typeId` lets dimensions label their parts ("L 120 × W 60 × H 75 cm"). */
export const previewOf = (value, { typeId = null, labels = false } = {}) => format(value, { typeId, labels });

/** The units a scale takes, for the "which unit?" question. Prefers the ones the parse error named. */
export function unitOptions(scaleId, error) {
  const named = Array.isArray(error?.options) ? error.options : null;
  const units = named ?? getScale(scaleId)?.units ?? [];
  return units.map((u) => String(u));
}

/**
 * Reads what was typed into one or more values (commas, semicolons and new lines separate them).
 * Returns { ok:true, values } or { ok:false, error, text, needsUnit, units } for the FIRST entry that does not read.
 * "20" for a scale that needs a unit is not an error to hide: it asks (needsUnit) and the caller offers the units.
 */
export function readEntries(scaleId, text, ctx = {}) {
  const parts = String(text ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: { code: "empty", message: "Type a value first." }, text: "", needsUnit: false, units: [] };
  const values = [];
  for (const part of parts) {
    const r = parse(scaleId, part, ctx);
    if (!r.ok) {
      const needsUnit = r.error?.needs === "unit";
      return { ok: false, error: r.error, text: part, needsUnit, units: needsUnit ? unitOptions(scaleId, r.error) : [] };
    }
    values.push(r.value);
  }
  return { ok: true, values };
}

/** Plausibility warning for one value, or "". It warns and never blocks. Hard-impossible values are refused earlier, by parse. */
export function warningFor(typeId, axisKey, value) {
  if (!typeId || !value) return "";
  const r = plausible(typeId, axisKey, value);
  return r?.ok && r.warn ? r.warn : "";
}

// ---- quick picks ----

export const SHOE_SYSTEMS = Object.freeze([
  { id: "eu", label: "EU" },
  { id: "uk", label: "UK" },
  { id: "us-m", label: "US men" },
  { id: "us-w", label: "US women" },
  { id: "cm", label: "cm" },
]);

/**
 * "EU 38 to 47 in half steps": every size from `from` to `to`, `step` apart, in one system. Returns { ok, values } or { ok:false, error }.
 * Sizes the shoe chart does not know are skipped and counted (`skipped`), so a range that runs past the chart still fills what it can.
 */
export function shoeRange({ system, from, to, step }) {
  if ([from, to, step].some((x) => String(x ?? "").trim() === "")) return { ok: false, error: "Enter a start, an end and a step." };
  const a = Number(from);
  const b = Number(to);
  const st = Number(step);
  if (![a, b, st].every(Number.isFinite) || st <= 0) return { ok: false, error: "Enter a start, an end and a step." };
  if (b < a) return { ok: false, error: "The end must be the same as or more than the start." };
  const count = Math.floor((b - a) / st + 1e-9) + 1;
  if (count > MAX_VALUES) return { ok: false, error: `That is ${count} sizes. Pick a range of ${MAX_VALUES} or fewer.` };
  const values = [];
  let skipped = 0;
  for (let i = 0; i < count; i += 1) {
    const n = Math.round((a + i * st) * 100) / 100;
    const r = parse("shoe", String(n), { system });
    if (r.ok) values.push(r.value);
    else skipped += 1;
  }
  if (values.length === 0) return { ok: false, error: "None of those sizes are in the shoe chart. Check the system." };
  return { ok: true, values, skipped };
}

/** The same range for a whole-number scale such as apparel-numeric or tyre widths: "US 4 to 16 in steps of 2". */
export function numberRange(scaleId, { from, to, step }, ctx = {}) {
  if ([from, to, step].some((x) => String(x ?? "").trim() === "")) return { ok: false, error: "Enter a start, an end and a step." };
  const a = Number(from);
  const b = Number(to);
  const st = Number(step);
  if (![a, b, st].every(Number.isFinite) || st <= 0 || b < a) return { ok: false, error: "Enter a start, an end and a step." };
  const count = Math.floor((b - a) / st + 1e-9) + 1;
  if (count > MAX_VALUES) return { ok: false, error: `That is ${count} values. Pick a range of ${MAX_VALUES} or fewer.` };
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const r = parse(scaleId, String(Math.round((a + i * st) * 100) / 100), ctx);
    if (!r.ok) return { ok: false, error: r.error.message };
    values.push(r.value);
  }
  return { ok: true, values };
}

/** "EU 42 · UK 8 · US 9 (about 27 cm)" under a shoe chip, so a seller sees what a size means in the other systems. */
export const shoeHelpFor = (value) => shoeSummary(value);

// ---- dimensions ----

export const DIMENSION_UNITS = Object.freeze(["cm", "m", "in", "ft"]);
export const SHAPES = Object.freeze([{ id: "rectangular", label: "Rectangular" }, { id: "round", label: "Round" }]);

/** The boxes to show for a product type and shape: [{ label: "Length", short: "L" }...] in entry order. */
export function dimensionBoxes(typeId, shape) {
  const profile = DIMENSION_PROFILES[dimensionProfileId(typeId, shape)];
  return profile.labels.map((label, i) => ({ label, short: profile.short[i] ?? label[0] }));
}

/** Reads the typed numbers of a dimensions entry. `numbers` is one string per box. */
export function readDimensions({ typeId, shape, unit, numbers }) {
  const filled = numbers.map((n) => String(n ?? "").trim());
  if (filled.every((n) => n === "")) return { ok: false, error: { code: "empty", message: "Enter the size." }, empty: true };
  return parse("dimensions", filled.filter(Boolean).join(" x "), { typeId, shape, unit });
}
