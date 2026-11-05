// validateAxisValues(axisDef, values, ctx?) -> { ok, values, errors, warnings }
//   values: raw strings or stored values. Result values are stored values, merged by sizeKey, ordered by compare().
//   errors: [{ index, raw, error }]   warnings: [{ index, code, message }]
import { plausible } from "./plausibility.js";
import { MAX_AXIS_VALUES, compare, getScale, parse, sizeKey, toBase } from "./registry.js";
import { fail } from "./util.js";

// Two values of one scale, system and width with the same base amount are the same size even when typed in different units
// (1000 g and 1 kg). Values with no base amount (labels, models) are never merged this way.
const sameSizeId = (value) => {
  let base;
  try { base = toBase(value); } catch { return null; }
  const flat = Array.isArray(base) ? base : [base];
  if (!flat.length || !flat.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return `same|${value.scale}|${value.system ?? ""}|${value.width ?? ""}|${flat.map((n) => Math.round(n * 1e6) / 1e6).join(",")}`;
};

export const validateAxisValues = (axisDef, values, ctx = {}) => {
  const errors = [];
  const warnings = [];
  const scale = axisDef ? getScale(axisDef.scale) : null;
  if (!scale) {
    const e = fail("unknown-scale", `Unknown scale "${axisDef?.scale}"`).error;
    return { ok: false, values: [], errors: [{ index: -1, raw: null, error: e }], warnings };
  }
  const list = Array.isArray(values) ? values : [];
  const seen = new Map();
  const kept = [];
  list.forEach((raw, index) => {
    const res = parse(axisDef.scale, raw, ctx);
    if (!res.ok) { errors.push({ index, raw, error: res.error }); return; }
    const id = `${sizeKey(res.value)}|${res.value.width ?? ""}`;
    const dup = seen.get(id) ?? seen.get(sameSizeId(res.value));
    if (dup !== undefined) { warnings.push({ index, code: "duplicate", message: `Same as value ${dup + 1}; merged` }); return; }
    seen.set(id, index);
    const same = sameSizeId(res.value);
    if (same) seen.set(same, index);
    kept.push({ value: res.value, index });
    const p = ctx.typeId ? plausible(ctx.typeId, axisDef.key, res.value) : { ok: true };
    if (!p.ok) errors.push({ index, raw, error: { code: "implausible", message: p.warn } });
    else if (p.warn) warnings.push({ index, code: "unusual", message: p.warn });
  });
  if (list.length > MAX_AXIS_VALUES) errors.push({ index: -1, raw: null, error: { code: "too-many-values", message: `An axis holds at most ${MAX_AXIS_VALUES} values` } });
  if (scale.systems && new Set(kept.map((k) => k.value.system)).size > 1) {
    warnings.push({ index: -1, code: "mixed-systems", message: "This axis mixes sizing systems; pick one so buyers can compare" });
  }
  const out = kept.map((k) => k.value).sort(compare);
  return { ok: errors.length === 0, values: out, errors, warnings };
};
