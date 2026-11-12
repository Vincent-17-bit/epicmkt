// Made to measure (Prompts 3.4 and 3.7), optional: tailors and furniture makers let the buyer give measurements instead of picking a size.
// Pure functions shared by the seller editor and the buyer page.
//
//   config = {
//     enabled: true,
//     axisKey: "size",                       // the option the flag is on; the buyer sees "Made to measure" beside its values
//     fields: [{ key, label, unit: "cm" | "in", min, max, required }],   // body measurements or dimensions the buyer must give
//     price: { mode: "fixed", base }                                       // one price for any made-to-measure order
//          | { mode: "per-extra", base, perUnit, field, over }             // base, plus perUnit for each unit of `field` above `over`
//   }
// Money is whole KES. Measurements are kept in the field's own unit; typed inches are converted.

export const CUSTOM_SIZE_LIMITS = { fields: 6, label: 30, max: 10000, note: 200 };
export const CUSTOM_SIZE_UNITS = ["cm", "in"];
export const BODY_FIELDS = [
  { label: "Bust", unit: "cm", min: 60, max: 200 },
  { label: "Waist", unit: "cm", min: 40, max: 200 },
  { label: "Hips", unit: "cm", min: 60, max: 220 },
  { label: "Height", unit: "cm", min: 90, max: 230 },
];
export const DIMENSION_FIELDS = [
  { label: "Width", unit: "cm", min: 10, max: 600 },
  { label: "Depth", unit: "cm", min: 10, max: 600 },
  { label: "Height", unit: "cm", min: 10, max: 400 },
];

const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "field";
const whole = (v) => (/^\d{1,9}$/.test(String(v ?? "").replace(/,/g, "").trim()) ? Number(String(v).replace(/,/g, "").trim()) : null);

export const emptyCustomSize = (axisKey = "") => ({ enabled: true, axisKey, fields: [], price: { mode: "fixed", base: "" } });

export const fieldFrom = (preset) => ({ key: slug(preset.label), label: preset.label, unit: preset.unit, min: preset.min, max: preset.max, required: true });

// Problems keyed by path ("fields", "fields.0.label", "price.base", ...). A disabled config has none.
export const validateCustomSize = (cfg) => {
  const errors = {};
  if (!cfg || cfg.enabled === false) return { ok: true, errors };
  const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
  if (fields.length < 1) errors.fields = "Ask for at least one measurement.";
  if (fields.length > CUSTOM_SIZE_LIMITS.fields) errors.fields = `Ask for ${CUSTOM_SIZE_LIMITS.fields} measurements or fewer.`;
  const seen = new Set();
  fields.forEach((f, i) => {
    const label = String(f.label ?? "").trim();
    if (!label || label.length > CUSTOM_SIZE_LIMITS.label) errors[`fields.${i}.label`] = `Name the measurement in ${CUSTOM_SIZE_LIMITS.label} characters or fewer.`;
    else if (seen.has(label.toLowerCase())) errors[`fields.${i}.label`] = "Two measurements cannot share a name.";
    seen.add(label.toLowerCase());
    if (!CUSTOM_SIZE_UNITS.includes(f.unit)) errors[`fields.${i}.unit`] = "Choose cm or in.";
    const lo = Number(f.min);
    const hi = Number(f.max);
    if (!(lo > 0) || !(hi > lo) || hi > CUSTOM_SIZE_LIMITS.max) errors[`fields.${i}.max`] = "Give a smallest and a larger biggest value, such as 60 and 200.";
  });
  const price = cfg.price ?? {};
  if (whole(price.base) === null) errors["price.base"] = "Enter the price in whole KES, such as 4500.";
  if (price.mode === "per-extra") {
    if (whole(price.perUnit) === null) errors["price.perUnit"] = "Enter the extra price for each unit, such as 50.";
    if (!fields.some((f) => f.key === price.field)) errors["price.field"] = "Choose which measurement adds to the price.";
    if (whole(price.over) === null) errors["price.over"] = "Enter the size where the extra price starts, such as 100.";
  } else if (price.mode !== "fixed") errors["price.mode"] = "Choose how made to measure is priced.";
  return { ok: Object.keys(errors).length === 0, errors };
};

// What a buyer typed -> the number in the field's unit, or { error }. "92", "92 cm", "36 in", 36" are all read.
export const parseMeasurement = (field, raw) => {
  const text = String(raw ?? "").trim().toLowerCase().replace(/,/g, ".");
  const m = /^(\d+(?:\.\d+)?)\s*(cm|in|inch|inches|")?$/.exec(text);
  if (!m) return { error: `Enter ${field.label.toLowerCase()} as a number, such as ${Math.round((Number(field.min) + Number(field.max)) / 2)}.` };
  let n = Number(m[1]);
  const typed = m[2] === undefined ? field.unit : m[2] === "cm" ? "cm" : "in";
  if (typed !== field.unit) n = typed === "in" ? n * 2.54 : n / 2.54;
  n = Math.round(n * 10) / 10;
  if (n < Number(field.min) || n > Number(field.max)) return { error: `${field.label} should be between ${field.min} and ${field.max} ${field.unit}.` };
  return { value: n };
};

// The buyer's values ({ key: "92" }) -> { ok, values, errors }. A required field left blank is an error; an optional blank is skipped.
export const checkMeasurements = (cfg, raw = {}) => {
  const values = {};
  const errors = {};
  for (const f of cfg?.fields ?? []) {
    const text = String(raw[f.key] ?? "").trim();
    if (text === "") { if (f.required !== false) errors[f.key] = `Enter ${f.label.toLowerCase()} in ${f.unit}.`; continue; }
    const r = parseMeasurement(f, text);
    if (r.error) errors[f.key] = r.error; else values[f.key] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
};

// Whole KES for these measurements, or null when the rule cannot be applied yet.
export const customPrice = (cfg, values = {}) => {
  const base = whole(cfg?.price?.base);
  if (base === null) return null;
  if (cfg.price.mode !== "per-extra") return base;
  const n = values[cfg.price.field];
  const per = whole(cfg.price.perUnit);
  const over = whole(cfg.price.over);
  if (typeof n !== "number" || per === null || over === null) return null;
  return base + Math.ceil(Math.max(0, n - over)) * per;
};

// Exactly what the buyer chose, for the message to the seller: "Wrap dress, Made to measure: Bust 92 cm, Waist 74 cm, KES 4,500".
export const customSizeMessage = (itemName, cfg, values, price, fmt = (n) => `KES ${n.toLocaleString("en-KE")}`) => {
  const parts = (cfg?.fields ?? []).filter((f) => typeof values?.[f.key] === "number").map((f) => `${f.label} ${values[f.key]} ${f.unit}`);
  return [itemName, `Made to measure: ${parts.join(", ")}`, price === null || price === undefined ? null : fmt(price)].filter(Boolean).join(", ");
};

// TODO(contract:3.1) Stays false until the data prompt stores `customSize` (see docs/requests/2026-11-07-b07-to-data-custom-size-storage.md).
// While false the seller editor shows no control and the buyer page shows no made-to-measure choice, so nothing is offered that would not be kept.
export const CUSTOM_SIZE_STORED = false;

// Form (typed text) -> what is saved: numbers, no editing leftovers. null when the seller has it off.
export const customSizePayload = (cfg) => {
  if (!cfg || cfg.enabled === false) return null;
  const n = (v) => Number(String(v).replace(/,/g, ""));
  const p = cfg.price ?? {};
  return {
    enabled: true, axisKey: cfg.axisKey,
    fields: cfg.fields.map((f) => ({ key: f.key, label: String(f.label).trim(), unit: f.unit, min: n(f.min), max: n(f.max), required: f.required !== false })),
    price: p.mode === "per-extra" ? { mode: "per-extra", base: n(p.base), perUnit: n(p.perUnit), field: p.field, over: n(p.over) } : { mode: "fixed", base: n(p.base) },
  };
};
