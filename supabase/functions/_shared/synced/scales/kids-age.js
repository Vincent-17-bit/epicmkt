import { defineScale } from "./define.js";
import { fail, norm, ok, splitNumber } from "./util.js";

// Stored as { value: "3-4" | "6" | "0", unit: "y" | "m" }; "newborn" is { value: "0", unit: "m" }.
const MONTH_WORDS = ["m", "mo", "mos", "month", "months", "mth", "mths"];
const YEAR_WORDS = ["y", "yr", "yrs", "year", "years", "yo"];
const unitOf = (w) => (MONTH_WORDS.includes(w) ? "m" : YEAR_WORDS.includes(w) ? "y" : null);
const MAX_MONTHS = 18 * 12;

const toMonths = (n, unit) => (unit === "y" ? n * 12 : n);
// Whole years of 2 or more are kept in years, so 24 months and 2 years are one value.
const settle = (lo, hi) => {
  const yearly = lo >= 24 && lo % 12 === 0 && (hi === null || hi % 12 === 0);
  const f = (m) => (yearly ? m / 12 : m);
  const value = hi === null || hi === lo ? String(f(lo)) : `${f(lo)}-${f(hi)}`;
  return { value, unit: yearly ? "y" : "m" };
};
const bounds = (v) => {
  const [a, b] = v.value.split("-").map(Number);
  return [toMonths(a, v.unit), toMonths(b ?? a, v.unit)];
};

export default defineScale({
  id: "kids-age",
  label: "Kids age",
  accepts: "newborn, or an age or range with a unit: 6 months, 3 years, 3-4 yrs, 12-18 months",
  display: "Newborn, 6 months, 18 months, 2 years, 3-4 years",
  units: ["months", "years"],
  examples: { valid: ["newborn", "6 months", "12-18 months", "3 years", "3-4 yrs", "24 months", "2y"], invalid: ["", "3", "3-4", "abc", "30 years", "5-3 years", "0 years", "-1 years"] },
  parse(raw, ctx = {}) {
    const text = norm(raw);
    if (/^(new\s?born|nb)$/.test(text)) return ok({ value: "0", unit: "m" });
    const range = text.match(/^(\d+)\s*(?:-|to|–)\s*(\d+)\s*(.*)$/);
    const one = splitNumber(text);
    let lo; let hi = null; let word;
    if (range) { lo = Number(range[1]); hi = Number(range[2]); word = range[3]; }
    else if (one && Number.isInteger(one.num)) { lo = one.num; word = one.rest; }
    else return fail("not-an-age", `"${String(raw).trim()}" is not an age (try 3 years or 6-12 months)`);
    let unit = unitOf(word.replace(/^[.\s]+|[.\s]+$/g, ""));
    if (word && !unit) return fail("unknown-unit", `"${word}" is not months or years`, { options: ["months", "years"] });
    if (!word) unit = unitOf(String(ctx.defaultUnit ?? "").toLowerCase());
    if (!unit) return fail("unit-required", "Say whether that is months or years", { needs: "unit", options: ["months", "years"] });
    if (hi !== null && hi <= lo) return fail("bad-range", "The second age must be higher than the first");
    const loM = toMonths(lo, unit);
    const hiM = hi === null ? null : toMonths(hi, unit);
    if (loM < 1 || (hiM ?? loM) > MAX_MONTHS) return fail("out-of-range", "Kids ages run from 1 month to 18 years");
    return ok(settle(loM, hiM));
  },
  format(value) {
    if (value.value === "0" && value.unit === "m") return "Newborn";
    const single = !value.value.includes("-");
    const n = Number(single ? value.value : value.value.split("-")[1]);
    const word = value.unit === "y" ? (single && n === 1 ? "year" : "years") : single && n === 1 ? "month" : "months";
    return `${value.value} ${word}`;
  },
  toBase: (value) => bounds(value)[0] + (bounds(value)[1] - bounds(value)[0]) / 1e4, // months; the lower bound orders, the upper bound breaks ties
  plausible: (value) => (bounds(value)[1] > 14 * 12 ? { ok: true, warn: "Over 14 years is usually an adult size" } : { ok: true })
});
