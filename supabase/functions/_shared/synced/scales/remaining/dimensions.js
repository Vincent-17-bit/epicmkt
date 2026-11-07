// A03: dimensions. Two shapes, "rectangular" and "round". The labels depend on the product type:
// table Length x Width x Height, sofa Width x Depth x Height, door Width x Height, round table Diameter x Height.
// Stored: {scale:"dimensions", system:<shape>, shape:<shape>, value:"120x60x75", unit:"cm"}. `system` repeats the shape so
// sizeKey ("dimensions:round:90x75:cm" and "dimensions:rectangular:90x75:cm") never mixes a round size with a door.
import { badValue, compareBase, fine, fmtNum, impossible, keyOf, okValue, parseNumber, round, splitNumberUnit, unitKey } from "./kit.js";

const TO_CM = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };
const UNIT_ALIASES = {
  mm: "mm", millimetre: "mm", millimetres: "mm", millimeter: "mm", millimeters: "mm",
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
  m: "m", metre: "m", metres: "m", meter: "m", meters: "m",
  in: "in", inch: "in", inches: "in", '"': "in", "″": "in",
  ft: "ft", foot: "ft", feet: "ft", "'": "ft", "′": "ft"
};
const unitOf = (text) => UNIT_ALIASES[unitKey(text)] ?? null;

// warn ranges in cm, per label position. Hard limits (cannot be right) are 1/20 of the minimum and 10 times the maximum.
export const DIMENSION_PROFILES = {
  table: { labels: ["Length", "Width", "Height"], short: ["L", "W", "H"], warn: [[30, 400], [20, 200], [20, 120]], largestFirst: true },
  sofa: { labels: ["Width", "Depth", "Height"], short: ["W", "D", "H"], warn: [[50, 400], [40, 150], [40, 150]], largestFirst: true },
  door: { labels: ["Width", "Height"], short: ["W", "H"], warn: [[50, 300], [150, 400]], smallestFirst: true },
  window: { labels: ["Width", "Height"], short: ["W", "H"], warn: [[20, 400], [20, 400]] },
  "round-table": { labels: ["Diameter", "Height"], short: ["Ø", "H"], warn: [[30, 300], [20, 120]], round: true },
  generic: { labels: ["Length", "Width", "Height"], short: ["L", "W", "H"], warn: [[0.1, 10000], [0.1, 10000], [0.1, 10000]], min: 2 },
  "generic-round": { labels: ["Diameter", "Height"], short: ["Ø", "H"], warn: [[0.1, 10000], [0.1, 10000]], round: true, min: 1 }
};
const TYPE_PROFILE = {
  table: "table", "dining-table": "table", "coffee-table": "table", desk: "table",
  sofa: "sofa", wardrobe: "sofa", cabinet: "sofa", "tv-stand": "sofa", door: "door", window: "window"
};

/** Which labelled profile applies to a product type and shape. */
export function dimensionProfileId(typeId, shape = "rectangular") {
  const base = TYPE_PROFILE[typeId];
  if (shape === "round") return base === "table" ? "round-table" : "generic-round";
  return base ?? "generic";
}
/** The labels for a product type, in entry order: dimensionLabels("table") -> ["Length","Width","Height"]. */
export const dimensionLabels = (typeId, shape) => DIMENSION_PROFILES[dimensionProfileId(typeId, shape)].labels.slice();

const ROUND_PREFIX = /^(?:ø|⌀|dia(?:m(?:eter)?)?\.?|round)\s*[:=]?\s*/i;
const SPLIT = /\s*(?:[x×*]|\bby\b)\s*/i;

export const parts = (value) => String(value.value).split("x").map(Number);
const cm = (n, unit) => n * TO_CM[unit];

export function parse(raw, ctx = {}) {
  let shape = ctx.shape === "round" ? "round" : "rectangular";
  let nums = [], units = [];
  if (raw && typeof raw === "object") {
    if (raw.scale && raw.scale !== "dimensions") return badValue("That is not a dimensions value.");
    if (raw.shape === "round" || raw.system === "round") shape = "round";
    if (typeof raw.value === "string") return parse(`${shape === "round" ? "Ø" : ""}${raw.value}${raw.unit ? " " + raw.unit : ""}`, { ...ctx, shape });
    const list = Array.isArray(raw.values) ? raw.values
      : shape === "round" ? [raw.diameter, raw.height] : [raw.length ?? raw.width, raw.width ?? raw.depth, raw.height];
    nums = list.filter((n) => n != null).map(parseNumber);
    if (raw.unit) units = [unitOf(raw.unit)];
    if (raw.unit && !units[0]) return badValue(`Unknown unit "${raw.unit}". Use mm, cm, m, in, ft.`);
  } else {
    let text = String(raw ?? "").trim();
    if (!text) return badValue("Enter the size, for example 120 x 60 x 75 cm.");
    const round_ = text.match(ROUND_PREFIX);
    if (round_) { shape = "round"; text = text.slice(round_[0].length); }
    for (const piece of text.split(SPLIT)) {
      const s = splitNumberUnit(piece);
      if (!s) return badValue(`"${piece}" is not a size. Use numbers like 120 x 60 x 75 cm.`);
      nums.push(s.num);
      if (s.unit) {
        const u = unitOf(s.unit);
        if (!u) return badValue(`Unknown unit "${s.unit}". Use mm, cm, m, in, ft.`);
        units.push(u);
      }
    }
  }
  if (nums.some((n) => !Number.isFinite(n))) return badValue("Sizes must be numbers.");
  if (nums.some((n) => n <= 0)) return badValue("Every size must be more than zero.");
  const distinct = [...new Set(units.filter(Boolean))];
  if (distinct.length > 1) return badValue("Use one unit for the whole size.");
  const unit = distinct[0] ?? unitOf(ctx.unit ?? "");
  if (!unit) return badValue("Add a unit: cm, m, mm, in or ft.");
  const profile = DIMENSION_PROFILES[dimensionProfileId(ctx.typeId, shape)];
  const min = profile.min ?? profile.labels.length;
  if (nums.length < min || nums.length > profile.labels.length) {
    const want = min === profile.labels.length ? `${min}` : `${min} or ${profile.labels.length}`;
    return badValue(`Enter ${profile.labels.join(" x ")} (${want} numbers).`);
  }
  for (let i = 0; i < nums.length; i += 1) {
    const [lo, hi] = profile.warn[i];
    const c = cm(nums[i], unit);
    if (c < lo / 20 || c > hi * 10) return badValue(`${profile.labels[i]} ${fmtNum(nums[i])} ${unit} cannot be right. Check the number and the unit.`);
  }
  const value = nums.map((n) => String(round(n))).join("x");
  return okValue({ scale: "dimensions", system: shape, shape, value, unit });
}

export function format(v, opts = {}) {
  if (!v || !TO_CM[v.unit]) return "";
  const to = opts.unit ? unitOf(opts.unit) : null;
  const factor = to ? TO_CM[v.unit] / TO_CM[to] : 1;
  const unit = to ?? v.unit;
  const profile = DIMENSION_PROFILES[dimensionProfileId(opts.typeId, v.shape)];
  const text = parts(v).map((n, i) => {
    const num = fmtNum(n * factor);
    if (opts.labels && profile.short[i] && parts(v).length === profile.labels.length) return `${profile.short[i]} ${num}`;
    return v.shape === "round" && i === 0 && !opts.labels ? `Ø ${num}` : num;
  }).join(" × ");
  return `${text} ${unit}`;
}

/** Millimetres, one number per part, in entry order. compare() sorts these lexicographically. */
export const toBase = (v) => (v && TO_CM[v.unit] ? parts(v).map((n) => round(n * TO_CM[v.unit] * 10, 6)) : null);

export function plausible(typeId, _axisKey, v) {
  if (!v || !TO_CM[v.unit]) return impossible("dimensions: not a valid value.");
  const nums = parts(v);
  let profile = DIMENSION_PROFILES[dimensionProfileId(typeId, v.shape)];
  if (nums.length !== profile.labels.length) profile = DIMENSION_PROFILES[v.shape === "round" ? "generic-round" : "generic"];
  const label = typeId ?? "this item";
  for (let i = 0; i < nums.length; i += 1) {
    const [lo, hi] = profile.warn[i];
    const c = cm(nums[i], v.unit);
    const shown = `${profile.labels[i]} ${fmtNum(nums[i])} ${v.unit}`;
    if (!(c > 0) || c < lo / 20 || c > hi * 10) return impossible(`${shown} cannot be right for ${label}.`);
  }
  for (let i = 0; i < nums.length; i += 1) {
    const [lo, hi] = profile.warn[i];
    const c = cm(nums[i], v.unit);
    const shown = `${profile.labels[i]} ${fmtNum(nums[i])} ${v.unit}`;
    if (c > hi) return fine(`${shown} is more than usual for ${label} (up to ${fmtNum(hi)} cm). Check the unit.`);
    if (c < lo) return fine(`${shown} is less than usual for ${label} (from ${fmtNum(lo)} cm). Check the unit.`);
  }
  if (profile.largestFirst && nums[1] > nums[0]) return fine(`${profile.labels[1]} is bigger than ${profile.labels[0]}. Enter ${profile.labels.join(" x ")}.`);
  if (profile.smallestFirst && nums[0] > nums[1]) return fine(`${profile.labels[0]} is bigger than ${profile.labels[1]}. Enter ${profile.labels.join(" x ")}.`);
  return fine();
}

export const dimensions = {
  id: "dimensions", base: "mm", units: Object.keys(TO_CM), parse, format, toBase, plausible,
  sizeKey: (v) => keyOf("dimensions", v.system ?? v.shape, v.value, v.unit),
  compare: (a, b) => compareBase(toBase(a), toBase(b))
};
