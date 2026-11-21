// The ranker uses the registry (R3): a "same word" match across departments, or between a good and a service, is refused. Checked over the
// whole audit catalogue (synthetic, derived from the seeds: it shows the rule holds everywhere, not that real names are covered), plus one
// named regression per documented bad pair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalogue, runAudit } from "./recommendation-audit.mjs";
import { analyseName, relevance, rankSimilar } from "../shared/src/similar.js";
import { departmentOfType, kindOfType } from "../shared/src/productType/registry.js";

const items = buildCatalogue();
const q = (a, b) => relevance({ name: a.name, productTypeId: a.typeId }, { name: b.name, productTypeId: b.typeId }).qualifies;

test("no pair across departments, and no good against a service, qualifies as similar (the audit's cross-type pairs)", () => {
  const byHead = new Map();
  for (const i of items) { const h = analyseName(i.name).head; if (h) byHead.set(h, [...(byHead.get(h) ?? []), i]); }
  let checked = 0;
  for (const list of byHead.values()) {
    for (const a of list) for (const b of list) {
      if (a.typeId === b.typeId) continue;
      const crossDept = departmentOfType(a.typeId) !== departmentOfType(b.typeId);
      const goodVsService = (kindOfType(a.typeId) === "good") !== (kindOfType(b.typeId) === "good");
      if (!crossDept && !goodVsService) continue;
      checked += 1;
      assert.equal(q(a, b), false, `${a.name} [${a.typeId}] ~ ${b.name} [${b.typeId}]`);
    }
  }
  assert.ok(checked > 400, `only ${checked} cross-department or good/service same-word pairs were checked`);
});

const bad = [
  ["a laundry Shirt is not a shirt for sale", ["Shirt", "laundry-by-item"], ["Shirt", "school-uniform"]],
  ["a laundered Dress is not a dress", ["Dress", "laundry-by-item"], ["Dress", "clothing"]],
  ["laundered Trousers are not trousers", ["Trousers", "laundry-by-item"], ["Trousers", "school-uniform"]],
  ["a dress shirt is not a laundered shirt", ["Dress shirt", "dress-shirt"], ["Shirt", "laundry-by-item"]],
  ["Makeup for sale is not a makeup service", ["Makeup", "makeup-skincare"], ["Makeup", "makeup-service"]]
];
for (const [why, [an, at], [bn, bt]] of bad) {
  test(`regression: ${why}`, () => {
    const a = { name: an, productTypeId: at };
    const b = { name: bn, productTypeId: bt };
    assert.equal(relevance(a, b).qualifies, false);
    assert.equal(relevance(b, a).qualifies, false);
    assert.deepEqual(rankSimilar(a, [{ id: "x", ...b }]).map((r) => r.id), []);
  });
}

test("kept: the same type, and the same department with the same kind, still match; untyped and Other keep today's behaviour", () => {
  assert.equal(relevance({ name: "Shirt", productTypeId: "school-uniform" }, { name: "Shirt", productTypeId: "school-uniform" }).qualifies, true);
  assert.equal(relevance({ name: "Dress shirt", productTypeId: "dress-shirt" }, { name: "Shirt", productTypeId: "school-uniform" }).qualifies, true);
  assert.equal(relevance({ name: "Shirt", productTypeId: "other" }, { name: "Shirt", productTypeId: "laundry-by-item" }).qualifies, true);
  assert.equal(relevance({ name: "Shirt" }, { name: "Shirt", productTypeId: "laundry-by-item" }).qualifies, true);
  assert.equal(relevance({ name: "Shirt", productTypeId: "not-in-the-registry" }, { name: "Shirt", productTypeId: "laundry-by-item" }).qualifies, true);
});

test("same-type recall does not drop, and the wrong-type count fell", () => {
  const r = runAudit();
  assert.ok(r.sameType.recallTypedPct >= 64.4, `same-type recall ${r.sameType.recallTypedPct}`);
  assert.ok(r.sameType.itemsWithASameTypeMatchPct >= 81.1);
  assert.equal(r.wrongType.goodVsServicePairs, 0);
  assert.ok(r.wrongType.pairs <= 106, `wrong-type pairs ${r.wrongType.pairs}`);
});
