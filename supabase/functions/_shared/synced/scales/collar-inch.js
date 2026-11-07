import { defineScale } from "./define.js";
import { fail, isMultiple, norm, num2str, ok, splitNumber } from "./util.js";

export default defineScale({
  id: "collar-inch",
  label: "Shirt collar (inches)",
  accepts: "inches in halves, 12 to 22: 15, 15.5, 15 1/2, 15½, 15\", 15 inch",
  display: "15\", 15.5\" (half-inch steps)",
  units: ["in"],
  examples: { valid: ["15", "15.5", "15 1/2", "15½", "15\"", "15.5 inch", "16 in", "14 inches"], invalid: ["", "15.3", "11.5", "22.5", "40 cm", "abc", "15 kg"] },
  parse(raw) {
    const text = norm(raw);
    const split = splitNumber(text);
    if (!split) return fail("not-a-number", `"${String(raw).trim()}" is not a collar size`);
    const unit = split.rest.replace(/^[-\s.]+|[.\s]+$/g, "");
    if (unit && !["in", "inch", "inches", '"', "''"].includes(unit)) return fail("unknown-unit", "Collar sizes are in inches", { options: ["in"] });
    if (!isMultiple(split.num, 0.5)) return fail("not-half", "Collar sizes go up in half inches (15, 15.5, 16)");
    if (split.num < 12 || split.num > 22) return fail("out-of-range", "Collar sizes run from 12 to 22 inches");
    return ok({ value: split.num, unit: "in" });
  },
  format: (value) => `${num2str(value.value)}"`,
  toBase: (value) => value.value,
  plausible: (value) => (value.value < 13 || value.value > 20 ? { ok: true, warn: "Unusual collar size" } : { ok: true })
});
