import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEM_TEMPLATES, ITEM_TEMPLATE_ALIASES, MAX_ITEM_TEMPLATE_FIELDS, itemTemplateFor, canonicalCategoryId, knownAttributes } from "./item-templates.js";
import { validateTemplate, validateAttributes, FIELD_TYPES, FILTER_TYPES, isFieldVisible } from "../template.js";
import { defaultKindFor } from "./item.js";
import { categories as dbCategories } from "../../../client/src/data/categories.js";
import { categories as mockCategories } from "../../../backend/src/data/categories.js";

test("validateTemplate: item templates may be empty, business templates may not", () => {
  assert.deepEqual(validateTemplate([], { allowEmpty: true }), []);
  assert.deepEqual(validateTemplate([]), ["Template needs at least one field"]);
  assert.deepEqual(validateTemplate(undefined), ["Template must be a list of fields"]);
  assert.deepEqual(validateTemplate("x", { allowEmpty: true }), ["Template must be a list of fields"]);
  assert.ok(validateTemplate([{ key: "a", label: "A", type: "nope" }], { allowEmpty: true }).length > 0, "allowEmpty does not loosen the other rules");
});

test("there is an item template for exactly the categories the database is seeded with", () => {
  assert.deepEqual(Object.keys(ITEM_TEMPLATES).sort(), dbCategories.map((c) => c.id).sort());
  assert.equal(dbCategories.length, 32);
});

test("every item template passes validateTemplate and stays within the size limit", () => {
  for (const [id, fields] of Object.entries(ITEM_TEMPLATES)) {
    assert.deepEqual(validateTemplate(fields, { allowEmpty: true }), [], id);
    assert.ok(fields.length <= MAX_ITEM_TEMPLATE_FIELDS, `${id} has ${fields.length} fields`);
    for (const f of fields) {
      assert.ok(FIELD_TYPES.includes(f.type), `${id}.${f.key}`);
      if (f.filterable) assert.ok(FILTER_TYPES.includes(f.type), `${id}.${f.key} is filterable but ${f.type}`);
      if (f.options) for (const o of f.options) assert.ok(o.value && o.label, `${id}.${f.key} option`);
      assert.ok(!f.required, `${id}.${f.key}: item fields are never required`);
    }
  }
});

test("item templates hold item-level things, not business settings", () => {
  const businessy = /deliver|payment|licen[cs]e|chairs|opening|hours open|open 24|parking|facilities|amenit|reservations|seats|accepts?\b/i;
  for (const [id, fields] of Object.entries(ITEM_TEMPLATES)) {
    for (const f of fields) assert.ok(!businessy.test(f.key) && !businessy.test(f.label), `${id}.${f.key} looks business-level`);
  }
});

test("the categories the user named come out as agreed", () => {
  const keys = (id) => ITEM_TEMPLATES[id].map((f) => f.key);
  for (const id of ["barbershop", "salon-beauty", "gym-fitness"]) assert.deepEqual(ITEM_TEMPLATES[id], [], id);
  assert.ok(keys("chemist").includes("prescription-required") && keys("chemist").includes("dosage-form"));
  assert.ok(keys("greengrocer").includes("organic") && keys("greengrocer").includes("pack-size"));
  assert.ok(keys("restaurant-cafe").includes("spice-level") && keys("restaurant-cafe").includes("vegetarian") && keys("restaurant-cafe").includes("prep-time"));
  assert.ok(keys("water-refill").includes("container-size"));
  assert.ok(keys("butchery").includes("cut") && keys("butchery").includes("halal"));
});

test("showIf rules point at fields in the same template and hide/show correctly", () => {
  const bakery = ITEM_TEMPLATES.bakery;
  const days = bakery.find((f) => f.key === "notice-days");
  assert.equal(isFieldVisible(days, {}), false);
  assert.equal(isFieldVisible(days, { "made-to-order": true }), true);
});

test("validateAttributes works against an item template, and rejects keys it does not list", () => {
  const fields = ITEM_TEMPLATES.chemist;
  assert.deepEqual(validateAttributes(fields.map((f) => ({ ...f, required: false })), { "prescription-required": true, "dosage-form": "tablet", strength: "500 mg" }), {});
  assert.ok(validateAttributes(fields, { "dosage-form": "nope" })["dosage-form"]);
  assert.ok(validateAttributes(fields, { delivery: true }).delivery, "a business key is not part of an item template");
});

test("itemTemplateFor resolves mock ids, returns copies, and unknown ids give an empty list", () => {
  assert.equal(canonicalCategoryId("barbershops"), "barbershop");
  assert.equal(canonicalCategoryId("water-refill"), "water-refill");
  assert.deepEqual(itemTemplateFor("chemists").map((f) => f.key), ITEM_TEMPLATES.chemist.map((f) => f.key));
  assert.deepEqual(itemTemplateFor("no-such-category"), []);
  const a = itemTemplateFor("chemist");
  a[0].label = "changed";
  assert.notEqual(ITEM_TEMPLATES.chemist[0].label, "changed");
  for (const [mock, db] of Object.entries(ITEM_TEMPLATE_ALIASES)) assert.ok(db in ITEM_TEMPLATES, `${mock} -> ${db}`);
});

test("every mock backend category resolves to an item template", () => {
  for (const c of mockCategories) assert.ok(canonicalCategoryId(c.id) in ITEM_TEMPLATES, `${c.id} has no item template`);
});

test("default item kind works for database ids and mock ids alike", () => {
  assert.equal(defaultKindFor("gym-fitness"), "membership");
  assert.equal(defaultKindFor("gyms"), "membership");
  assert.equal(defaultKindFor("salon-beauty"), "service");
  assert.equal(defaultKindFor("salons"), "service");
  assert.equal(defaultKindFor("garage-mechanic"), "service");
  assert.equal(defaultKindFor("mechanics"), "service");
  assert.equal(defaultKindFor("car-wash"), "service");
  assert.equal(defaultKindFor("chemist"), "product");
  assert.equal(defaultKindFor("hardware"), "product");
  assert.equal(defaultKindFor(undefined), "product");
});

test("knownAttributes drops legacy business keys and keeps item keys", () => {
  const fields = ITEM_TEMPLATES.chemist;
  assert.deepEqual(knownAttributes(fields, { prescriptions: true, licence: "PPB/1", strength: "500 mg", "dosage-form": "tablet" }), { strength: "500 mg", "dosage-form": "tablet" });
  assert.deepEqual(knownAttributes([], { delivery: true }), {});
  assert.deepEqual(knownAttributes(fields, undefined), {});
  const input = { strength: "1 g" };
  knownAttributes(fields, input);
  assert.deepEqual(input, { strength: "1 g" }, "input is not mutated");
});
