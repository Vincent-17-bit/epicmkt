// "KES 144 per kg" / "KES 4 per L" / "KES 250 per piece" under a price when the size is a weight, a volume or a pack of pieces (A21, C23).
import { parse, toBase } from "./scales/index.js";
import { formatKes } from "./utils.js";
import { PRODUCT_TYPES } from "./contracts/productTypes.js";

const SCALES = { weight: { base: 1000, unit: "kg" }, volume: { base: 1000, unit: "L" } };

/** The size read as a weight or a volume: { scale, amount (in g or ml) } or null. A size that is neither (a shoe, "Large") gives null. */
export function measureOf(size) {
  if (size === null || size === undefined) return null;
  for (const scale of Object.keys(SCALES)) {
    const res = parse(scale, size);
    if (res.ok) return { scale, amount: toBase(res.value) };
  }
  return null;
}

const PIECE_SYSTEMS = ["pieces", "set", "pack", "box"];
const WRAP = /^(?:pack|set|box|case|carton)\s+of\s+/;
const MULTI_LEAD = /^(\d+)\s*[x×]\s*(.+)$/;
const MULTI_TRAIL = /^(.+?)\s*[x×]\s*(\d+)$/;
const DOZEN = /^(half\s+)?(?:a\s+|(\d+)\s+)?dozen$/;
const PAIRS = /^(?:(\d+)\s*)?pairs?$/;

const clean = (size) => String(size ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(WRAP, "");

/** How many pieces the size means, and of what: { n, unit } ("Pack of 6", "12 pcs", "x12", "dozen", "3 pairs"), or null. A bare number is never a count (it may be a shoe or storage size). */
export function pieceCountOf(size) {
  if (size === null || size === undefined || !/[a-z×]/i.test(String(size))) return null;
  const text = clean(size);
  const dozen = text.match(DOZEN);
  if (dozen) {
    const n = dozen[1] ? 6 : 12 * (dozen[2] ? Number(dozen[2]) : 1);
    return n > 1 ? { n, unit: "piece" } : null;
  }
  const pairs = text.match(PAIRS);
  if (pairs) {
    const n = pairs[1] ? Number(pairs[1]) : 1;
    return n > 1 ? { n, unit: "pair" } : null;
  }
  const res = parse("count", size);
  if (!res.ok || !PIECE_SYSTEMS.includes(res.value.system ?? "pieces")) return null;
  return res.value.value > 1 ? { n: res.value.value, unit: "piece" } : null;
}

/** A multipack: "6 x 500 ml", "500ml x 6", "Pack of 6 x 500 ml" -> { n, measure } (the single unit's weight or volume), or null. */
export function multipackOf(size) {
  if (size === null || size === undefined) return null;
  const text = clean(size);
  const lead = text.match(MULTI_LEAD);
  const trail = lead ? null : text.match(MULTI_TRAIL);
  const n = Number(lead ? lead[1] : trail?.[2]);
  const rest = lead ? lead[2] : trail?.[1];
  if (!rest || !Number.isInteger(n) || n < 2) return null;
  const measure = measureOf(rest);
  return measure && measure.amount > 0 ? { n, measure } : null;
}

const money = (amount, unit) => ({ amount, unit, text: `${formatKes(amount)} per ${unit}` });
const perMeasure = (p, { scale, amount }) => {
  const { base, unit } = SCALES[scale];
  return money(Math.round((p * base) / amount), unit);
};

/** Every unit price the size supports, best first: a weight or volume gives per kg / per L; a pack count gives per piece (or per pair); a multipack gives both, per piece then per kg / L. Whole shillings, half up. -> [{ amount, unit, text }] */
export function unitPrices(price, size, allow = {}) {
  const { measure = true, count: counts = true } = allow;
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return [];
  const out = [];
  const single = measureOf(size);
  if (single) {
    if (measure && single.amount > 0) out.push(perMeasure(p, single));
    return out;
  }
  const multi = multipackOf(size);
  if (multi) {
    const each = Math.round(p / multi.n);
    if (counts && each >= 1) out.push(money(each, "piece"));
    if (measure) out.push(perMeasure(p, { scale: multi.measure.scale, amount: multi.measure.amount * multi.n }));
    return out;
  }
  const count = counts ? pieceCountOf(size) : null;
  if (count) {
    const each = Math.round(p / count.n);
    if (each >= 1) out.push(money(each, count.unit));
  }
  return out;
}

/** The first of unitPrices, or null: price per kg, per L, per piece or per pair for the size. */
export function unitPrice(price, size) {
  return unitPrices(price, size)[0] ?? null;
}

const MULTI_IN_NAME = [
  /\b(?:pack|set|box|case|carton)\s+of\s+\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kgs?|g|gm|ml|cl|l|ltr|litres?|liters?)\b/gi,
  /\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kgs?|g|gm|ml|cl|l|ltr|litres?|liters?)\b/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:kgs?|g|gm|ml|cl|l|ltr|litres?|liters?)\s*[x×]\s*\d+\b/gi
];
const COUNT_IN_NAME = [
  /\b(?:pack|set|box|case|carton)\s+of\s+\d+\b/gi,
  /\b\d+\s*-?\s*(?:pack|pcs|pc|pieces|piece)\b/gi,
  /\b(?:half\s+)?(?:\d+\s+)?dozen\b/gi,
  /\b\d+\s*pairs\b/gi
];
const MEASURE_IN_NAME = /(?<![\w./-])(\d+(?:[.,]\d+)?)(\s*)(kgs?|kilograms?|grams?|gm|g|mg|ml|cl|litres?|liters?|ltr|l)\b(?!\s*(?:ram|rom|storage|memory|battery|network|lte|mah|hz|inch|in\b))/gi;
const SPEC_GOODS = /\b(?:phones?|smartphones?|laptops?|tablets?|ipad|tvs?|televisions?|routers?|cameras?|watch|smartwatch|earbuds|headphones?|chargers?|speakers?|monitors?|printers?|consoles?|ssd|hdd|ram)\b/i;

const distinct = (text, patterns, keep = () => true) => {
  const found = new Map();
  for (const re of patterns) for (const m of text.matchAll(re)) if (keep(m)) found.set(m[0].toLowerCase().replace(/\s+/g, " ").trim(), m[0]);
  const keys = [...found.keys()];
  return keys.filter((t) => !keys.some((o) => o !== t && o.includes(t))).map((t) => found.get(t));
};
const plainMeasure = (m) => !(m[3] === "G" && Number(m[1]) <= 6);
const groupOf = (productType) => PRODUCT_TYPES.find((t) => t.id === productType)?.group ?? null;

const NO_MEASURE_GROUPS = new Set(["electronics", "fashion", "furniture", "lighting", "jewellery", "beauty", "services"]);
const MEASURE_GROUPS = new Set(["food-drink"]);

/**
 * What the item page may say a price is "per". It needs positive evidence, never a guess from words alone:
 *  - measure (per kg / per L) from a size the seller chose: any item that is not a service and not electronics, fashion, furniture, lighting, jewellery or beauty (5 g of gold is not a price per kg, and a 50 ml perfume is not a price per litre).
 *  - nameMeasure: a weight or volume read from the item's name: only when the product type is food and drink. An untyped item, or one of any other type, never gets one from its name.
 *  - count (per piece / per pair): any item that is not a service.
 */
export function unitPricePolicy({ productType = null, kind = null } = {}) {
  const group = groupOf(productType);
  if (kind === "service" || group === "services") return { measure: false, nameMeasure: false, count: false };
  const sizes = !NO_MEASURE_GROUPS.has(group);
  return { measure: sizes, nameMeasure: sizes && MEASURE_GROUPS.has(group), count: true };
}

/** The one size an item's name states, as text unitPrices can read: a multipack ("6 x 500 ml"), a pack count ("24 pack"), a weight or volume ("400 g", "1.5 L"), or a count and a measure together ("500 ml 24 pack" -> "24 x 500 ml"). "" when the name states none, or more than one different size ("250 mL & 355 mL"). The weight or volume is read only when the caller says the item may have one (measure: true, from unitPricePolicy); a name that sounds like electronics gives none either; 5G and spec words (RAM, storage, battery, inch) are not measures; and a number glued to a model code ("A8-L") is skipped. */
export function sizeInItemName(name, { measure = false } = {}) {
  const text = String(name ?? "");
  const multi = distinct(text, MULTI_IN_NAME).filter((t) => unitPrices(100, t).length);
  if (multi.length) return multi.length === 1 ? multi[0] : "";
  const counts = distinct(text, COUNT_IN_NAME).filter((t) => unitPrices(100, t).length);
  const measures = (!measure || SPEC_GOODS.test(text) ? [] : distinct(text, [MEASURE_IN_NAME], plainMeasure)).filter((t) => measureOf(t));
  if (counts.length > 1 || measures.length > 1) return "";
  if (counts.length && measures.length) {
    const count = pieceCountOf(counts[0]);
    return count && count.unit === "piece" ? `${count.n} x ${measures[0]}` : "";
  }
  return counts[0] ?? measures[0] ?? "";
}
