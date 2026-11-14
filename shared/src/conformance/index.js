// Conformance suite (Prompt 11.4): every live category and every product type is turned into a sample item and sent through
// parse, save, price, the publish gate and the list payload. One broken type or category makes `npm run test:conformance` fail.
//
// Pure functions, no file or network access: the caller passes the data in (scripts/conformance.mjs reads the real data).

import { checkItemAgainstProductType, checkItemDetail, checkItemListCard, checkProductType } from "../contracts/validators.js";
import { toListCard } from "../contracts/fixtures/build.js";
import { storedOptions } from "../seller/options.js";
import { priceFor } from "../pricing.js";
import { specIssues } from "../specRules/specIssues.js";
import { listScales } from "../scales/index.js";
import { sampleSpecForType, sampleItemForType, sampleLegacyItem, sampleAnswersForCategory } from "./samples.js";

export { sampleSpecForType, sampleItemForType, sampleLegacyItem, sampleAnswersForCategory } from "./samples.js";
export { toListCard };
export { scanForCategoryNames, ALLOWED_CATEGORY_NAME_FILES } from "./allowlist.js";

export const STAGES = ["parse", "save", "price", "gate", "list"];
const NOW = "2026-01-01T09:00:00.000Z";

const fail = (stage, message) => ({ stage, message });
const guard = (stage, fn) => {
  try { return fn() ?? []; } catch (error) { return [fail(stage, `threw: ${error?.message ?? error}`)]; }
};

/** Stage by stage result for one product type. Never throws: a crash is reported as that stage's failure. */
export function checkType(type) {
  const failures = [];
  const shape = guard("parse", () => checkProductType(type).map((m) => fail("parse", m)));
  failures.push(...shape);
  if (shape.length) return { id: type.id, ok: false, failures };

  // parse: a scale an axis names must exist
  const known = new Set(listScales().map((s) => s.id));
  failures.push(...guard("parse", () => (type.axes ?? []).filter((a) => a.scale && !known.has(a.scale)).map((a) => fail("parse", `axis "${a.key}" names the unknown scale "${a.scale}"`))));

  let spec = null;
  let detail = null;
  failures.push(...guard("save", () => {
    spec = sampleSpecForType(type);
    detail = sampleItemForType(type);
    return [];
  }));
  if (!detail) return { id: type.id, ok: false, failures };

  // save: what seller_save_item would keep of these options
  failures.push(...guard("save", () => {
    if (!spec.axes.length) return [];
    const saved = storedOptions({ axes: spec.axes.map((a) => (a.dependsOn ? { ...a, dependsOn: a.dependsOn.axis } : a)), variants: spec.variants.map(({ key, id, dimensions, weightGrams, priceTiers, ...v }) => v) });
    return saved.ok ? [] : [fail("save", `the options are refused: ${saved.error}`)];
  }));
  failures.push(...guard("save", () => checkItemDetail(detail).map((m) => fail("save", m))));
  failures.push(...guard("save", () => checkItemAgainstProductType(detail, type).map((m) => fail("save", m))));

  // price: the default pick must have a whole price above zero (the cheapest sold combination)
  failures.push(...guard("price", () => {
    const first = (detail.optionVariants ?? []).find((v) => v.status === "available" || v.status === "limited_stock");
    const selection = first ? first.choice ?? first.combo ?? {} : {};
    const out = priceFor(detail, selection, 1, NOW);
    if (out.available === false) return [fail("price", `the sample cannot be priced (${out.reason})`)];
    return Number.isInteger(out.unit) && out.unit > 0 ? [] : [fail("price", `unit price ${out.unit} is not a whole amount above zero`)];
  }));

  // gate: a complete sample must have no blocker left, or no seller could ever publish this type
  failures.push(...guard("gate", () => {
    const out = specIssues(detail, type);
    return (out.blockers ?? []).map((b) => fail("gate", `${b.label}: ${b.message}`));
  }));

  // list: the card a shopper sees in a list
  failures.push(...guard("list", () => checkItemListCard(toListCard(detail)).map((m) => fail("list", m))));

  return { id: type.id, ok: failures.length === 0, failures };
}

const FIELD_TYPES = ["text", "longtext", "number", "price", "boolean", "select", "multiselect", "timerange", "url", "image", "itemlist"];

/** The category's own checks: its form, its documents and the plain item every category can always sell. */
export function checkCategory(category) {
  const failures = [];
  const fields = category.keyFields ?? [];
  const keys = fields.map((f) => f.key);
  failures.push(...guard("parse", () => {
    const out = [];
    if (!category.id || !category.name) out.push(fail("parse", "needs an id and a name"));
    keys.forEach((k, i) => keys.indexOf(k) !== i && out.push(fail("parse", `field key "${k}" is used twice`)));
    for (const f of fields) {
      if (!FIELD_TYPES.includes(f.type)) out.push(fail("parse", `field "${f.key}" has the unknown type "${f.type}"`));
      if ((f.type === "select" || f.type === "multiselect") && !(f.options?.length > 0)) out.push(fail("parse", `field "${f.key}" is a choice with no options`));
      if (f.showIf && !keys.includes(f.showIf.field)) out.push(fail("parse", `field "${f.key}" depends on "${f.showIf.field}", which does not exist`));
    }
    const docs = (category.extraDocs ?? []).map((d) => d.key);
    docs.forEach((k, i) => docs.indexOf(k) !== i && out.push(fail("parse", `document key "${k}" is used twice`)));
    return out;
  }));
  failures.push(...guard("save", () => {
    const answers = sampleAnswersForCategory(category);
    return fields.filter((f) => f.required && (answers[f.key] === null || answers[f.key] === undefined || answers[f.key] === "" || (Array.isArray(answers[f.key]) && !answers[f.key].length))).map((f) => fail("save", `required field "${f.key}" cannot be answered`));
  }));
  // price / gate / list: a plain item (no type, no options) must go all the way through
  failures.push(...guard("price", () => {
    const item = sampleLegacyItem(category);
    const out = priceFor(item, {}, 1, NOW);
    return out.available === false || !Number.isInteger(out.unit) ? [fail("price", "a plain item cannot be priced")] : [];
  }));
  failures.push(...guard("gate", () => (specIssues(sampleLegacyItem(category), null).blockers ?? []).map((b) => fail("gate", `a plain item is blocked: ${b.message}`))));
  failures.push(...guard("list", () => checkItemListCard(toListCard(sampleLegacyItem(category))).map((m) => fail("list", m))));
  return { id: category.id, name: category.name, ok: failures.length === 0, failures };
}

/**
 * @param {{ categories: object[], types: object[], typeCategories?: Record<string, string[]> }} data
 *   typeCategories: product type id -> the category ids that may sell it (from the product_types seed).
 * @returns {{ ok: boolean, rows: { category: string, name: string, types: string[], ok: boolean, failures: object[] }[], types: object[], orphanTypes: string[] }}
 */
export function runConformance({ categories = [], types = [], typeCategories = {} }) {
  const typeResults = types.map(checkType);
  const byType = new Map(typeResults.map((r) => [r.id, r]));
  const rows = categories.map((category) => {
    const own = checkCategory(category);
    const mine = types.filter((t) => (typeCategories[t.id] ?? []).includes(category.id)).map((t) => t.id);
    const failures = [...own.failures, ...mine.flatMap((id) => (byType.get(id)?.failures ?? []).map((f) => ({ ...f, message: `${id}: ${f.message}` })))];
    return { category: category.id, name: category.name, types: mine, ok: failures.length === 0, failures };
  });
  const placed = new Set(Object.values(typeCategories).flat());
  const ids = new Set(categories.map((c) => c.id));
  const orphanTypes = types.filter((t) => !(typeCategories[t.id] ?? []).some((c) => ids.has(c))).map((t) => t.id);
  const orphanFailures = typeResults.filter((r) => !r.ok && orphanTypes.includes(r.id));
  return { ok: rows.every((r) => r.ok) && typeResults.every((r) => r.ok), rows, types: typeResults, orphanTypes, orphanFailures, placedCategories: [...placed].filter((c) => !ids.has(c)) };
}

/** A plain text table: category, its types, pass or fail. Failures are listed under the row. */
export function formatTable(result) {
  const head = ["Category", "Types", "Result"];
  const lines = result.rows.map((r) => [r.category, r.types.join(", ") || "-", r.ok ? "pass" : "FAIL"]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const row = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  const out = [row(head), row(widths.map((w) => "-".repeat(w))), ...lines.map(row)];
  for (const r of result.rows.filter((x) => !x.ok)) for (const f of r.failures) out.push(`  ${r.category} [${f.stage}] ${f.message}`);
  for (const t of result.types.filter((x) => !x.ok && result.orphanTypes.includes(x.id))) for (const f of t.failures) out.push(`  type ${t.id} [${f.stage}] ${f.message}`);
  const bad = result.rows.filter((r) => !r.ok).length;
  out.push("", `${result.rows.length} categories, ${result.types.length} types: ${result.ok ? "all pass" : `${bad} categories and ${result.types.filter((t) => !t.ok).length} types FAIL`}`);
  return out.join("\n");
}
