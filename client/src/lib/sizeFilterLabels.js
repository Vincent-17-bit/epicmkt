import { scales, convertShoe } from "@epicmkt/shared";
import { filterKey } from "./sizeFilters.js";

// How a size choice reads in the filters. A shoe follows the buyer's system (the choice itself is keyed by EU size, so it does not change).
export function sizeLabel(value, system = "eu") {
  try {
    if (value.scale === "shoe") {
      const r = convertShoe(value, system);
      if (r.ok) return scales.format(r.value).replace(/ \((men|women)\)$/, "");
    }
    const text = scales.format(value);
    return value.scale === "collar-inch" ? text.replace(/"$/, " in") : text;
  } catch {
    return String(value?.value ?? "");
  }
}

/** The label of a chosen filter key, looked up in the facet groups; the key itself when the facets are not loaded. */
export function sizeNameFrom(groups, system) {
  const byKey = new Map();
  for (const g of groups ?? []) for (const o of g.options ?? []) byKey.set(o.key, o.value);
  return (key) => {
    const value = byKey.get(key);
    return value ? `${sizeLabel(value, system)}` : key;
  };
}

export { filterKey };
