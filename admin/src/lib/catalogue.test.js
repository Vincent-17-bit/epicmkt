import test from "node:test";
import assert from "node:assert/strict";
import { cleanField, docKeyFromLabel, docProblems, groupPlans, keyFromLabel, move, parseOptions, planImpact, planProblems, removeField, templateProblems } from "./catalogue.js";

test("keys are made from labels, valid for the database, and unique", () => {
  assert.equal(keyFromLabel("Walk-ins welcome"), "walkInsWelcome");
  assert.equal(keyFromLabel("Delivery area"), "deliveryArea");
  assert.equal(keyFromLabel("24 hour service"), "field24HourService");
  assert.equal(keyFromLabel("???"), "field");
  assert.equal(keyFromLabel("Delivery", ["delivery"]), "delivery2");
  assert.equal(keyFromLabel("Delivery", ["delivery", "delivery2"]), "delivery3");
  for (const label of ["Walk-ins welcome", "24 hour service", "???", "x".repeat(100)]) assert.match(keyFromLabel(label), /^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
  assert.equal(docKeyFromLabel("KEBS mark certificate"), "kebs_mark_certificate");
  assert.equal(docKeyFromLabel("!", ["document"]), "document_2");
});

test("options come from lines, trimmed and without repeats", () => {
  assert.deepEqual(parseOptions(" Hair \n\nNails\nHair\n  "), ["Hair", "Nails"]);
  assert.deepEqual(parseOptions(null), []);
});

test("cleaning a field keeps only what the application form understands", () => {
  assert.deepEqual(cleanField({ key: "k", label: " Kind ", type: "select", options: [" A ", ""], required: true, filterable: false, junk: 1 }), { key: "k", label: "Kind", type: "select", options: ["A"], required: true });
  assert.deepEqual(cleanField({ key: "k", label: "Yes", type: "boolean", options: ["stale"], showIf: { field: "d" } }), { key: "k", label: "Yes", type: "boolean", showIf: { field: "d", equals: true } });
});

test("template problems are reported per question, in words", () => {
  const ok = [{ key: "delivery", label: "Delivery", type: "boolean" }, { key: "area", label: "Area", type: "text", showIf: { field: "delivery", equals: true } }];
  assert.deepEqual(templateProblems(ok), {});
  const bad = [
    { key: "a", label: "", type: "text" },
    { key: "a", label: "Dup", type: "text" },
    { key: "c", label: "Pick", type: "select", options: ["Only"] },
    { key: "d", label: "Dep", type: "text", showIf: { field: "ghost" } },
    { key: "e", label: "Self", type: "text", showIf: { field: "e" } },
  ];
  const p = templateProblems(bad);
  assert.match(p[0][0], /label/);
  assert.match(p[1][0], /already uses this key/);
  assert.match(p[2][0], /at least two choices/);
  assert.match(p[3][0], /does not exist/);
  assert.match(p[4][0], /itself/);
  assert.match(templateProblems(Array.from({ length: 41 }, (_, i) => ({ key: `k${i}`, label: "x", type: "text" })))[0][0], /at most 40/);
});

test("document problems", () => {
  assert.deepEqual(docProblems([{ key: "a", label: "Licence", rule: "required", why: "Because" }]), {});
  const p = docProblems([{ key: "a", label: "", rule: "conditional", why: "", condition: "" }, { key: "a", label: "Dup", rule: "required", why: "ok" }]);
  assert.equal(p[0].length, 3);
  assert.match(p[1][0], /same key|Another document/);
});

test("reordering and removing keep the template valid", () => {
  assert.deepEqual(move([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(move([1, 2, 3], 2, 0), [3, 1, 2]);
  const same = [1, 2];
  assert.equal(move(same, 0, 5), same);
  const fields = [{ key: "delivery", label: "D", type: "boolean" }, { key: "area", label: "A", type: "text", showIf: { field: "delivery", equals: true } }];
  const after = removeField(fields, 0);
  assert.deepEqual(after, [{ key: "area", label: "A", type: "text" }]);
  assert.deepEqual(templateProblems(after), {});
});

test("plan edits explain who pays what", () => {
  const row = { price_kes: 500, live_businesses: 12, live_monthly_kes: 6000 };
  assert.deepEqual(planImpact(row, 500), [], "no price change, nothing to warn about");
  const lines = planImpact(row, 600);
  assert.match(lines[0], /KES 600 a month instead of KES 500 \(\+KES 100\)/);
  assert.match(lines[1], /12 live businesses keep the monthly price.*KES 6,000/);
  assert.match(planImpact({ ...row, live_businesses: 0 }, 400)[1], /No live businesses/);
  assert.match(planImpact({ ...row, live_businesses: 1 }, 400)[1], /1 live business keeps/);
});

test("plan validation and grouping", () => {
  assert.deepEqual(planProblems({ price: 500, benefits: ["Listed", "Contact", "Hours"], badge: "Popular" }), []);
  assert.equal(planProblems({ price: -5, benefits: ["a", "b"], badge: "Cheap" }).length, 3);
  assert.equal(planProblems({ price: 1.5, benefits: ["ab", "cd", "ef"], badge: "" }).length, 1);
  const g = groupPlans([
    { category_id: "bakery", category_name: "Bakery", plan_key: "standard", price_kes: 500 },
    { category_id: "bakery", category_name: "Bakery", plan_key: "premium", price_kes: 1300 },
    { category_id: "barber", category_name: "Barber", plan_key: "standard", price_kes: 400 },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].plans.premium.price_kes, 1300);
});
