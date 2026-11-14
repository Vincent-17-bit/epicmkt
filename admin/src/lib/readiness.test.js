import test from "node:test";
import assert from "node:assert/strict";
import { activationBlock, CHECKS, previewItem, readinessAll, readinessOf, readinessSummary, sandboxItem, sandboxTypes } from "./readiness.js";
import conformance from "../data/conformanceResult.json" with { type: "json" };

const bakery = { id: "bakery", name: "Bakery", priced_plans: 2 };
const types = [{ id: "bread", name: "Bread", categoryIds: ["bakery", "restaurant-cafe"], active: true }];
const okSpec = [{ id: "bread", specRows: [{ key: "ingredients", label: "Ingredients", level: "required", input: "text" }] }];
const good = { ok: true, categories: { bakery: { ok: true, types: ["bread"], failures: [] } }, types: {} };
const state = (r, key) => r.checks.find((c) => c.key === key).status;

test("a category with priced plans, a type, valid rules, a passing result and a preview is ready", () => {
  const r = readinessOf({ category: bakery, types, specTypes: okSpec, conformance: good });
  assert.equal(r.ready, true);
  assert.deepEqual(r.checks.map((c) => c.key), CHECKS.map((c) => c.key));
  assert.ok(r.checks.every((c) => c.status === "pass"));
  assert.equal(readinessSummary(r), "Ready");
  assert.ok(r.preview.card.name, "the preview item is a list card");
});

test("unpriced plans block, and the message says how many are priced", () => {
  const r = readinessOf({ category: { ...bakery, priced_plans: 1 }, types, specTypes: okSpec, conformance: good });
  assert.equal(r.ready, false);
  assert.equal(state(r, "plans"), "fail");
  assert.match(r.checks[0].detail, /1 of 2 plans/);
  assert.match(readinessSummary(r), /^Not ready: plans priced$/);
});

test("a category with no type is still ready: it sells plain items, and the page says so", () => {
  const r = readinessOf({ category: { id: "barbershop", name: "Barbershop", priced_plans: 2 }, types, specTypes: okSpec, conformance: { ok: true, categories: { barbershop: { ok: true, types: [], failures: [] } } } });
  assert.equal(r.ready, true);
  assert.equal(state(r, "types"), "warn");
  assert.equal(readinessSummary(r), "Ready, with a note");
  assert.match(r.checks.find((c) => c.key === "preview").detail, /plain item/);
});

test("an invalid spec row on one of its types blocks, naming the type", () => {
  const bad = [{ id: "bread", specRows: [{ key: "", label: "", level: "mandatory", input: "text" }] }];
  const r = readinessOf({ category: bakery, types, specTypes: bad, conformance: good });
  assert.equal(r.ready, false);
  assert.equal(state(r, "specRules"), "fail");
  assert.match(r.checks.find((c) => c.key === "specRules").detail, /^Bread:/);
});

test("a failing conformance result blocks and quotes the failure; a missing result or missing category blocks too", () => {
  const failing = { ok: false, categories: { bakery: { ok: false, types: ["bread"], failures: ["[price] the sample cannot be priced (no_price)"] } } };
  assert.match(readinessOf({ category: bakery, types, specTypes: okSpec, conformance: failing }).checks.find((c) => c.key === "conformance").detail, /1 failure: \[price\]/);
  assert.equal(readinessOf({ category: bakery, types, specTypes: okSpec, conformance: null }).ready, false);
  const missing = readinessOf({ category: { id: "new-one", name: "New", priced_plans: 2 }, types, specTypes: okSpec, conformance: good });
  assert.equal(missing.ready, false);
  assert.match(missing.checks.find((c) => c.key === "conformance").detail, /not in the stored result/);
});

test("an inactive type does not count as defined, and a type of another category is ignored", () => {
  const r = readinessOf({ category: bakery, types: [{ ...types[0], active: false }, { id: "table", name: "Table", categoryIds: ["home-kitchen"] }], specTypes: [], conformance: good });
  assert.equal(state(r, "types"), "warn");
});

test("every blocker is named, and activation is refused only when switching ON something that is not ready", () => {
  const r = readinessOf({ category: { ...bakery, priced_plans: 0 }, types, specTypes: okSpec, conformance: null });
  assert.deepEqual(r.blockers.map((b) => b.key), ["plans", "conformance"]);
  assert.equal(activationBlock(r, { turningOn: true }), "Not ready to switch on: plans priced, conformance suite.");
  assert.equal(activationBlock(r, { turningOn: false }), null, "switching off is always allowed");
  assert.equal(activationBlock(r, { turningOn: true, already: true }), null, "a category that is already on is not blocked from saving");
  assert.equal(activationBlock(readinessOf({ category: bakery, types, specTypes: okSpec, conformance: good }), { turningOn: true }), null);
});

test("the preview uses the category's first known type, else a plain item, and never throws", () => {
  assert.equal(previewItem(bakery, types).typeName, "Bread");
  assert.equal(previewItem(bakery, []).typeName, null);
  assert.equal(previewItem(bakery, [{ id: "unknown-type" }]).ok, true);
  assert.equal(previewItem(null, []).ok, false);
});

test("every live category in the stored conformance result gets a readiness row, and the real stored data passes the conformance check", () => {
  const all = readinessAll({ categories: Object.keys(conformance.categories).map((id) => ({ id, name: id, priced_plans: 2 })), types: [], specTypes: [], conformance });
  assert.equal(Object.keys(all).length, Object.keys(conformance.categories).length);
  assert.ok(Object.values(all).every((r) => r.checks.find((c) => c.key === "conformance").status === "pass"));
});

test("sandbox: a throwaway item of each type builds, prices, passes the gate and says what it is", () => {
  for (const { id } of sandboxTypes()) {
    const s = sandboxItem(id);
    assert.ok(s, id);
    assert.equal(s.blockers.length, 0, `${id}: ${JSON.stringify(s.blockers)}`);
    assert.ok(Number.isInteger(s.price.unit) && s.price.unit > 0, `${id} price`);
    assert.equal(s.payload.productType, id);
  }
  const phone = sandboxItem("phone");
  assert.deepEqual(phone.axes.map((a) => a.key), ["colour", "storage"]);
  assert.equal(phone.combinations, 4);
  assert.equal(sandboxItem("nope"), null);
});

test("sandbox: leaving the answers out shows the seller's blockers by name, without changing the type", () => {
  const empty = sandboxItem("phone", { complete: false });
  assert.deepEqual(empty.blockers.map((b) => b.label), ["Warranty"]);
  assert.match(empty.blockers[0].message, /required/);
  assert.deepEqual(empty.requiredRows, ["Warranty"]);
  assert.equal(sandboxItem("phone").blockers.length, 0);
});
