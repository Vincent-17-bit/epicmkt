import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALL_TYPES } from "./seeds/index.mjs";
import { REGISTRY_PATH, renderRegistry } from "./lib/type-registry.mjs";
import { TYPE_REGISTRY } from "../shared/src/productType/registry.generated.js";
import { departmentOfType, kindOfType, typesCompatible } from "../shared/src/productType/registry.js";

test("the generated registry is current (run node scripts/generate-type-registry.mjs)", () => {
  assert.equal(readFileSync(REGISTRY_PATH, "utf8"), renderRegistry());
});

test("it holds every seeded type with its department and kind", () => {
  assert.equal(Object.keys(TYPE_REGISTRY).length, ALL_TYPES.length);
  for (const t of ALL_TYPES) {
    assert.equal(departmentOfType(t.id), t.departmentId ?? null, t.id);
    assert.equal(kindOfType(t.id), t.kind, t.id);
  }
});

test("typesCompatible: department and good-vs-service, and unknown types say nothing", () => {
  assert.equal(typesCompatible("dress-shirt", "dress-shirt"), true);
  assert.equal(typesCompatible("dress-shirt", "clothing"), true);
  assert.equal(typesCompatible("other", "clothing"), true);
  assert.equal(typesCompatible(null, "clothing"), true);
  assert.equal(typesCompatible("not-a-type", "clothing"), true);
  const dept = (d) => ALL_TYPES.filter((t) => t.departmentId === d);
  const [a, b] = [ALL_TYPES.find((t) => t.kind === "good"), ALL_TYPES.find((t) => t.kind === "service" && t.departmentId !== ALL_TYPES.find((x) => x.kind === "good").departmentId)];
  assert.equal(typesCompatible(a.id, b.id), false);
  assert.ok(dept(a.departmentId).length > 0);
});
