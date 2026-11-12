import test from "node:test";
import assert from "node:assert/strict";
import { specIssues } from "./specIssues.js";
import { resolveRows, checkCondition } from "./conditional.js";
import { checkSpecRows } from "./rows.js";
import { LABEL_SETS, labelFor, rowChoices } from "./labels.js";
import { getFixture, productTypeById, checkProductType } from "../contracts/index.js";

const necklace = () => getFixture("fx-necklace").detail;
const fragrance = () => getFixture("fx-fragrance").detail;
const tags = { gold: ["precious-metal"], silver: ["precious-metal"], brass: [] };
const withSpecs = (item, specs) => ({ ...item, options: [], specs });

test("gold necklace without purity is blocked when material is tagged precious-metal", () => {
  const item = withSpecs(necklace(), [{ label: "Material", value: "Gold" }]);
  const r = specIssues(item, productTypeById("gold-necklace"), { tags });
  assert.deepEqual(r.blockers.map((b) => b.key), ["purity"]);
});

test("brass necklace does not need purity", () => {
  const item = withSpecs(necklace(), [{ label: "Material", value: "Brass" }]);
  assert.deepEqual(specIssues(item, productTypeById("gold-necklace"), { tags }).blockers, []);
});

test("an untagged or unknown material does not need purity", () => {
  const item = withSpecs(necklace(), [{ label: "Material", value: "Mystery alloy" }]);
  assert.deepEqual(specIssues(item, productTypeById("gold-necklace"), { tags }).blockers, []);
  assert.deepEqual(specIssues(item, productTypeById("gold-necklace")).blockers, []);
});

test("tag lookup ignores case and spacing, and accepts a function", () => {
  const item = withSpecs(necklace(), [{ label: "Material", value: "  GOLD " }]);
  assert.equal(specIssues(item, productTypeById("gold-necklace"), { tags }).blockers.length, 1);
  const fn = (v) => (String(v).toLowerCase().includes("gold") ? ["precious-metal"] : []);
  assert.equal(specIssues(item, productTypeById("gold-necklace"), { tags: fn }).blockers.length, 1);
});

test("the shipped necklace fixture passes: its purity axis answers the row", () => {
  const r = specIssues(necklace(), productTypeById("gold-necklace"), { tags });
  assert.deepEqual(r.blockers, []);
});

test("purity given as a spec clears the blocker", () => {
  const item = withSpecs(necklace(), [{ label: "Material", value: "Gold" }, { label: "Purity", value: "22K" }]);
  assert.deepEqual(specIssues(item, productTypeById("gold-necklace"), { tags }).blockers, []);
});

test("grandfathered keeps a conditional blocker as a warning", () => {
  const item = withSpecs(necklace(), [{ label: "Material", value: "Gold" }]);
  const r = specIssues(item, productTypeById("gold-necklace"), { tags, grandfathered: true });
  assert.deepEqual(r.blockers, []);
  assert.ok(r.warnings.some((w) => w.key === "purity" && w.level === "required"));
});

const accessory = {
  id: "phone-accessory",
  specRows: [
    { key: "accessory", label: "Accessory", level: "required", input: "choice", choices: ["Case", "Protector", "Cable"] },
    { key: "compat-model", label: "Compatible model", level: "optional", input: "text", requiredIf: { row: "accessory", in: ["Case", "Protector"] } },
    { key: "length", label: "Cable length", level: "recommended", input: "text", showIf: { row: "accessory", equals: "Cable" } }
  ]
};

test("compatible model is required only for cases and protectors", () => {
  const keys = (kind) => specIssues({ specs: [{ label: "Accessory", value: kind }] }, accessory).blockers.map((b) => b.key);
  assert.deepEqual(keys("Case"), ["compat-model"]);
  assert.deepEqual(keys("Protector"), ["compat-model"]);
  assert.deepEqual(keys("Cable"), []);
});

test("showIf hides a row from the issues and the score", () => {
  const hidden = specIssues({ specs: [{ label: "Accessory", value: "Case" }, { label: "Compatible model", value: "X1" }] }, accessory);
  assert.equal(hidden.warnings.length, 0);
  assert.equal(hidden.score, 100);
  const shown = specIssues({ specs: [{ label: "Accessory", value: "Cable" }] }, accessory);
  assert.deepEqual(shown.warnings.map((w) => w.key), ["length"]);
  assert.equal(shown.score, 0);
});

test("resolveRows lists visible rows with their effective level", () => {
  const rows = resolveRows({ specs: [{ label: "Accessory", value: "Case" }] }, accessory.specRows);
  assert.deepEqual(rows.map((r) => [r.key, r.level]), [["accessory", "required"], ["compat-model", "required"]]);
});

test("all, any, not, present and equals combine", () => {
  const rows = [
    { key: "a", label: "A", level: "optional", input: "text" },
    { key: "b", label: "B", level: "optional", input: "text" },
    { key: "c", label: "C", level: "optional", input: "text", requiredIf: { all: [{ row: "a", present: true }, { not: { row: "b", present: true } }] } },
    { key: "d", label: "D", level: "optional", input: "text", requiredIf: { any: [{ row: "a", equals: "x" }, { row: "b", equals: "y" }] } }
  ];
  const level = (specs, key) => resolveRows({ specs }, rows).find((r) => r.key === key).level;
  assert.equal(level([{ label: "A", value: "1" }], "c"), "required");
  assert.equal(level([{ label: "A", value: "1" }, { label: "B", value: "2" }], "c"), "optional");
  assert.equal(level([{ label: "B", value: "Y" }], "d"), "required");
  assert.equal(level([{ label: "B", value: "z" }], "d"), "optional");
});

test("condition validation", () => {
  const keys = ["a", "b"];
  assert.deepEqual(checkCondition({ row: "a", equals: "x" }, keys, "b", "c"), []);
  assert.match(checkCondition({ row: "zzz", equals: "x" }, keys, "b", "c").join(), /key of a row/);
  assert.match(checkCondition({ row: "b", equals: "x" }, keys, "b", "c").join(), /itself/);
  assert.match(checkCondition({ row: "a" }, keys, "b", "c").join(), /exactly one/);
  assert.match(checkCondition({ row: "a", equals: "x", tag: "t" }, keys, "b", "c").join(), /exactly one/);
  assert.match(checkCondition({ all: [] }, keys, "b", "c").join(), /non-empty/);
  assert.match(checkCondition("x", keys, "b", "c").join(), /object/);
  const bad = [{ key: "a", label: "A", level: "optional", input: "text", showIf: { row: "nope", present: true } }];
  assert.match(checkSpecRows(bad).join(), /showIf.row/);
});

test("a requiredIf row counts toward the four-required limit", () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ key: `r${i}`, label: `R${i}`, level: "required", input: "text" }));
  rows.push({ key: "x", label: "X", level: "optional", input: "text", requiredIf: { row: "r0", present: true } });
  assert.match(checkSpecRows(rows).join(), /at most 4 required/);
});

test("label sets have the agreed fixed choices", () => {
  const ids = (k) => LABEL_SETS[k].choices.map((c) => c.id);
  assert.deepEqual(ids("condition"), ["new", "refurbished", "used"]);
  assert.deepEqual(ids("authenticity"), ["original", "inspired"]);
  assert.deepEqual(ids("fragranceState"), ["sealed", "tester", "decant"]);
  assert.deepEqual(ids("chargerKind"), ["original", "compatible", "refill"]);
});

test("authenticity wording never says copy, fake or replica", () => {
  const text = JSON.stringify(LABEL_SETS).toLowerCase();
  for (const word of ["copy", "fake", "replica", "counterfeit", "knock"]) assert.ok(!text.includes(word), word);
});

test("labelFor maps ids and labels, rowChoices reads sets", () => {
  assert.equal(labelFor("condition", "REFURBISHED"), "Refurbished");
  assert.equal(labelFor("condition", "broken"), null);
  assert.equal(labelFor("nope", "new"), null);
  assert.deepEqual(rowChoices({ labelSet: "chargerKind" }), ["Original", "Compatible", "Refill"]);
  assert.equal(rowChoices({}), null);
});

test("fragrance needs original or inspired", () => {
  const t = productTypeById("fragrance");
  assert.deepEqual(specIssues(fragrance(), t).blockers, []);
  const none = specIssues({ ...fragrance(), specs: [] }, t);
  assert.deepEqual(none.blockers.map((b) => [b.key, b.code]), [["authenticity", "missing"]]);
  for (const value of ["Copy", "Fake", "Replica"]) {
    const r = specIssues({ ...fragrance(), specs: [{ label: "Authenticity", value }] }, t);
    assert.deepEqual(r.blockers.map((b) => [b.key, b.code]), [["authenticity", "invalid"]], value);
  }
  for (const value of ["original", "INSPIRED"]) {
    assert.deepEqual(specIssues({ ...fragrance(), specs: [{ label: "Authenticity", value }] }, t).blockers, [], value);
  }
});

test("an invalid recommended choice warns and lowers the score", () => {
  const t = productTypeById("fragrance");
  const ok = specIssues(fragrance(), t);
  const bad = specIssues({ ...fragrance(), specs: [...fragrance().specs.filter((s) => s.label !== "Fragrance state"), { label: "Fragrance state", value: "Opened" }] }, t);
  assert.deepEqual(bad.blockers, []);
  assert.ok(bad.warnings.some((w) => w.key === "fragrance-state" && w.code === "invalid"));
  assert.ok(bad.score < ok.score);
});

test("a choice row outside its list is invalid; a free choice list is checked too", () => {
  const water = productTypeById("drinking-water");
  const item = getFixture("fx-water").detail;
  assert.deepEqual(specIssues(item, water).blockers, []);
  const bad = specIssues({ ...item, specs: [{ label: "Water type", value: "Rain" }] }, water);
  assert.deepEqual(bad.blockers.map((b) => [b.key, b.code]), [["water-type", "invalid"]]);
});

test("every shipped type with conditions or label sets validates", () => {
  for (const id of ["gold-necklace", "fragrance"]) assert.deepEqual(checkProductType(productTypeById(id)), [], id);
});
