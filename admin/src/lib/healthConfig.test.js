import { test } from "node:test";
import assert from "node:assert/strict";
import { fromForm, isChanged, toForm, weightShares } from "./healthConfig.js";

const config = {
  weights: { profile: 20, freshness: 25, activity: 35, trust: 20 }, grace_days: 14, neutral: 70, freshness_days: 14,
  freshness_days_by_category: { bakery: 3, tailor: 60 }, activity_full_days: 3, activity_zero_days: 30,
  trust: { flag: 25, flag_cap: 50, report: 15, report_cap: 30, strike: 20, strike_cap: 60 },
  serious_flag_days: 7, bands: { healthy: 70, watch: 40 },
};

test("the form round-trips the configuration", () => {
  const { config: back, errors } = fromForm(toForm(config));
  assert.deepEqual(errors, {});
  assert.deepEqual(back, config);
});

test("every number is checked against its range, with a message that names the field", () => {
  const form = { ...toForm(config), w_profile: "101", grace_days: "-1", freshness_days: "0", neutral: "abc", t_flag: "12.5" };
  const { config: out, errors } = fromForm(form);
  assert.equal(out, null);
  assert.match(errors.w_profile, /Profile weight: a whole number from 0 to 100/);
  assert.match(errors.grace_days, /0 to 90/);
  assert.match(errors.freshness_days, /1 to 365/);
  assert.ok(errors.neutral && errors.t_flag);
});

test("weights cannot all be zero; bands and activity thresholds must be in order", () => {
  const zero = { ...toForm(config), w_profile: "0", w_freshness: "0", w_activity: "0", w_trust: "0" };
  assert.match(fromForm(zero).errors.form, /At least one weight/);
  assert.match(fromForm({ ...toForm(config), band_watch: "70" }).errors.band_watch, /lower than/);
  assert.match(fromForm({ ...toForm(config), activity_zero_days: "3" }).errors.activity_zero_days, /above/);
});

test("category windows: one row per category, days from 1 to 365", () => {
  const form = toForm(config);
  form.categories = [{ id: "bakery", days: "3" }, { id: "bakery", days: "5" }, { id: "", days: "2" }, { id: "tailor", days: "400" }];
  const { errors } = fromForm(form);
  assert.equal(errors["category:0"], undefined);
  assert.match(errors["category:1"], /already listed/);
  assert.match(errors["category:2"], /Choose a category/);
  assert.match(errors["category:3"], /1 to 365/);
});

test("weight shares add up to the live percentages", () => {
  assert.deepEqual(weightShares(toForm(config)).map((w) => w.share), [20, 25, 35, 20]);
  const half = { ...toForm(config), w_profile: "1", w_freshness: "1", w_activity: "0", w_trust: "0" };
  assert.deepEqual(weightShares(half).map((w) => w.share), [50, 50, 0, 0]);
  assert.deepEqual(weightShares({ ...half, w_profile: "0", w_freshness: "0" }).map((w) => w.share), [0, 0, 0, 0]);
  assert.equal(weightShares({ ...half, w_profile: "x" })[0].value, 0);
});

test("isChanged ignores formatting, not values", () => {
  const form = toForm(config);
  assert.equal(isChanged(form, config), false);
  assert.equal(isChanged({ ...form, grace_days: "014" }, config), false);
  assert.equal(isChanged({ ...form, grace_days: "15" }, config), true);
  assert.equal(isChanged({ ...form, grace_days: "" }, config), true);
  assert.equal(isChanged({ ...form, categories: [] }, config), true);
});
