// Plug-in interface: each scale is one file that default-exports defineScale({...}).
//
//   id            kebab-case scale id, e.g. "shoe"
//   label         human name
//   accepts       one line for docs/UI: what a person may type
//   display       one line for docs/UI: how values are shown
//   systems?      [{ id, label }] when the scale has more than one numbering system
//   units?        accepted unit codes (for docs and error hints)
//   examples      { valid: [...raw strings that must parse], invalid: [...raw strings that must fail] }
//   parse(raw, ctx) -> { ok: true, value } | { ok: false, error }   (a stored value or a failure; never bare text)
//   format(value, opts) -> string; for the default opts it must parse back to the same value
//   toBase(value) -> number     (the number compare() orders by: cm, ml, GB, rank ...)
//   plausible?(value) -> { ok, warn? }   scale-wide sanity check (type specific limits live in plausibility.js)
//   compare?(a, b) -> number    optional; default orders by toBase()

const REQUIRED_FNS = ["parse", "format", "toBase"];

export const defineScale = (def) => {
  if (!def || typeof def !== "object") throw new TypeError("defineScale: a definition object is required");
  if (typeof def.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(def.id)) throw new TypeError(`defineScale: bad id ${def?.id}`);
  for (const fn of REQUIRED_FNS) {
    if (typeof def[fn] !== "function") throw new TypeError(`defineScale(${def.id}): ${fn} must be a function`);
  }
  for (const key of ["label", "accepts", "display"]) {
    if (typeof def[key] !== "string" || !def[key]) throw new TypeError(`defineScale(${def.id}): ${key} is required`);
  }
  if (!def.examples || !Array.isArray(def.examples.valid) || !Array.isArray(def.examples.invalid)) {
    throw new TypeError(`defineScale(${def.id}): examples.valid and examples.invalid are required`);
  }
  const compare = def.compare ?? ((a, b) => def.toBase(a) - def.toBase(b));
  return Object.freeze({ systems: null, units: null, plausible: null, ...def, compare });
};
