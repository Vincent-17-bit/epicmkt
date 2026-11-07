// Scale-aware labels for option values (B07). A value is shown from its stored scale value when the axis names a scale
// (`axis.scale`) and the value carries `scaleValue` (or its label parses): shoes "EU 42" in the buyer's system, storage "1 TB",
// collar 16", count "3-seater". Anything else is shown as the seller typed it, exactly as before.
import { convertShoe, formatCapacityLabel, scales, shoeSummary } from "@epicmkt/shared";

export const SHOE_SYSTEMS = Object.freeze([
  { id: "eu", label: "EU" },
  { id: "uk", label: "UK" },
  { id: "us-m", label: "US men" },
  { id: "us-w", label: "US women" },
  { id: "cm", label: "cm" },
]);
const SYSTEM_IDS = SHOE_SYSTEMS.map((s) => s.id);
const STORAGE_KEY = "epicmkt.shoeSystem";

/** The buyer's remembered shoe system, or null. Storage can be blocked (private mode), so every access is guarded. */
export function readShoeSystem() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return SYSTEM_IDS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
export function writeShoeSystem(system) {
  try {
    if (SYSTEM_IDS.includes(system)) window.localStorage.setItem(STORAGE_KEY, system);
  } catch {
    /* not remembered; the choice still works for this visit */
  }
}

/** The system to show: the buyer's choice wins, else the item's own default (axis.defaultSystem), else the value's own system. */
export const chooseShoeSystem = (axis, buyer) => (SYSTEM_IDS.includes(buyer) ? buyer : SYSTEM_IDS.includes(axis?.defaultSystem) ? axis.defaultSystem : null);

/** The stored scale value of an option value, or null. Prefers the stored `scaleValue`; else parses the label with the axis's scale. */
export function valueScale(axis, value) {
  if (!axis?.scale || !value) return null;
  const raw = value.scaleValue ?? value.label;
  const ctx = axis.scale === "shoe" ? { system: "eu" } : {};
  const r = scales.parse(axis.scale, raw, ctx);
  return r.ok ? r.value : null;
}

/** What a value shows. `system` is the buyer's shoe system (or null). Falls back to the typed label, with the old 1024 GB -> 1 TB rule. */
export function scaleLabel(axis, value, { system = null } = {}) {
  const typed = formatCapacityLabel(value?.label ?? "");
  const stored = valueScale(axis, value);
  if (!stored) return typed;
  if (stored.scale === "shoe") {
    const to = chooseShoeSystem(axis, system) ?? stored.system;
    const out = to === stored.system ? { ok: true, value: stored } : convertShoe(stored, to);
    return out.ok ? scales.format(out.value) : scales.format(stored); // no equivalent in that system: show the size as stored
  }
  return scales.format(stored);
}

/** "EU 42 · UK 8 · US 9 (about 27 cm)" for a shoe value; "" for anything else or when a size has no equivalents. */
export function shoeHelp(axis, value) {
  return shoeSummary(valueScale(axis, value));
}

/** "120 x 60 x 75 cm" from a variant's specs, when one of them is a dimensions spec ("Dimensions", "Size (cm)"...). "" when there is none. */
export function variantDimensions(variant) {
  const spec = (variant?.specs ?? []).find((s) => /dimension|size/i.test(s?.label ?? ""));
  if (!spec) return "";
  const r = scales.parse("dimensions", spec.value, {});
  return r.ok ? scales.format(r.value).replace(/\s*×\s*/g, " x ") : "";
}
