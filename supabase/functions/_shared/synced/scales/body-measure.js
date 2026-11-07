import { defineScale } from "./define.js";
import { fail, norm, num2str, ok, roundTo, splitNumber } from "./util.js";

const IN_WORDS = ["in", "inch", "inches", '"', "''"];
const CM_WORDS = ["cm", "cms", "centimetre", "centimeter", "centimetres", "centimeters"];
const unitOf = (w) => (IN_WORDS.includes(w) ? "in" : CM_WORDS.includes(w) ? "cm" : null);
const toCm = (v) => (v.unit === "in" ? v.value * 2.54 : v.value);

export default defineScale({
  id: "body-measure",
  label: "Body measurement",
  accepts: "a number with cm or in (90 cm, 36\", 36 in); a bare number needs a unit",
  display: "90 cm, 36 in",
  units: ["cm", "in"],
  examples: { valid: ["90 cm", "90cm", "36 in", "36\"", "36.5 inches", "100 centimetres"], invalid: ["90", "", "abc", "90 kg", "0 cm", "400 cm", "-3 cm"] },
  parse(raw, ctx = {}) {
    const split = splitNumber(norm(raw));
    if (!split) return fail("not-a-number", `"${String(raw).trim()}" is not a measurement`);
    const word = split.rest.replace(/^[-\s.]+|[.\s]+$/g, "");
    const unit = word ? unitOf(word) : unitOf(String(ctx.defaultUnit ?? "").toLowerCase());
    if (word && !unit) return fail("unknown-unit", `"${word}" is not cm or in`, { options: ["cm", "in"] });
    if (!unit) return fail("unit-required", `Add cm or in to ${split.num}`, { needs: "unit", options: ["cm", "in"] });
    const value = roundTo(split.num, 2);
    const cm = unit === "in" ? value * 2.54 : value;
    if (cm < 5 || cm > 300) return fail("out-of-range", "That is outside the range for a body measurement (5 to 300 cm)");
    return ok({ value, unit });
  },
  format(value, opts = {}) {
    if (opts.unit && opts.unit !== value.unit && !opts.canonical) {
      const n = opts.unit === "cm" ? value.value * 2.54 : value.value / 2.54;
      return `${num2str(roundTo(n, 1))} ${opts.unit}`;
    }
    return `${num2str(value.value)} ${value.unit}`;
  },
  toBase: (value) => roundTo(toCm(value), 2)
});
