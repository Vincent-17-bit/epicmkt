import { defineScale } from "./define.js";
import { fail, norm, ok, parseNumber } from "./util.js";

export default defineScale({
  id: "apparel-numeric",
  label: "Clothing size (US numbers)",
  accepts: "whole US sizes 0 to 22, with or without 'US' (US 10, size 10)",
  display: "US 0 to US 22",
  systems: [{ id: "us", label: "US" }],
  examples: { valid: ["10", "US 10", "us10", "size 8", "0", "22"], invalid: ["", "23", "-2", "10.5", "EU 38", "UK 12", "ten"] },
  parse(raw, ctx = {}) {
    const m = norm(raw).match(/^(?:(us)\s*|size\s+)?(\d+(?:\.\d+)?)$/);
    if (!m) {
      if (/^(eu|uk|au)\b/.test(norm(raw))) return fail("unsupported-system", "Only US numeric sizes (0 to 22) are supported here", { needs: "system" });
      return fail("not-a-number", `"${String(raw).trim()}" is not a US clothing size`);
    }
    if (ctx.system && ctx.system !== "us") return fail("unsupported-system", "Only US numeric sizes (0 to 22) are supported here");
    const n = parseNumber(m[2]);
    if (!Number.isInteger(n)) return fail("not-whole", "Clothing sizes are whole numbers (0 to 22)");
    if (n < 0 || n > 22) return fail("out-of-range", "US clothing sizes run from 0 to 22");
    return ok({ system: "us", value: n });
  },
  format: (value) => `US ${value.value}`,
  toBase: (value) => value.value,
  plausible: (value) => (value.value % 2 === 1 ? { ok: true, warn: "Odd US sizes are uncommon in womenswear" } : { ok: true })
});
