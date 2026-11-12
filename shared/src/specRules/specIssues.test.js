import test from "node:test";
import assert from "node:assert/strict";
import { specIssues } from "./specIssues.js";
import { GENERIC_GOODS_TEMPLATE } from "./genericTemplate.js";
import { checkSpecRows, MAX_REQUIRED_ROWS } from "./rows.js";
import { getFixture, productTypeById, checkProductType, PRODUCT_TYPES } from "../contracts/index.js";

const withoutSpec = (detail, label) => ({ ...detail, specs: detail.specs.filter((s) => s.label !== label) });
const fixture = (id) => getFixture(id).detail;
const type = (id) => productTypeById(id);

const cases = [
  ["water missing water type", () => withoutSpec(fixture("fx-water"), "Water type"), "drinking-water", ["water-type"]],
  ["bread missing allergens", () => withoutSpec(fixture("fx-bread"), "Allergens"), "bread", ["allergens"]],
  ["bread missing both required rows", () => ({ ...fixture("fx-bread"), specs: [] }), "bread", ["ingredients", "allergens"]],
  ["phone missing warranty", () => withoutSpec(fixture("fx-phone"), "Warranty"), "phone", ["warranty"]]
];

for (const [name, make, typeId, keys] of cases) {
  test(`blocker: ${name}`, () => {
    const r = specIssues(make(), type(typeId));
    assert.deepEqual(r.blockers.map((b) => b.key), keys);
    assert.ok(r.blockers.every((b) => b.level === "required" && /is required$/.test(b.message)));
  });
}

for (const [id, typeId] of [["fx-water", "drinking-water"], ["fx-bread", "bread"], ["fx-phone", "phone"]]) {
  test(`fixture ${id} has no blockers`, () => {
    assert.deepEqual(specIssues(fixture(id), type(typeId)).blockers, []);
  });
}

test("labels match ignoring case, accents and punctuation", () => {
  const item = { ...fixture("fx-phone"), specs: [{ label: "  WARRANTY: ", value: "1 year" }] };
  assert.deepEqual(specIssues(item, type("phone")).blockers, []);
});

test("blank, whitespace and missing values do not count", () => {
  for (const value of ["", "   ", null, undefined]) {
    const item = { ...fixture("fx-phone"), specs: [{ label: "Warranty", value }] };
    assert.deepEqual(specIssues(item, type("phone")).blockers.map((b) => b.key), ["warranty"]);
  }
});

test("false and 0 count as answered", () => {
  const rows = [{ key: "fragile", label: "Fragile", level: "required", input: "boolean" }, { key: "count", label: "Count", level: "required", input: "number" }];
  const item = { specs: [{ label: "Fragile", value: false }, { label: "Count", value: 0 }] };
  assert.deepEqual(specIssues(item, { id: "t", specRows: rows }).blockers, []);
});

test("recommended rows lower the score and never block", () => {
  const full = specIssues(fixture("fx-phone"), type("phone"));
  assert.equal(full.score, 100);
  const lean = specIssues({ ...fixture("fx-phone"), specs: [{ label: "Warranty", value: "1 year" }] }, type("phone"));
  assert.deepEqual(lean.blockers, []);
  assert.equal(lean.score, 0);
  assert.deepEqual(lean.warnings.map((w) => w.key), ["display", "sim", "battery"]);
});

test("score is the share of recommended rows answered", () => {
  const item = { ...fixture("fx-bread"), specs: [{ label: "Ingredients", value: "x" }, { label: "Allergens", value: "y" }, { label: "Storage", value: "Cool" }] };
  const r = specIssues(item, type("bread"));
  assert.equal(r.score, Math.round((1 / 5) * 100));
});

test("optional rows are ignored", () => {
  const t = { id: "t", specRows: [{ key: "note", label: "Note", level: "optional", input: "text" }] };
  assert.deepEqual(specIssues({ specs: [] }, t), { blockers: [], warnings: [], score: 100 });
});

test("grandfathered turns blockers into warnings", () => {
  const item = withoutSpec(fixture("fx-phone"), "Warranty");
  const r = specIssues(item, type("phone"), { grandfathered: true });
  assert.deepEqual(r.blockers, []);
  assert.ok(r.warnings.some((w) => w.key === "warranty" && w.level === "required"));
});

test("generic template: nothing required, recommended rows score", () => {
  const legacy = fixture("fx-legacy");
  const r = specIssues(legacy, null);
  assert.deepEqual(r.blockers, []);
  assert.equal(GENERIC_GOODS_TEMPLATE.specRows.length, 9);
  assert.ok(GENERIC_GOODS_TEMPLATE.specRows.every((row) => row.level === "recommended"));
  assert.ok(r.score >= 0 && r.score <= 100);
});

test("generic template reads brand, pack size and includes from the item", () => {
  const item = { brand: "Pulse", packSize: "6", includes: ["Charger"], specs: [] };
  const keys = specIssues(item, null).warnings.map((w) => w.key);
  assert.ok(!keys.includes("brand") && !keys.includes("pack-size") && !keys.includes("includes"));
  assert.ok(keys.includes("warranty"));
});

test("a type without specRows uses the generic template", () => {
  assert.deepEqual(specIssues({ specs: [] }, type("shoes-eu")).blockers, []);
});

test("an item with no specs array does not throw", () => {
  assert.deepEqual(specIssues({}, type("phone")).blockers.map((b) => b.key), ["warranty"]);
});

test("a type with more than four required rows is rejected", () => {
  const rows = Array.from({ length: MAX_REQUIRED_ROWS + 1 }, (_, i) => ({ key: `r${i}`, label: `R${i}`, level: "required", input: "text" }));
  assert.match(checkSpecRows(rows).join(), /at most 4 required/);
  assert.throws(() => specIssues({}, { id: "bad", specRows: rows }), /at most 4 required/);
  assert.ok(checkProductType({ ...type("phone"), specRows: rows }).some((p) => /at most 4 required/.test(p)));
});

test("row definitions are validated", () => {
  const bad = [{ key: "A b", label: "", level: "must", input: "pick" }, { key: "c", label: "C", level: "required", input: "choice" }];
  const problems = checkSpecRows(bad).join("\n");
  for (const part of [".key", ".label", ".level", ".input", "choices: required"]) assert.ok(problems.includes(part), part);
  assert.match(checkSpecRows([{ key: "a", label: "A", level: "optional", input: "text" }, { key: "a", label: "B", level: "optional", input: "text" }]).join(), /unique/);
});

test("every shipped product type is valid and within the required limit", () => {
  for (const t of PRODUCT_TYPES) assert.deepEqual(checkProductType(t), [], t.id);
});
