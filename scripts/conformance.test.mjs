import { test } from "node:test";
import assert from "node:assert/strict";
import { run, readTypeCategories } from "./conformance.mjs";

test("the seeded data passes the conformance suite: every category, every type, no hard-coded category name", () => {
  const r = run();
  const bad = r.rows.filter((x) => !x.ok).map((x) => `${x.category}: ${x.failures.map((f) => f.message).join("; ")}`);
  assert.deepEqual(bad, []);
  assert.deepEqual(r.hardCoded, []);
  assert.equal(r.ok, true);
  assert.ok(r.rows.length >= 30, "every live category has a row");
});

test("every product type is sold by at least one live category", () => {
  const r = run();
  assert.deepEqual(r.orphanTypes, []);
  assert.deepEqual(r.placedCategories, [], "the seed names a category that does not exist");
});

test("the seed map is read from the migrations", () => {
  const map = readTypeCategories();
  assert.ok(map.phone.includes("phones-accessories"));
  assert.ok(map.printing.includes("cyber-cafe"));
});

import { readFileSync } from "node:fs";
import { RESULT_FILE, resultData } from "./conformance.mjs";

test("the stored result the admin readiness page reads is current: run `npm run conformance:write` after changing a category or a type", () => {
  const stored = JSON.parse(readFileSync(RESULT_FILE, "utf8"));
  assert.deepEqual(stored, JSON.parse(JSON.stringify(resultData(run()))));
});
