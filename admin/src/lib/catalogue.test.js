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

// ---- Plan limits and feature switches (Prompt 11.5) ----
import { LIMIT_GROUPS, SWITCHES, limitsChanged, limitsForm, limitsImpact, limitsPayload, limitsProblems, planTotals } from "./catalogue.js";

const planRows = [
  { category_id: "bakery", plan_key: "standard", live_businesses: 12, versions: 2 },
  { category_id: "bakery", plan_key: "premium", live_businesses: 0, versions: 1 },
  { category_id: "salon", plan_key: "standard", live_businesses: 3, versions: 1 },
  { category_id: "salon", plan_key: "premium", live_businesses: 4, versions: 3 }
];

test("the form shows the number a plan has now, the hard limit where it lowers nothing, and every switch on by default", () => {
  const f = limitsForm({ standard: { options: { axes: 2 }, features: { threeD: false } } }, "standard");
  assert.deepEqual(f.options, { axes: "2", values: "40", variants: "200" });
  assert.deepEqual(f.threeD, { models: "40", spinFrames: "72" });
  assert.equal(f.features.threeD, false);
  assert.ok(f.features.options && f.features.recommend && f.features.delivery && f.features.demand);
  assert.equal(LIMIT_GROUPS.length, 2);
  assert.equal(SWITCHES.length, 5);
});

test("what the form sends: numbers as numbers, a blank limit left out", () => {
  const f = limitsForm({}, "premium");
  f.options.axes = "2";
  f.options.values = "";
  assert.deepEqual(limitsPayload(f).options, { axes: 2, variants: 200 });
});

test("a limit outside the rules is reported by name; a clean form has no problems", () => {
  const f = limitsForm({}, "standard");
  assert.deepEqual(limitsProblems(f), {});
  f.options.axes = "4";
  f.threeD.spinFrames = "5";
  f.options.variants = "12a";
  assert.deepEqual(Object.keys(limitsProblems(f)).sort(), ["options.axes", "options.variants", "threeD.spinFrames"]);
});

test("changed is true only when the form differs from what is saved, and false for a form with a problem", () => {
  const stored = { standard: { options: { axes: 2 } } };
  const f = limitsForm(stored, "standard");
  assert.equal(limitsChanged("standard", stored, f), false);
  f.options.axes = "1";
  assert.equal(limitsChanged("standard", stored, f), true);
  f.options.axes = "9";
  assert.equal(limitsChanged("standard", stored, f), false);
});

test("totals sum live shops and versions per plan over every category, so a limits change cannot shift them", () => {
  const t = planTotals(planRows);
  assert.deepEqual(t.standard, { live: 15, versions: 3, categories: 2 });
  assert.deepEqual(t.premium, { live: 4, versions: 4, categories: 1 });
  assert.deepEqual(planTotals([]).standard, { live: 0, versions: 0, categories: 0 });
  const f = limitsForm({}, "standard");
  f.options.axes = "1";
  limitsImpact("standard", {}, f, planRows);
  assert.deepEqual(planTotals(planRows), t, "building the preview does not touch the rows");
});

test("impact: a lowered limit says how many live shops and categories it reaches; a raised one and a feature switched off or on are worded too", () => {
  const f = limitsForm({}, "standard");
  f.options.axes = "2";
  f.features.threeD = false;
  const lines = limitsImpact("standard", {}, f, planRows);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Option types per item: 3 becomes 2.*15 live shops in 2 categories will be held to 2.*Items already saved are not changed/);
  assert.match(lines[1], /3D and 360 views is switched off for Standard.*15 live shops in 2 categories lose it/);
  const back = limitsForm({ standard: { options: { axes: 2 } } }, "standard");
  back.options.axes = "3";
  assert.match(limitsImpact("standard", { standard: { options: { axes: 2 } } }, back, planRows)[0], /2 becomes 3.*can use the higher limit straight away/);
  const on = limitsForm({ premium: { features: { recommend: false } } }, "premium");
  on.features.recommend = true;
  assert.match(limitsImpact("premium", { premium: { features: { recommend: false } } }, on, planRows)[0], /switched on for Premium.*4 live shops get it straight away/);
});

test("impact on a plan with no live shops says so instead of a number", () => {
  const f = limitsForm({}, "premium");
  f.threeD.models = "0";
  assert.match(limitsImpact("premium", {}, f, [{ plan_key: "premium", live_businesses: 0, versions: 1 }])[0], /No live shops are on this plan/);
  assert.deepEqual(limitsImpact("premium", {}, limitsForm({}, "premium"), planRows), [], "no change, no lines");
});
