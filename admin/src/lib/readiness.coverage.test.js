import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readinessOf } from "./readiness.js";
import conformance from "../data/conformanceResult.json" with { type: "json" };
import { NEW_CATEGORY_IDS } from "../../../scripts/seeds/newCategories.mjs";

// The 17 shop categories added with the catalogue coverage work are in the stored release check, so an admin can switch each one on.
const names = Object.fromEntries([...readFileSync(new URL("../../../client/src/data/categories.js", import.meta.url), "utf8").matchAll(/id: '([a-z-]+)', name: '([^']+)'/g)].map((m) => [m[1], m[2]]));

for (const id of NEW_CATEGORY_IDS) {
  test(`${id} passes every blocking check once both plans are priced`, () => {
    assert.ok(names[id], "category is in the data");
    const r = readinessOf({ category: { id, name: names[id], priced_plans: 2 }, conformance });
    assert.deepEqual(r.blockers.map((b) => `${b.key}: ${b.detail}`), []);
    assert.equal(r.ready, true);
  });
}

test("a new category is blocked, with the reason, while a plan has no price", () => {
  const r = readinessOf({ category: { id: "bookshop", name: "Bookshop", priced_plans: 0 }, conformance });
  assert.equal(r.ready, false);
  assert.equal(r.blockers[0].key, "plans");
});
