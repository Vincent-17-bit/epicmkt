import { fail, ok } from "./util.js";

const SCALES = new Map();

export const registerScale = (scale) => {
  if (!scale || typeof scale.id !== "string") throw new TypeError("registerScale: pass the result of defineScale()");
  if (SCALES.has(scale.id)) throw new Error(`scale already registered: ${scale.id}`);
  SCALES.set(scale.id, scale);
  return scale;
};
export const getScale = (id) => SCALES.get(id) ?? null;
export const listScales = () => [...SCALES.values()];

export const MAX_AXIS_VALUES = 40; // Contract v1 AxisDef limit

const isStored = (v) => v && typeof v === "object" && typeof v.scale === "string" && "value" in v;
const unknownScale = (id) => fail("unknown-scale", `Unknown scale "${id}"`, { scale: id });

/**
 * parse(scaleId, raw, ctx) -> { ok: true, value } | { ok: false, error }
 * raw is what a person typed, or an already stored value (it is re-validated and normalised).
 * ctx: { system?, defaultUnit?, group? } (what the axis or form already knows).
 */
export const parse = (scaleId, raw, ctx = {}) => {
  const scale = getScale(scaleId);
  if (!scale) return unknownScale(scaleId);
  if (isStored(raw)) {
    if (raw.scale !== scaleId) return fail("scale-mismatch", `Value is a ${raw.scale} value, not ${scaleId}`);
    const res = scale.acceptsStored
      ? scale.parse(raw, ctx)
      : scale.parse(scale.format(raw, { canonical: true }), { ...ctx, system: raw.system ?? ctx.system });
    return res.ok ? ok({ scale: scaleId, ...res.value }) : res;
  }
  if (typeof raw !== "string" && typeof raw !== "number") return fail("empty", "Enter a value");
  if (String(raw).trim() === "") return fail("empty", "Enter a value");
  const res = scale.parse(String(raw), ctx);
  return res.ok ? ok({ scale: scaleId, ...res.value }) : res;
};

const scaleOf = (value) => {
  const scale = isStored(value) ? getScale(value.scale) : null;
  if (!scale) throw new TypeError(`not a stored scale value: ${JSON.stringify(value)}`);
  return scale;
};

export const format = (value, opts = {}) => scaleOf(value).format(value, opts);
export const toBase = (value) => scaleOf(value).toBase(value);

/** scale:system:value[:unit]; "-" stands for no system (same as the A03 scales). Width and shape are not part of the key. */
export const sizeKey = (value) => {
  const scale = scaleOf(value);
  if (scale.sizeKey) return scale.sizeKey(value);
  const parts = [value.scale, value.system || "-", String(value.value)];
  if (value.unit) parts.push(value.unit);
  return parts.join(":");
};

/** Total order: by scale id first (so mixed lists still sort), then by the scale's own compare. */
export const compare = (a, b) => {
  const sa = scaleOf(a);
  scaleOf(b);
  if (a.scale !== b.scale) return a.scale < b.scale ? -1 : 1;
  return sa.compare(a, b);
};

// A03 (and any lane) writes scales as plain objects {id, units, parse(raw, ctx), format, sizeKey, compare, toBase, plausible(typeId, axisKey, value)}
// whose parse errors are strings. adoptScale() fits one to this registry: errors become { code, message }, ctx.defaultUnit is passed as ctx.unit.
// TODO(contract:A03): when the A03 scales return { code, message, needs } themselves, drop the message sniffing below.
const toError = (e) => {
  if (e && typeof e === "object") return e;
  const message = String(e ?? "Not a valid value");
  return /\badd a unit\b/i.test(message) ? { code: "unit-required", message, needs: "unit" } : { code: "invalid", message };
};
export const adoptScale = (a) => {
  if (!a || typeof a.id !== "string" || ["parse", "format", "toBase"].some((f) => typeof a[f] !== "function")) {
    throw new TypeError("adoptScale: needs id, parse, format and toBase");
  }
  return Object.freeze({
    id: a.id, label: a.label ?? a.id, accepts: a.accepts ?? "", display: a.display ?? "", systems: null,
    units: a.units ? (Array.isArray(a.units) ? a.units : Object.keys(a.units)) : null,
    examples: { valid: [], invalid: [] }, external: true, acceptsStored: true,
    parse: (raw, ctx = {}) => {
      const res = a.parse(raw, { ...ctx, unit: ctx.unit ?? ctx.defaultUnit });
      return res.ok ? res : { ok: false, error: toError(res.error) };
    },
    format: (v, o) => a.format(v, o),
    toBase: (v) => a.toBase(v),
    compare: typeof a.compare === "function" ? (x, y) => a.compare(x, y) : (x, y) => a.toBase(x) - a.toBase(y),
    sizeKey: typeof a.sizeKey === "function" ? (v) => a.sizeKey(v) : null,
    plausible: null,
    plausibleFor: typeof a.plausible === "function" ? (t, k, v) => a.plausible(t, k, v) : null
  });
};

export { isStored };
