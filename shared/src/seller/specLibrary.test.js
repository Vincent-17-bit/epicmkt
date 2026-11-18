import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEC_GROUPS, SPEC_LIMITS } from "./itemForm.js";
import { choicesIn, isChoiceSpec, specExample, specKinds, specSuggestions, suggestSpecKind } from "./specLibrary.js";

test("every kind of shop gets its own quick-add rows: food, fashion, building, farm, electronics, vehicles, health, services", () => {
  const kind = (name, extra = {}) => suggestSpecKind({ name, ...extra })?.id ?? null;
  assert.equal(kind("White Bread Loaf"), "bread");
  assert.equal(kind("Birthday cake 1kg"), "cake");
  assert.equal(kind("Olive cargo shorts"), "clothing");
  assert.equal(kind("Bamburi cement 50kg"), "building");
  assert.equal(kind("Water tank 5000L"), "building", "the longer match wins over 'water'");
  assert.equal(kind("Keringet water 500ml"), "drinks");
  assert.equal(kind("Panadol 500mg tablets"), "health", "'tablets' is not furniture or a phone");
  assert.equal(kind("Layers mash 70kg"), "farm");
  assert.equal(kind("Toyota tyre 195/65 R15"), "vehicles");
  assert.equal(kind("Wedding photography"), "service-events");
  assert.equal(kind("Braids", { category: "Salon and barber" }), "beauty");
  assert.equal(kind("Something", { category: "Salon and barber" }), "service-beauty");
  assert.equal(suggestSpecKind({ typeName: "Speaker", name: "31 inch soundbar" }).id, "electronics");
  assert.equal(kind("Random thing"), null);
});

test("the rows are well formed, fit the database and lead with the kind's own facts", () => {
  for (const k of specKinds()) {
    assert.ok(k.rows.length >= 7, k.id);
    for (const r of k.rows) {
      assert.ok(SPEC_GROUPS.includes(r.group), `${k.id} ${r.label} ${r.group}`);
      assert.ok(r.label.length <= SPEC_LIMITS.label && r.example.length <= SPEC_LIMITS.value, `${k.id} ${r.label}`);
    }
  }
  const bread = specSuggestions({ name: "White bread" });
  assert.deepEqual(bread.rows.slice(0, 3).map((r) => r.label), ["Weight", "Brand", "Type"]);
  assert.equal(new Set(bread.rows.map((r) => r.label.toLowerCase())).size, bread.rows.length, "no label twice");
  assert.equal(specSuggestions({ name: "?" }).kind.id, "general");
});

test("choice rows can become options, and their value is read as separate choices", () => {
  for (const l of ["Color", "Colour", "Size", "Weight", "Brand", "Capacity", "Storage", "Flavour", "Tyre size"]) assert.equal(isChoiceSpec(l), true, l);
  for (const l of ["Ingredients", "Warranty", "Care instructions", ""]) assert.equal(isChoiceSpec(l), false, l);
  assert.deepEqual(choicesIn("Black, Grey / White or Red; black"), ["Black", "Grey", "White", "Red"]);
  assert.deepEqual(choicesIn("400 g, 700 g, 900 g"), ["400 g", "700 g", "900 g"]);
  assert.equal(specExample("weight").length > 0, true);
  assert.equal(specExample("No such label"), "");
});
