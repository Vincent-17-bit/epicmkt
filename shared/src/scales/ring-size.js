import { defineScale } from "./define.js";
import { fail, interpolate, isMultiple, norm, num2str, ok, roundTo, toHalf } from "./util.js";

// Inner circumference in mm for whole US sizes; half sizes sit halfway. UK letters step 1.27 mm (L = 51.9 mm); EU is the circumference in whole mm.
export const RING_US_MM = [
  [3, 44.2], [4, 46.5], [5, 49.3], [6, 51.8], [7, 54.4], [8, 57.2], [9, 59.7], [10, 62.1], [11, 64.7], [12, 67.2], [13, 69.7]
];
const UK_L_MM = 51.9;
const UK_STEP = 1.27;
const L_INDEX = 11;
const US_POINTS = RING_US_MM.map(([x, y]) => ({ x, y }));
const US_INV = RING_US_MM.map(([x, y]) => ({ x: y, y: x }));
const UK_MIN = 5; // F
const letter = (i) => String.fromCharCode(65 + i);

// UK values: F..Z with optional half (F, F½, G ...), then Z+1, Z+2.
const ukSteps = (v) => {
  const m = v.match(/^([A-Z])(½)?$/);
  if (m) return (m[1].charCodeAt(0) - 65 - L_INDEX) * 2 + (m[2] ? 1 : 0);
  const z = v.match(/^Z\+([12])$/);
  return z ? (25 - L_INDEX) * 2 + Number(z[1]) * 2 : null;
};
const ukMm = (v) => UK_L_MM + (ukSteps(v) * UK_STEP) / 2;
const ukFromMm = (mm) => {
  const steps = Math.round(((mm - UK_L_MM) / UK_STEP) * 2);
  const whole = L_INDEX + Math.floor(steps / 2);
  const half = steps % 2 !== 0;
  if (whole < UK_MIN || whole > 25 + 2) return null;
  if (whole > 25) return half ? null : `Z+${whole - 25}`;
  return `${letter(whole)}${half ? "½" : ""}`;
};
const toMm = (v) => (v.system === "us" ? interpolate(US_POINTS, v.value) : v.system === "eu" ? v.value : ukMm(v.value));
const fromMm = (system, mm) => {
  if (system === "eu") return Math.round(mm);
  if (system === "us") {
    const first = US_INV[0].x;
    const last = US_INV[US_INV.length - 1].x;
    if (mm < first - 0.8 || mm > last + 0.8) return null; // EU 44 is US 3 within rounding
    return toHalf(interpolate(US_INV, Math.min(Math.max(mm, first), last)));
  }
  return ukFromMm(mm);
};
const isUk = (s) => ukSteps(s) !== null;

export default defineScale({
  id: "ring-size",
  label: "Ring size",
  accepts: "US 3 to 13 in half sizes, UK letters F to Z+2 (L, L 1/2, Z+1), EU 44 to 72 (inner circumference in mm); a bare number is read as US (3 to 13) or EU (44 to 72)",
  display: "US 7, UK N½, EU 54",
  systems: [{ id: "us", label: "US" }, { id: "uk", label: "UK" }, { id: "eu", label: "EU (mm)" }],
  units: ["mm"],
  examples: { valid: ["US 7", "7.5", "us 7 1/2", "UK N", "UK N 1/2", "n½", "Z+1", "EU 54", "54", "54 mm", "uk z + 2"], invalid: ["", "US 2", "US 14", "US 7.3", "EU 30", "UK E", "UK Z+3", "20", "UK 7", "ring"] },
  parse(raw, ctx = {}) {
    const text = norm(raw).replace(/\s*\+\s*/g, "+");
    let m = text.match(/^(?:uk\s*)?([a-z])\s*(1\/2)?$/) ?? text.match(/^(?:uk\s*)?(z\+[12])$/);
    if (m) {
      const v = m[1].length > 1 ? m[1].toUpperCase() : `${m[1].toUpperCase()}${m[2] ? "½" : ""}`;
      if (!isUk(v) || v === "Z½") return fail("out-of-range", `UK ring size ${v} is outside the range (F to Z+2)`);
      if (ukSteps(v) < (UK_MIN - L_INDEX) * 2) return fail("out-of-range", "UK ring sizes start at F");
      return ok({ system: "uk", value: v });
    }
    m = text.match(/^(?:(us|uk|eu)\s*)?(\d+(?:\.\d+)?(?:\s\d\/\d)?)\s*(us|uk|eu|mm)?$/);
    if (!m) return fail("not-a-ring-size", `"${String(raw).trim()}" is not a ring size (try US 7, UK N or EU 54)`);
    let sys = m[1] || (m[3] === "mm" ? "eu" : m[3]) || null;
    const n = m[2].includes(" ") ? Number(m[2].split(" ")[0]) + Number(m[2].split(" ")[1][0]) / Number(m[2].split(" ")[1][2]) : Number(m[2]);
    if (m[1] && m[3] && m[3] !== "mm" && m[1] !== m[3]) return fail("mixed-systems", "Use one sizing system per value");
    if (!sys) sys = ctx.system && ctx.system !== "uk" ? ctx.system : n >= 3 && n <= 13 ? "us" : n >= 44 && n <= 72 ? "eu" : null;
    if (!sys) return fail("system-required", `Say which system ${num2str(n)} is in (US, UK or EU)`, { needs: "system", options: ["us", "uk", "eu"] });
    if (sys === "uk") return fail("bad-uk", "UK ring sizes are letters (L, M½), not numbers");
    if (sys === "us") {
      if (!isMultiple(n, 0.5)) return fail("not-half", "US ring sizes go up in half sizes");
      if (n < 3 || n > 13) return fail("out-of-range", "US ring sizes run from 3 to 13");
      return ok({ system: "us", value: n });
    }
    if (!Number.isInteger(n)) return fail("not-whole", "EU ring sizes are whole millimetres");
    if (n < 44 || n > 72) return fail("out-of-range", "EU ring sizes run from 44 to 72");
    return ok({ system: "eu", value: n });
  },
  format(value, opts = {}) {
    let v = value;
    if (opts.system && opts.system !== value.system && !opts.canonical) {
      const conv = fromMm(opts.system, toMm(value));
      if (conv !== null && conv !== undefined) v = { system: opts.system, value: conv };
    }
    return v.system === "us" ? `US ${num2str(v.value)}` : v.system === "uk" ? `UK ${v.value}` : `EU ${v.value}`;
  },
  toBase: (value) => roundTo(toMm(value), 2)
});
