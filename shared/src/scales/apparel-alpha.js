import { defineScale } from "./define.js";
import { fail, norm, ok } from "./util.js";

export const ALPHA_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const ALIASES = new Map([
  ["xs", "XS"], ["extra small", "XS"], ["x-small", "XS"], ["xsmall", "XS"],
  ["s", "S"], ["small", "S"], ["m", "M"], ["medium", "M"], ["med", "M"], ["l", "L"], ["large", "L"],
  ["xl", "XL"], ["extra large", "XL"], ["x-large", "XL"], ["xlarge", "XL"],
  ["xxl", "XXL"], ["2xl", "XXL"], ["2x", "XXL"], ["xx-large", "XXL"], ["xxlarge", "XXL"],
  ["xxxl", "3XL"], ["3xl", "3XL"], ["3x", "3XL"], ["xxx-large", "3XL"],
  ["xxxxl", "4XL"], ["4xl", "4XL"], ["4x", "4XL"],
  ["xxxxxl", "5XL"], ["5xl", "5XL"], ["5x", "5XL"]
]);

export default defineScale({
  id: "apparel-alpha",
  label: "Clothing size (letters)",
  accepts: "XS, S, M, L, XL, XXL (or 2XL), 3XL, 4XL, 5XL; also words such as small, medium, extra large",
  display: "XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL (ordered smallest to largest)",
  examples: { valid: ["xs", "S", "medium", "extra large", "2XL", "xxl", "3xl", "5XL"], invalid: ["", "6XL", "huge", "42", "XXS"] },
  parse(raw) {
    const code = ALIASES.get(norm(raw).replace(/^size\s+/, ""));
    return code ? ok({ value: code }) : fail("unknown-size", `"${String(raw).trim()}" is not a clothing size (XS to 5XL)`, { options: ALPHA_ORDER });
  },
  format: (value) => value.value,
  toBase: (value) => ALPHA_ORDER.indexOf(value.value)
});
