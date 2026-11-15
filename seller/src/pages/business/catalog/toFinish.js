import { specIssues } from "@epicmkt/shared";
import { hasTemplate } from "./editor/typedRows.js";

const PRICED = ["fixed", "from", "range"];

/** What a draft still needs before it can be published, as short phrases a seller understands. */
export function missingOf(item, type) {
  const out = [];
  if (!item.imageCount) out.push("A photo");
  if (PRICED.includes(item.priceType) && typeof item.price !== "number") out.push("A price");
  if (hasTemplate(type)) {
    const r = specIssues({ specs: item.specs ?? [], brand: item.brand, packSize: item.packSize, includes: item.includes ?? [], axes: [] }, type);
    for (const b of r.blockers) out.push(b.label);
  }
  return out;
}

/** A live item that has a type but not yet the rows the type needs (a type set in bulk): only the type's own rows count for it. */
const liveMissing = (item, type) => (hasTemplate(type) ? missingOf({ ...item, imageCount: 1, priceType: "contact" }, type) : []);

/** Drafts, and live items still missing rows of their type, with what each is missing; the emptiest first. */
export function toFinishList(items, types = []) {
  const byId = new Map(types.map((t) => [t.id, t]));
  return (items ?? [])
    .filter((i) => !i.removedByAdmin)
    .map((item) => ({ item, missing: item.draft ? missingOf(item, byId.get(item.productTypeId)) : item.productTypeId ? liveMissing(item, byId.get(item.productTypeId)) : [] }))
    .filter(({ item, missing }) => item.draft || missing.length > 0)
    .sort((a, b) => b.missing.length - a.missing.length || String(a.item.name).localeCompare(b.item.name));
}
