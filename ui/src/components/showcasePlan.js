export const SHOWCASE_SLOTS = 4;

/**
 * Decides what fills the four slots of a featured store card, so the card keeps one size whether the store has no
 * products yet or a thousand.
 *
 *   4 or more products  four product cells
 *   3                   three products and a "visit the store" cell
 *   2                   two products on top, a wide "visit the store" cell below
 *   1                   the product and the store cell side by side, each the full height
 *   0                   one big store cell, so a business that was just added still looks complete
 *
 * Each cell has a `span`: "cell" (one slot), "wide" (two across), "tall" (two down) or "hero" (all four).
 */
export function planShowcase(products = [], slots = SHOWCASE_SLOTS) {
  const shown = products.slice(0, slots);
  const product = (item, span = "cell") => ({ kind: "product", span, item });
  const store = (span) => ({ kind: "store", span });

  switch (shown.length) {
    case 0:
      return [store("hero")];
    case 1:
      return [product(shown[0], "tall"), store("tall")];
    case 2:
      return [product(shown[0]), product(shown[1]), store("wide")];
    case 3:
      return [...shown.map((item) => product(item)), store("cell")];
    default:
      return shown.map((item) => product(item));
  }
}
