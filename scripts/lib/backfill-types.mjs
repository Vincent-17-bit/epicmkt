// The one-off backfill of product types for items that have none (everything listed before the type became required, migration 0141).
// Pure planning plus a small runner over an adapter, so the rules are tested without a database (scripts/backfill-product-types.test.mjs).
//
// The rules, all deliberate:
//   * Only items whose product_type_id is NULL are looked at. A type the seller chose (including "other") is never overwritten.
//   * An item is assigned only when its name maps to ONE type with high confidence (suggestProductType: a whole phrase of the type, no
//     other type holding the same phrase, a clear margin) and the shop may sell that type. Everything else goes to the review list.
//   * Dry run unless apply is set. A write is "set the type where it is still null", so a second run, or a seller choosing a type in
//     between, changes nothing: idempotent.
import { suggestProductType, OTHER_TYPE_ID } from "../../shared/src/productType/suggest.js";

const canSell = (type, categoryId) => !type.restrictedTo?.length || type.restrictedTo.includes(categoryId);

/**
 * @param {{ id: string, name: string, businessId?: string, categoryId?: string, productTypeId?: string|null }[]} items
 * @param {{ id: string, name: string, categoryIds?: string[], restrictedTo?: string[] }[]} types  the active types
 * @returns {{ assign: object[], review: object[], skipped: number }}
 */
export function planBackfill(items, types) {
  const assign = [];
  const review = [];
  let skipped = 0;
  for (const item of items) {
    if (item.productTypeId) { skipped += 1; continue; } // already has a type: the seller's choice, never touched
    const sellable = types.filter((t) => t.id !== OTHER_TYPE_ID && canSell(t, item.categoryId));
    const s = suggestProductType(item.name, sellable, { categoryId: item.categoryId ?? "" });
    const names = (ids) => ids.map((id) => types.find((t) => t.id === id)?.name ?? id);
    if (s.confidence === "high") assign.push({ ...item, typeId: s.typeId, typeName: names([s.typeId])[0], score: s.candidates[0]?.score ?? 0 });
    else review.push({ ...item, reason: s.confidence === "low" ? "unsure: a likely type but not a clear one" : "no type found in the name", suggestion: s.typeId, candidates: names(s.candidates.map((c) => c.typeId)) });
  }
  return { assign, review, skipped };
}

/**
 * Plans, then writes when apply is true.
 * @param {{ loadItems: () => Promise<object[]>, loadTypes: () => Promise<object[]>, assign: (itemId: string, typeId: string) => Promise<boolean> }} adapter
 *   assign must set the type only where it is still null and return whether it changed a row.
 */
export async function runBackfill(adapter, { apply = false } = {}) {
  const [items, types] = await Promise.all([adapter.loadItems(), adapter.loadTypes()]);
  const plan = planBackfill(items, types);
  let written = 0;
  let lost = 0; // someone set a type between the read and the write: left alone
  if (apply) {
    for (const row of plan.assign) {
      if (await adapter.assign(row.id, row.typeId)) written += 1; else lost += 1;
    }
  }
  const byType = {};
  for (const row of plan.assign) byType[row.typeId] = (byType[row.typeId] ?? 0) + 1;
  return { mode: apply ? "apply" : "dry-run", scanned: items.length, alreadyTyped: plan.skipped, toAssign: plan.assign.length, written, changedUnderUs: lost, toReview: plan.review.length, byType, assign: plan.assign, review: plan.review };
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
/** The review list for an admin: one row per item that needs a person to pick its type. */
export const reviewCsv = (review) => ["item_id,business_id,name,reason,suggested_type,other_candidates", ...review.map((r) => [r.id, r.businessId, r.name, r.reason, r.suggestion ?? "", r.candidates.slice(1).join(" | ")].map(csvCell).join(","))].join("\n") + "\n";

export function formatReport(r) {
  const top = Object.entries(r.byType).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `    ${String(n).padStart(5)}  ${t}`).join("\n");
  return [
    `Product type backfill (${r.mode})${r.mode === "dry-run" ? "  -  nothing was written; add --apply to write" : ""}`,
    `  items read                 ${r.scanned}`,
    `  already have a type        ${r.alreadyTyped}  (never touched)`,
    `  would assign / assigned    ${r.mode === "apply" ? r.written : r.toAssign}  (one type, high confidence)`,
    ...(r.mode === "apply" ? [`  changed by a seller meanwhile  ${r.changedUnderUs}  (left as they are)`] : []),
    `  for an admin to review     ${r.toReview}`,
    top ? `  most assigned types:\n${top}` : "",
  ].filter(Boolean).join("\n");
}
