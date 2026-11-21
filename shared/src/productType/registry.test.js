import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentOfType, kindOfType, isKnownType, typesCompatible } from "./registry.js";
import { relevance } from "../similar.js";

test("the registry knows seeded types and nothing about the rest", () => {
  assert.equal(isKnownType("laundry-by-item"), true);
  assert.equal(kindOfType("laundry-by-item"), "service");
  assert.equal(departmentOfType("school-uniform"), "clothing");
  for (const v of ["other", "", null, undefined, "nope"]) { assert.equal(isKnownType(v), false); assert.equal(departmentOfType(v), null); }
});

test("a laundry Shirt and a shirt for sale are not similar; two shirts for sale are", () => {
  assert.equal(typesCompatible("laundry-by-item", "school-uniform"), false);
  assert.equal(relevance({ name: "Shirt", productTypeId: "laundry-by-item" }, { name: "Shirt", productTypeId: "school-uniform" }).qualifies, false);
  assert.equal(relevance({ name: "Shirt", productTypeId: "dress-shirt" }, { name: "Shirt", productTypeId: "school-uniform" }).qualifies, true);
});
