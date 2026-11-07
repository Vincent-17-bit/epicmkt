import { defineScale } from "./define.js";
import { fail, norm, num2str, ok, roundTo, splitNumber } from "./util.js";

export default defineScale({
  id: "screen-inch",
  label: "Screen size (inches)",
  accepts: "inches with or without the unit: 42, 42\", 42 inch, 42-inch, 6.7 in; centimetres are converted",
  display: "42\", 6.7\"",
  units: ["in"],
  examples: { valid: ["42", "42\"", "42 inch", "42-inch", "6.7 in", "55 inches", "107 cm"], invalid: ["", "abc", "0", "200", "42 kg", "-5"] },
  parse(raw) {
    const split = splitNumber(norm(raw));
    if (!split) return fail("not-a-number", `"${String(raw).trim()}" is not a screen size`);
    const unit = split.rest.replace(/^[-\s.]+|[.\s]+$/g, "");
    let n = split.num;
    if (unit === "cm") n = n / 2.54;
    else if (unit && !["in", "inch", "inches", '"', "''"].includes(unit)) return fail("unknown-unit", "Screen sizes are in inches (or cm)", { options: ["in", "cm"] });
    n = roundTo(n, 2);
    if (n < 1 || n > 120) return fail("out-of-range", "Screen sizes run from 1 to 120 inches");
    return ok({ value: n, unit: "in" });
  },
  format: (value) => `${num2str(value.value)}"`,
  toBase: (value) => value.value,
  plausible: (value) => (value.value < 3 || value.value > 100 ? { ok: true, warn: "Unusual screen size" } : { ok: true })
});
