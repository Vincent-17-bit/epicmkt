import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabel, rowToPlan, sortPlans, currentPlan, nextPlan, upgradeSummary, upgradeLine, pricePerMonth } from "./plans.js";

const std = { key: "standard", priceKes: 500, itemsLimit: 25, topBenefits: ["a", "b", "c"] };
const prem = { key: "premium", priceKes: 1300, itemsLimit: 70, topBenefits: ["d", "e", "f"] };

test("a database row becomes a plan", () => {
  assert.deepEqual(rowToPlan({ plan_key: "premium", price_kes: 1300, items_limit: 70, top_benefits: ["x"] }), { key: "premium", priceKes: 1300, itemsLimit: 70, topBenefits: ["x"] });
  assert.deepEqual(rowToPlan({ plan_key: "standard", price_kes: 0, items_limit: 5 }).topBenefits, []);
});

test("plans sort cheapest first whatever order they arrive in", () => {
  assert.deepEqual(sortPlans([prem, std]).map((p) => p.key), ["standard", "premium"]);
  assert.deepEqual(sortPlans(undefined), []);
});

test("current and next plan", () => {
  const onStandard = { current: "standard", plans: [prem, std] };
  assert.equal(currentPlan(onStandard).key, "standard");
  assert.equal(nextPlan(onStandard).key, "premium");
  const onPremium = { current: "premium", plans: [std, prem] };
  assert.equal(nextPlan(onPremium), null, "nothing above the highest plan");
  assert.equal(nextPlan({ current: "gold", plans: [std, prem] }), null, "an unknown current plan has no next plan");
  assert.equal(currentPlan(undefined), null);
  assert.equal(nextPlan(undefined), null);
});

test("the upgrade line and summary use only the numbers they are given", () => {
  assert.equal(upgradeLine({ current: "standard", plans: [std, prem] }), "Premium lists up to 70 items, KSh 1,300 a month.");
  const other = { ...prem, priceKes: 2000, itemsLimit: 100 };
  assert.equal(upgradeLine({ current: "standard", plans: [std, other] }), "Premium lists up to 100 items, KSh 2,000 a month.");
  assert.deepEqual(upgradeSummary({ current: "standard", plans: [std, prem] }).extraItems, 45);
  assert.equal(upgradeLine({ current: "premium", plans: [std, prem] }), "");
  assert.equal(upgradeSummary({ current: "premium", plans: [std, prem] }), null);
});

test("labels and prices", () => {
  assert.equal(planLabel("premium"), "Premium");
  assert.equal(planLabel(""), "");
  assert.equal(pricePerMonth(1300), "KSh 1,300 a month");
});
