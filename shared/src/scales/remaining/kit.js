// A03 helpers shared by the remaining measure scales. Pure code, no imports, safe for Deno and the browser.
// TODO(contract:A02): A02 owns the scale registry and its own helpers. These stay private to shared/src/scales/remaining/
// and use the stored shape {scale, system?, value, unit?, width?, shape?} from Contract v1.

export const round = (n, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Parse success / failure, as the contract: {ok, value} or {ok:false, error}. */
export const okValue = (value) => ({ ok: true, value });
export const badValue = (error) => ({ ok: false, error });
/** plausible() answers: {ok:true}, {ok:true, warn}, or {ok:false, warn} when the value cannot be right. */
export const fine = (warn) => (warn ? { ok: true, warn } : { ok: true });
export const impossible = (warn) => ({ ok: false, warn });

const seg = (s) => String(s).replace(/:/g, "-");
/** scale:system:value[:unit]. The scale id is always the first segment, so two scales can never produce the same key. */
export const keyOf = (scale, system, value, unit) =>
  [seg(scale), system == null || system === "" ? "-" : seg(system), seg(value), ...(unit ? [seg(unit)] : [])].join(":");

/** Digits, a decimal point or comma, thousands commas, 1/2 and 1 1/4. Returns NaN when it is not a plain number. */
export function parseNumber(text) {
  if (typeof text === "number") return Number.isFinite(text) ? text : NaN;
  let s = String(text ?? "").trim();
  if (!s) return NaN;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[3]) ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : NaN;
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : NaN;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

const NUM = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d[\d,]*\.?\d*|\.\d+)`;
const NUM_UNIT = new RegExp(`^${NUM}\\s*(.*)$`);
const tidy = (s) => String(s).trim().replace(/[″”“]/g, '"').replace(/[′’‘]/g, "'");

/** "20 L" -> {num: 20, unit: "L"}; "1 1/4 in" -> {num: 1.25, unit: "in"}; null when it does not start with a number. */
export function splitNumberUnit(text) {
  const m = tidy(text).match(NUM_UNIT);
  if (!m) return null;
  return { num: parseNumber(m[1]), unit: m[2].trim() };
}

/** 20 -> "20", 22.5 -> "22.5", 0.3333333 -> "0.333". At most 3 decimals, no trailing zeros. */
export const fmtNum = (n) => String(round(n, 3));

export const unitKey = (u) => String(u ?? "").toLowerCase().replace(/\s+/g, "").replace(/\.$/, "").replace(/\^2/g, "2").replace(/²/g, "2");

/** Lower case, accents removed, '+' and '&' spelled out, everything else non-alphanumeric becomes '-'. Never contains ':'. */
export function slugKey(text) {
  return String(text ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\+/g, " plus ").replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

export const cleanLabel = (text) =>
  String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Compare two numbers or two equal-length number arrays (lexicographic). null sorts last. */
export function compareBase(a, b) {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = [].concat(a), y = [].concat(b);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      const c = cmp(x[i] ?? -Infinity, y[i] ?? -Infinity);
      if (c) return c;
    }
    return 0;
  }
  return cmp(a, b);
}

/**
 * A scale measured in one family of units (length, volume, weight ...).
 * def: {id, base, units: {unit: {to, label, aliases[]}}, assumeDefault?, defaultUnit, hard: [min, max] (base units),
 *       warn: [min, max] (base units), ranges?: {"typeId/axisKey" | "typeId": [min, max]}, words?: {word: {value, unit}},
 *       what?: "a length"}
 */
export function unitScale(def) {
  const aliasMap = new Map();
  for (const [unit, u] of Object.entries(def.units)) {
    aliasMap.set(unitKey(unit), unit);
    aliasMap.set(unitKey(u.label ?? unit), unit);
    for (const a of u.aliases ?? []) aliasMap.set(unitKey(a), unit);
  }
  const unitNames = Object.keys(def.units);
  const resolve = (text) => aliasMap.get(unitKey(text)) ?? null;
  const toBase = (v) => (v && def.units[v.unit] ? round(Number(v.value) * def.units[v.unit].to, 9) : null);
  const labelOf = (unit, n) => {
    const u = def.units[unit];
    const l = u.label ?? unit;
    return u.plural && n !== 1 ? u.plural : l;
  };
  const stored = (num, unit) => ({ scale: def.id, value: round(num), unit });

  function parse(raw, ctx = {}) {
    let num, unit;
    if (raw && typeof raw === "object") {
      if (raw.scale && raw.scale !== def.id) return badValue(`That is not ${def.what ?? "a " + def.id} value.`);
      num = parseNumber(raw.value);
      unit = raw.unit == null || raw.unit === "" ? null : resolve(raw.unit);
      if (raw.unit && !unit) return badValue(`Unknown unit "${raw.unit}". Use ${unitNames.join(", ")}.`);
    } else if (typeof raw === "number") {
      num = parseNumber(raw);
      unit = null;
    } else {
      const text = tidy(raw ?? "");
      if (!text) return badValue("Enter a value.");
      const word = def.words?.[text.toLowerCase()];
      if (word) { num = word.value; unit = word.unit; }
      else {
        const split = splitNumberUnit(text);
        if (!split) return badValue(`Enter ${def.what ?? "a value"}, for example 5 ${unitNames[0]}.`);
        num = split.num;
        if (split.unit) {
          unit = resolve(split.unit);
          if (!unit) return badValue(`Unknown unit "${split.unit}". Use ${unitNames.join(", ")}.`);
        }
      }
    }
    if (!Number.isFinite(num)) return badValue("That is not a number.");
    if (!unit) {
      const hint = ctx.unit ? resolve(ctx.unit) : null;
      if (hint) unit = hint;
      else if (def.assumeDefault) unit = def.defaultUnit;
      else return badValue(`Add a unit: ${unitNames.join(", ")}.`);
    }
    if (num <= 0) return badValue("Must be more than zero.");
    const base = num * def.units[unit].to;
    if (base < def.hard[0] || base > def.hard[1]) return badValue(`${fmtNum(num)} ${labelOf(unit, num)} is not possible here. Check the number and the unit.`);
    return okValue(stored(num, unit));
  }

  function convert(value, unit) {
    const to = resolve(unit);
    if (!to) return null;
    return { value: round((Number(value.value) * def.units[value.unit].to) / def.units[to].to, 3), unit: to };
  }

  function format(value, opts = {}) {
    if (!value || !def.units[value.unit]) return "";
    const v = opts.unit ? convert(value, opts.unit) ?? { value: value.value, unit: value.unit } : value;
    return `${fmtNum(v.value)} ${labelOf(v.unit, v.value)}`;
  }

  function plausible(typeId, axisKey, value) {
    const base = toBase(value);
    if (base == null || !(base > 0)) return impossible(`${def.id}: not a valid value.`);
    if (base < def.hard[0] || base > def.hard[1]) return impossible(`${format(value)} cannot be right here. Check the unit.`);
    const range = def.ranges?.[`${typeId}/${axisKey}`] ?? def.ranges?.[typeId] ?? def.warn;
    if (base < range[0]) return fine(`${format(value)} is very small for this. Check the unit.`);
    if (base > range[1]) return fine(`${format(value)} is very large for this. Check the unit.`);
    return fine();
  }

  return {
    id: def.id, base: def.base, units: unitNames, parse, format, convert,
    sizeKey: (v) => keyOf(def.id, v.system, String(round(v.value)), v.unit),
    compare: (a, b) => compareBase(toBase(a), toBase(b)),
    toBase, plausible
  };
}
