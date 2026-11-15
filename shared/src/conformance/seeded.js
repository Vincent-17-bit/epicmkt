// The product types as they are stored and seeded (A24 to A28: kind, departmentId, quantityMode, axes, specRows, extras) in the
// contract shape the conformance stages read (Contract v1 ProductType: group, priceType, unit, axes, variantFields, itemFields,
// specRows). This is what lets `npm run test:conformance` send every seeded type, not only the contract's examples, through
// parse, save, price, the publish gate and the list card (A29). Pure: no I/O.

import { GROUP_BY_DEPARTMENT } from "./data/departmentGroups.js";

/** The contract group a stored type belongs to: services by kind, else by its department (electronics when unknown). */
export const groupOf = (row) => (row.kind === "service" ? "services" : GROUP_BY_DEPARTMENT[row.departmentId] ?? "electronics");

// AxisTemplate: the contract keys, plus scale (the parse stage checks it names a registered scale).
const axisOf = (a) => ({
  key: a.key,
  label: a.label,
  display: a.display,
  ...(a.scale ? { scale: a.scale } : {}),
  ...(typeof a.dependsOn === "string" ? { dependsOn: a.dependsOn } : a.dependsOn?.axis ? { dependsOn: a.dependsOn.axis } : {}),
  ...(Array.isArray(a.suggested) && a.suggested.length ? { suggested: a.suggested } : {}),
});

/**
 * One stored type in the contract shape. A measured type (meat by the kg, fabric by the metre) prices per unit and offers the
 * quantity field; a type with price steps (printing per page) offers tiers; a type whose options carry their own size offers
 * per-option dimensions. A service that is booked, not counted, defaults to "from" prices.
 */
export function contractTypeFromRow(row) {
  const x = row.extras ?? {};
  const measured = row.quantityMode === "measure";
  const itemFields = [...(measured ? ["quantity"] : []), ...(x.tiers ? ["priceTiers"] : []), ...(x.dimensionProfile && !x.dimensionsPerOption ? ["dimensions"] : [])];
  const variantFields = [...(x.dimensionsPerOption ? ["dimensions"] : []), ...(x.tiers ? ["priceTiers"] : [])];
  return {
    id: row.id,
    name: row.name,
    group: groupOf(row),
    priceType: row.kind === "service" && row.quantityMode === "none" ? "from" : "fixed",
    unit: measured ? (x.measureUnit ?? "kg") : null,
    axes: (row.axes ?? []).map(axisOf),
    variantFields,
    itemFields,
    ...(Array.isArray(row.specRows) ? { specRows: row.specRows } : {}),
  };
}

/** Every stored type in the contract shape, with the categories that may sell it (for the per-category table). */
export function seededForConformance(rows = []) {
  const types = rows.map(contractTypeFromRow);
  const typeCategories = Object.fromEntries(rows.map((r) => [r.id, [...new Set([...(r.categoryIds ?? []), ...(r.restrictedTo ?? [])])]]));
  return { types, typeCategories };
}
