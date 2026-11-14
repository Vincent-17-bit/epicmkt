import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_LIMIT_RULES, FEATURE_SWITCHES, planLimitValues, planSwitches, checkPlanLimits } from "./planLimits.js";
import { OPTION_LIMITS } from "./seller/options.js";
import { MEDIA3D } from "./media3d.js";
import { effectiveLimits } from "./options/editor.js";

test("the rules take their hard caps from the option and 3D limits, so the two cannot drift", () => {
  assert.equal(PLAN_LIMIT_RULES.options.axes.max, OPTION_LIMITS.axes);
  assert.equal(PLAN_LIMIT_RULES.options.values.max, OPTION_LIMITS.values);
  assert.equal(PLAN_LIMIT_RULES.options.variants.max, OPTION_LIMITS.variants);
  assert.equal(PLAN_LIMIT_RULES.threeD.spinFrames.min, MEDIA3D.spinMinFrames);
  assert.equal(PLAN_LIMIT_RULES.threeD.spinFrames.max, MEDIA3D.spinMaxFrames);
});

test("with nothing set a plan has every hard limit and every feature on, so no shop loses anything", () => {
  const v = planLimitValues("standard", null);
  assert.deepEqual(v.options, { axes: 3, values: 40, variants: 200 });
  assert.deepEqual(v.threeD, { models: 40, spinFrames: 72 });
  assert.ok(Object.values(planSwitches("premium", {})).every(Boolean));
  assert.equal(FEATURE_SWITCHES.length, 5);
});

test("a plan lowers a limit and the seller's editor honours it", () => {
  const global = { standard: { options: { axes: 2, values: 10, variants: 24 }, threeD: { models: 1, spinFrames: 24 } }, premium: {} };
  assert.deepEqual(planLimitValues("standard", global).options, { axes: 2, values: 10, variants: 24 });
  assert.deepEqual(effectiveLimits(global.standard.options), { axes: 2, values: 10, variants: 24 });
  assert.deepEqual(planLimitValues("premium", global).options, { axes: 3, values: 40, variants: 200 }, "the other plan is untouched");
});

test("a stored value that tries to raise a limit, or is not a whole number, is ignored on read", () => {
  const v = planLimitValues("standard", { standard: { options: { axes: 99, values: "x", variants: 0 }, threeD: { spinFrames: 5 } } });
  assert.deepEqual(v.options, { axes: 3, values: 40, variants: 200 });
  assert.equal(v.threeD.spinFrames, 72);
});

test("a switch is off only when it is set to false", () => {
  const f = planSwitches("standard", { standard: { features: { threeD: false, recommend: 0, delivery: null } } });
  assert.equal(f.threeD, false);
  assert.equal(f.recommend, true, "only false turns it off");
  assert.equal(f.delivery, true);
  assert.equal(f.options, true);
});

test("checkPlanLimits keeps only what differs from the defaults", () => {
  const r = checkPlanLimits({ options: { axes: 2, values: 40, variants: 50 }, threeD: { models: 0, spinFrames: 72 }, features: { threeD: false, options: true } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { options: { axes: 2, variants: 50 }, threeD: { models: 0 }, features: { threeD: false } });
});

test("checkPlanLimits names every bad field", () => {
  const r = checkPlanLimits({ options: { axes: 4, values: 0, variants: 1.5 }, threeD: { spinFrames: 11, models: -1 }, features: { teleport: true, recommend: "yes" } });
  assert.equal(r.ok, false);
  assert.equal(r.value, null);
  assert.deepEqual(Object.keys(r.errors).sort(), ["features.recommend", "features.teleport", "options.axes", "options.values", "options.variants", "threeD.models", "threeD.spinFrames"]);
  assert.match(r.errors["options.axes"], /1 to 3/);
});

test("empty input is valid and changes nothing", () => {
  for (const input of [undefined, null, {}, { options: {}, features: {} }]) assert.deepEqual(checkPlanLimits(input).value, { options: {}, threeD: {}, features: {} });
});
