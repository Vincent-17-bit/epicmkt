// Factory for unit-bearing measures (volume, weight, storage): "20 litres" -> 20 L, "20" -> asks for a unit.
import { defineScale } from "./define.js";
import { fail, norm, ok, roundTo, splitNumber } from "./util.js";

/**
 * units: [{ code, factor, words: [...] }] where factor converts the unit to the base unit.
 * canonicalize(baseAmount) -> { value, unit }   picks the one stored form so equal amounts share a sizeKey.
 * formatBase(baseAmount, opts) -> string
 */
export const createMeasure = ({ id, label, accepts, display, units, canonicalize, formatBase, toBaseAmount, min, max, examples, plausible }) => {
  const byWord = new Map();
  for (const u of units) for (const w of [u.code.toLowerCase(), ...u.words]) byWord.set(w, u);
  const unitCodes = units.map((u) => u.code);

  const findUnit = (text) => {
    const w = text.replace(/^[-\s.]+|[.\s]+$/g, "");
    return byWord.get(w) ?? byWord.get(w.replace(/s$/, "")) ?? null;
  };

  return defineScale({
    id, label, accepts, display, units: unitCodes, examples,
    plausible: plausible ?? null,
    parse(raw, ctx = {}) {
      const text = norm(raw);
      const split = splitNumber(text);
      if (!split) return fail("not-a-number", `${label}: start with a number, e.g. ${examples.valid[0]}`);
      let unit = null;
      if (split.rest) {
        unit = findUnit(split.rest);
        if (!unit) return fail("unknown-unit", `"${split.rest}" is not a unit for ${label} (use ${unitCodes.join(", ")})`, { options: unitCodes });
      } else {
        const dflt = ctx.defaultUnit ?? ctx.unit;
        unit = dflt ? findUnit(String(dflt).toLowerCase()) : null;
        if (!unit) return fail("unit-required", `Add a unit to ${split.num} (${unitCodes.join(", ")})`, { needs: "unit", options: unitCodes });
      }
      const amount = split.num * unit.factor;
      if (!(amount > 0)) return fail("out-of-range", `${label} must be more than zero`);
      if (amount < min) return fail("out-of-range", `${label} is too small`);
      if (amount > max) return fail("out-of-range", `${label} is too large`);
      return ok(canonicalize(roundTo(amount, 9)));
    },
    format: (value, opts = {}) => formatBase(toBaseAmount(value), opts),
    toBase: (value) => toBaseAmount(value)
  });
};
