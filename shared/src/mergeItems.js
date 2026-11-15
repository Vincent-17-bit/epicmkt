// Which items differ only by size or colour and can be combined into one with options (A21, B20). The database function
// seller_similar_item_groups uses the same rule; mergeItems.test.js and unmet-demand-style db tests keep the two aligned.
import { measureOf } from "./unitPrice.js";

const COLOURS = ["black", "white", "brown", "red", "blue", "green", "yellow", "pink", "purple", "orange", "grey", "gray", "silver", "gold", "beige", "navy", "maroon"];
const UNITS = ["kg", "kgs", "g", "gm", "gram", "grams", "kilogram", "kilograms", "mg", "ml", "l", "ltr", "litre", "litres", "liter", "liters", "cl", "oz", "lb"];

/** "Bread 400g" -> "bread"; "Fresh water 20 L" -> "fresh water"; the key two items share when they differ by size or colour only. */
export function similarKey(name) {
  return String(name ?? "").toLowerCase()
    .replace(/\d+(?:[.,]\d+)?\s*(?:kgs?|kilograms?|grams?|gm|g|mg|ml|litres?|liters?|ltr|l|cl|oz|lb)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/\d/.test(w) && !UNITS.includes(w) && !COLOURS.includes(w) && w !== "x")
    .join(" ").trim();
}

/** The size text left in the name ("Bread 400g" -> "400 g"), or "" when there is none. */
export function sizeInName(name) {
  const m = String(name ?? "").toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilograms?|grams?|gm|g|mg|ml|litres?|liters?|ltr|l|cl)\b/);
  if (!m) return "";
  const w = m[2];
  const unit = /^k/.test(w) ? "kg" : /^ml$/.test(w) ? "ml" : /^(g|gm|gram|grams|mg)$/.test(w) ? (w === "mg" ? "mg" : "g") : /^cl$/.test(w) ? "cl" : "L";
  return `${m[1].replace(",", ".")} ${unit}`;
}

/** The colour word in the name, capitalised, or "". */
export function colourInName(name) {
  const w = String(name ?? "").toLowerCase().split(/[^a-z]+/).find((x) => COLOURS.includes(x));
  return w ? w[0].toUpperCase() + w.slice(1) : "";
}

/** The axes a group varies on, with a label for every item: [{ key, label, labels: { itemId: "400 g" } }] (empty when nothing varies). */
export function suggestAxes(items) {
  const axes = [];
  const sizes = Object.fromEntries(items.map((i) => [i.id, sizeInName(i.name)]));
  if (items.every((i) => sizes[i.id]) && new Set(Object.values(sizes)).size === items.length) {
    const m = measureOf(Object.values(sizes)[0]);
    axes.push({ key: m?.scale === "volume" ? "volume" : "weight", label: m?.scale === "volume" ? "Volume" : "Weight", display: "button", labels: sizes });
  }
  const colours = Object.fromEntries(items.map((i) => [i.id, colourInName(i.name)]));
  if (items.every((i) => colours[i.id]) && new Set(Object.values(colours)).size > 1) axes.push({ key: "colour", label: "Colour", display: "button", labels: colours });
  return axes.slice(0, 2);
}

/** Groups of two or more items that share a key, by product type. items: [{ id, name, productTypeId, hasOptions }] -> [{ key, items }]. */
export function similarGroups(items) {
  const by = new Map();
  for (const i of items ?? []) {
    if (i.hasOptions) continue;
    const key = similarKey(i.name);
    if (!key) continue;
    const k = `${i.productTypeId ?? ""}|${key}`;
    by.set(k, [...(by.get(k) ?? []), i]);
  }
  return [...by.values()].filter((g) => g.length > 1).map((g) => ({ key: similarKey(g[0].name), items: g }));
}

/** Grid for the preview: rows = first axis values, columns = second axis values (or one column), cells = price. */
export function mergePreview(items, axes, labelsOf = (a, i) => a.labels[i.id]) {
  const [a, b] = axes;
  const rows = [...new Set(items.map((i) => labelsOf(a, i)))];
  const cols = b ? [...new Set(items.map((i) => labelsOf(b, i)))] : [""];
  const cell = (r, c) => items.find((i) => labelsOf(a, i) === r && (!b || labelsOf(b, i) === c)) ?? null;
  return { rows, cols, cell };
}
