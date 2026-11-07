import { scales, convertShoe } from "@epicmkt/shared";

// Scale-aware labels for option values (prompt 1.7).
//
// An option value is `{ id, label, color?, mediaId? }`. To show it in the buyer's wording we need its scale. In this order:
//   1. value.stored   a stored scale value, `{scale, system?, value, unit?}` (additive, optional field)
//   2. axis.scale     a scale id; the seller's label is parsed with it (additive, optional field)
//   3. the table below: product type id + axis key -> scale id
// When nothing resolves, or the label does not parse, the label stays exactly as the seller wrote it. Nothing here throws.

export const AXIS_SCALES = Object.freeze({
  "shoes-eu.size": "shoe",
  "sofa.seats": "count",
  "table.size": "dimensions",
  "printing.paper": "paper-size",
  "led-strip.length": "length",
  "led-bulb.wattage": "power",
  "gold-necklace.length": "length",
  "phone.storage": "storage",
  "memory-card.capacity": "storage",
  "bread.weight": "weight",
  "drinking-water.size": "volume",
  "fragrance.volume": "volume"
});

export const SHOE_SYSTEMS = Object.freeze([
  { id: "eu", label: "EU" },
  { id: "uk", label: "UK" },
  { id: "us-m", label: "US men" },
  { id: "us-w", label: "US women" },
  { id: "cm", label: "cm" }
]);
export const SHOE_SYSTEM_IDS = SHOE_SYSTEMS.map((s) => s.id);

const isStored = (v) => v && typeof v === "object" && typeof v.scale === "string" && "value" in v;

export function scaleIdFor(item, axis) {
  if (!axis) return null;
  if (typeof axis.scale === "string" && axis.scale) return axis.scale;
  const type = item?.productType;
  return (type && AXIS_SCALES[`${type}.${axis.key}`]) || null;
}

/** The stored scale value of an option value, or null. */
export function storedOf(item, axis, value) {
  try {
    if (isStored(value?.stored)) {
      const r = scales.parse(value.stored.scale, value.stored);
      if (r.ok) return r.value;
    }
    const id = scaleIdFor(item, axis);
    if (!id || !value?.label) return null;
    const ctx = { typeId: item?.productType ?? undefined };
    if (id === "shoe") ctx.system = "eu"; // a bare "42" on a shoe axis is read as EU
    const r = scales.parse(id, value.label, ctx);
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

const cmText = (cm) => `about ${Math.round(cm)} cm`;

/** "EU 42 · UK 8 · US 9 (about 27 cm)". The chosen system comes first; US means women's when "US women" is chosen. */
export function shoeLabel(stored, system = "eu", chart = scales.SHOE_CHART) {
  const first = SHOE_SYSTEM_IDS.includes(system) ? system : "eu";
  const us = first === "us-w" ? "us-w" : "us-m";
  const order = [first, ...["eu", "uk", us].filter((s) => s !== first)];
  const parts = [];
  for (const sys of order) {
    const r = convertShoe(stored, sys, chart);
    if (!r.ok) continue;
    parts.push(scales.format(r.value).replace(/ \((men|women)\)$/, ""));
  }
  const cm = convertShoe(stored, "cm", chart);
  if (parts.length === 0) return null;
  if (first === "cm") return cm.ok ? [scales.format(cm.value), ...parts.slice(1)].join(" · ") : null;
  return `${parts.join(" · ")}${cm.ok ? ` (${cmText(cm.value.value)})` : ""}`;
}

/** The text a buyer sees for an option value. `fallback` is the label as the seller wrote it. */
export function labelFor(item, axis, value, { shoeSystem = "eu", chart } = {}) {
  const fallback = value?.label ?? "";
  const stored = storedOf(item, axis, value);
  if (!stored) return fallback;
  try {
    if (stored.scale === "shoe") return shoeLabel(stored, shoeSystem, chart) ?? fallback;
    // The collar scale shows 16" ; the item page says "16 in".
    if (stored.scale === "collar-inch") return scales.format(stored).replace(/"$/, " in");
    return scales.format(stored) || fallback;
  } catch {
    return fallback;
  }
}

/** True when the axis holds shoe sizes, so the system switch is offered. */
export const isShoeAxis = (item, axis) => axis?.values?.some((v) => storedOf(item, axis, v)?.scale === "shoe") ?? false;

/** "120 × 60 × 75 cm" for an option's dimensions ({length,width,height,unit}), or "". */
export function dimensionsText(d) {
  if (!d || ![d.length, d.width, d.height].every((n) => Number(n) > 0)) return "";
  try {
    const r = scales.parse("dimensions", `${d.length}x${d.width}x${d.height} ${d.unit || "cm"}`);
    return r.ok ? scales.format(r.value) : "";
  } catch {
    return "";
  }
}
