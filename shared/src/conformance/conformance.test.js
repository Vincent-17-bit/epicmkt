import { test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_TYPES } from "../contracts/productTypes.js";
import { checkType, checkCategory, runConformance, formatTable, sampleItemForType, sampleSpecForType, scanForCategoryNames } from "./index.js";
import { typeCategoriesFromSql } from "./seedMap.js";

const type = (id) => PRODUCT_TYPES.find((t) => t.id === id);
const category = (over = {}) => ({ id: "demo", name: "Demo", keyFields: [{ key: "kind", label: "Kind", type: "select", options: ["A", "B"], required: true }], extraDocs: [], ...over });

test("every contract product type passes every stage", () => {
  for (const t of PRODUCT_TYPES) {
    const r = checkType(t);
    assert.deepEqual(r.failures, [], `${t.id}: ${JSON.stringify(r.failures)}`);
  }
});

test("a sample is built for each type and carries its axes, tiers, quantity and a priced combination", () => {
  const phone = sampleItemForType(type("phone"));
  assert.deepEqual(phone.options.map((a) => a.key), ["colour", "storage"]);
  assert.equal(phone.optionVariants.length, 4);
  assert.ok(sampleSpecForType(type("printing")).priceTiers.length >= 2);
  assert.equal(sampleSpecForType(type("meat-by-weight")).quantity.unit, "kg");
  const card = sampleItemForType(type("memory-card"));
  assert.equal(card.options[1].dependsOn.axis, "style", "a dependent axis keeps its parent");
});

test("a type made invalid fails, and the stage and the reason are named", () => {
  const bad = { ...type("phone"), group: "not-a-group" };
  const r = checkType(bad);
  assert.equal(r.ok, false);
  assert.equal(r.failures[0].stage, "parse");
  assert.match(r.failures[0].message, /group/);
});

test("a type that names a scale that does not exist fails at parse", () => {
  const r = checkType({ ...type("shoes-eu"), axes: [{ ...type("shoes-eu").axes[0], scale: "no-such-scale" }] });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.stage === "parse" && /unknown scale/.test(f.message)));
});

test("a type whose required spec row can never be answered cannot be published, and the gate says so", () => {
  const stuck = { ...type("phone"), specRows: [{ key: "warranty", label: "Warranty", level: "required", input: "choice", choices: [] }] };
  const r = checkType(stuck);
  assert.equal(r.ok, false, JSON.stringify(r.failures));
});

test("a crash inside a stage is a failure with a reason, not a crash of the suite", () => {
  const r = checkType({ ...type("phone"), axes: null });
  assert.equal(r.ok, false);
  assert.ok(r.failures.length >= 1);
});

test("a category with a broken form fails: unknown field type, a choice with no options, a missing showIf target, duplicate keys", () => {
  const r = checkCategory(category({ keyFields: [
    { key: "a", label: "A", type: "magic" },
    { key: "b", label: "B", type: "select", options: [] },
    { key: "c", label: "C", type: "text", showIf: { field: "zzz", equals: true } },
    { key: "c", label: "C again", type: "text" }
  ] }));
  const text = r.failures.map((f) => f.message).join("\n");
  assert.equal(r.ok, false);
  assert.match(text, /unknown type "magic"/);
  assert.match(text, /no options/);
  assert.match(text, /"zzz", which does not exist/);
  assert.match(text, /used twice/);
});

test("a healthy category passes, including the plain item with no type and no options", () => {
  assert.deepEqual(checkCategory(category()).failures, []);
});

test("runConformance rolls types up into their categories and lists types no category can sell", () => {
  const data = { categories: [category({ id: "one" }), category({ id: "two" })], types: [type("phone"), { ...type("bread"), group: "nope" }, type("sofa")], typeCategories: { phone: ["one"], bread: ["two"] } };
  const r = runConformance(data);
  assert.equal(r.ok, false);
  assert.equal(r.rows.find((x) => x.category === "one").ok, true);
  const two = r.rows.find((x) => x.category === "two");
  assert.equal(two.ok, false);
  assert.match(two.failures[0].message, /^bread:/);
  assert.deepEqual(r.orphanTypes, ["sofa"]);
});

test("the table has a row per category and a closing line, and names every failure", () => {
  const r = runConformance({ categories: [category({ id: "one" }), category({ id: "two", keyFields: [{ key: "x", label: "X", type: "magic" }] })], types: [], typeCategories: {} });
  const text = formatTable(r);
  assert.match(text, /^Category\s+Types\s+Result/);
  assert.match(text, /one\s+-\s+pass/);
  assert.match(text, /two\s+-\s+FAIL/);
  assert.match(text, /two \[parse\] field "x" has the unknown type/);
  assert.match(text, /1 categories? and 0 types FAIL|2 categories, 0 types: 1 categories and 0 types FAIL/);
});

test("the seed map reads the category ids of each type, and a later row replaces an earlier one", () => {
  const sql = `insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode) values
    ('phone', 'phone', 'Phone', 'good', 'phones', '{a,b}', '{}', 'units'),
    ('table', 'table', 'Table', 'good', 'furniture', '{c}', '{}', 'units');
    insert into public.product_types (id, slug, name, kind, department_id, category_ids, restricted_to, quantity_mode) values
    ('phone', 'phone', 'Phone', 'good', 'phones', '{a,b,d}', '{}', 'units');`;
  assert.deepEqual(typeCategoriesFromSql(sql), { phone: ["a", "b", "d"], table: ["c"] });
});

test("the allow-list scan flags a category name in code, and leaves data, tests, mocks and listed files alone", () => {
  const names = ["bakery", "cyber-cafe"];
  const files = [
    { path: "client/src/pages/Home.jsx", text: `if (shop.category === 'bakery') show()` },
    { path: "client/src/data/categories.js", text: `id: 'bakery'` },
    { path: "client/src/pages/Home.test.jsx", text: `"bakery"` },
    { path: "seller/src/api/mockThing.js", text: `"cyber-cafe"` },
    { path: "shared/src/seller/limits.js", text: `"bakery"` },
    { path: "client/src/pages/Other.jsx", text: `const word = "bakeryish"; // no whole name here` }
  ];
  assert.deepEqual(scanForCategoryNames(files, names, { "shared/src/seller/limits.js": "listed" }), [{ path: "client/src/pages/Home.jsx", names: ["bakery"] }]);
});
