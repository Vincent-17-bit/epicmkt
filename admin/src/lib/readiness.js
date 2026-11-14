// Category readiness and the sandbox (Prompt 11.6). Pure functions: the page passes in what it loaded.
//
// A category can be switched on only when it is READY:
//   plans        both plans have a price                                               (blocks)
//   specRules    every spec row of every type the category sells is valid                (blocks)
//   conformance  the stored `npm run test:conformance` result passes for the category    (blocks; no result also blocks)
//   preview      a sample item for the category builds and shows as a list card         (blocks)
//   types        at least one product type is defined for the category                   (does NOT block: most categories sell plain items only)
// The database still checks the plans on its own (plans_not_priced); the rest is the admin's rule, so nobody switches on a category that
// the release check says is broken.

import { PRODUCT_TYPES, checkSpecRows, priceFor, specIssues } from "@epicmkt/shared";
import { sampleItemForType, sampleLegacyItem, sampleSpecForType, toListCard } from "@epicmkt/shared/conformance";

export const CHECKS = [
  { key: "plans", label: "Plans priced", blocks: true },
  { key: "types", label: "Product types defined", blocks: false },
  { key: "specRules", label: "Spec rules valid", blocks: true },
  { key: "conformance", label: "Conformance suite", blocks: true },
  { key: "preview", label: "Preview item", blocks: true }
];

const pass = (detail) => ({ status: "pass", detail });
const fail = (detail) => ({ status: "fail", detail });
const warn = (detail) => ({ status: "warn", detail });

/** The sample item a category shows in its preview: its first defined type's, else a plain item. Never throws. */
export function previewItem(category, types = []) {
  try {
    const own = (types ?? []).find((t) => PRODUCT_TYPES.some((p) => p.id === t.id));
    const type = own ? PRODUCT_TYPES.find((p) => p.id === own.id) : null;
    const detail = type ? sampleItemForType(type) : sampleLegacyItem(category);
    return { ok: true, detail, card: toListCard(detail), typeName: type?.name ?? null };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * @param {object} input
 * @param {{ id: string, name: string, priced_plans?: number }} input.category  a row from listCategories
 * @param {{ id: string, name: string, categoryIds?: string[], active?: boolean }[]} input.types  rows from listTypeSettings
 * @param {{ id: string, specRows?: object[] }[]} input.specTypes  rows from listSpecTypes
 * @param {object|null} input.conformance  the stored result (admin/src/data/conformanceResult.json)
 */
export function readinessOf({ category, types = [], specTypes = [], conformance = null }) {
  const mine = types.filter((t) => t.active !== false && (t.categoryIds ?? []).includes(category.id));
  const results = {};

  results.plans = category.priced_plans === 2 ? pass("Both plans have a price.") : fail(`${category.priced_plans ?? 0} of 2 plans have a price. Set both on the Plans page.`);

  results.types = mine.length ? pass(`${mine.length} ${mine.length === 1 ? "type" : "types"}: ${mine.map((t) => t.name).join(", ")}.`) : warn("None. Sellers add plain items with no options until a type is defined.");

  const problems = mine.flatMap((t) => {
    const rows = specTypes.find((s) => s.id === t.id)?.specRows;
    return rows === undefined ? [] : checkSpecRows(rows).map((p) => `${t.name}: ${p}`);
  });
  results.specRules = problems.length ? fail(problems.slice(0, 3).join(" ") + (problems.length > 3 ? ` And ${problems.length - 3} more.` : "")) : pass(mine.length ? "Every spec row is valid." : "Nothing to check; the generic goods rules apply.");

  const stored = conformance?.categories?.[category.id];
  results.conformance = !conformance ? fail("No stored result. Run npm run conformance:write.")
    : !stored ? fail("This category is not in the stored result. Add it to the category data, then run npm run conformance:write.")
      : stored.ok ? pass("Passed parse, save, price, publish gate and list payload.")
        : fail(`${stored.failures.length} ${stored.failures.length === 1 ? "failure" : "failures"}: ${stored.failures.slice(0, 2).join(" ")}`);

  const preview = previewItem(category, mine);
  results.preview = preview.ok ? pass(preview.typeName ? `A sample ${preview.typeName} builds and lists.` : "A plain item builds and lists.") : fail(`The sample item does not build: ${preview.error}`);

  const checks = CHECKS.map((c) => ({ ...c, ...results[c.key] }));
  const blockers = checks.filter((c) => c.blocks && c.status === "fail");
  return { checks, blockers, ready: blockers.length === 0, preview: preview.ok ? preview : null };
}

/** Readiness for every category, keyed by id. */
export const readinessAll = ({ categories = [], types = [], specTypes = [], conformance = null }) =>
  Object.fromEntries(categories.map((category) => [category.id, readinessOf({ category, types, specTypes, conformance })]));

/** May this category be switched on? Switching off is always allowed. `already` is true when it is on now. */
export function activationBlock(readiness, { already = false, turningOn = false } = {}) {
  if (already || !turningOn) return null;
  if (!readiness || readiness.ready) return null;
  return `Not ready to switch on: ${readiness.blockers.map((b) => b.label.toLowerCase()).join(", ")}.`;
}

/** A summary line for a list: "Ready", or what is missing. */
export const readinessSummary = (r) => (r.ready ? (r.checks.some((c) => c.status === "warn") ? "Ready, with a note" : "Ready") : `Not ready: ${r.blockers.map((b) => b.label.toLowerCase()).join(", ")}`);

// ---- Sandbox ---------------------------------------------------------------------------------------------------------------

export const sandboxTypes = () => PRODUCT_TYPES.map((t) => ({ id: t.id, name: t.name }));

/**
 * A throwaway item of one type, built in memory and never saved: its list card, its options, the price a buyer sees for the first sold
 * combination, and what the publish gate says. `complete: false` leaves every spec answer out, to show what a seller would be told.
 */
export function sandboxItem(typeId, { complete = true, now = "2026-01-01T09:00:00.000Z" } = {}) {
  const type = PRODUCT_TYPES.find((t) => t.id === typeId);
  if (!type) return null;
  const spec = sampleSpecForType(type);
  const full = sampleItemForType(type);
  const detail = complete ? full : { ...full, specs: [], highlights: [] };
  const first = (detail.optionVariants ?? []).find((v) => v.status === "available" || v.status === "limited_stock");
  const price = priceFor(detail, first ? (first.choice ?? first.combo ?? {}) : {}, 1, now);
  const gate = specIssues(detail, type);
  return {
    type,
    detail,
    card: toListCard(detail),
    axes: (detail.options ?? []).map((a) => ({ key: a.key, label: a.label, values: a.values.map((v) => v.label), dependsOn: a.dependsOn?.axis ?? null })),
    combinations: detail.optionVariants?.length ?? 0,
    price,
    blockers: gate.blockers ?? [],
    warnings: gate.warnings ?? [],
    requiredRows: (type.specRows ?? []).filter((r) => r.level === "required").map((r) => r.label),
    payload: { productType: type.id, options: { axes: spec.axes, variants: spec.variants }, priceTiers: spec.priceTiers ?? null, quantity: spec.quantity ?? null }
  };
}
