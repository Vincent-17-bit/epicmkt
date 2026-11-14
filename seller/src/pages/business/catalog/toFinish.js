import { specIssues } from "@epicmkt/shared";

const PRICED = new Set(["fixed", "from", "range"]);

export function toFinish(items = [], types = []) {
  const byId = new Map(types.map((t) => [t.id, t]));
  return items
    .filter((i) => i.draft && !i.removedByAdmin)
    .map((i) => {
      const type = byId.get(i.productTypeId) ?? null;
      const missing = [];
      if (PRICED.has(i.priceType) && i.price === null && !(i.variants?.length > 0)) missing.push("Price");
      if (!i.imageCount) missing.push("A photo");
      if (type) {
        const own = new Set((type.axes ?? []).map((a) => a.key));
        try {
          for (const b of specIssues(i, type).blockers) if (!own.has(b.key)) missing.push(b.label);
        } catch {
          return { id: i.id, name: i.name, missing };
        }
      }
      return { id: i.id, name: i.name, missing };
    })
    .filter((x) => x.missing.length > 0);
}
