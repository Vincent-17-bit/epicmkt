import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuantity, normalizeQuantity, parseAmount, quantityModeOf, quantityRules } from "./quantity.js";
import { amountText, formatAmount, measuredLine, measuredMessage, measureTotal, perUnitText } from "./pricing/measure.js";
import { priceFor } from "./pricing.js";
import { getFixture } from "./contracts/fixtures/index.js";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const KG = { min: 0.5, step: 0.25, unit: "kg" };
const FABRIC = { id: "fx-fabric", name: "Kitenge fabric", quantityMode: "measure", unit: "m", regularPrice: 450, quantity: { min: 0.5, step: 0.5, unit: "m" } }; // TODO(contract:measure): no fabric fixture in Contract v1

test("never 0 or negative, whatever is typed", () => {
  for (const mode of ["units", "measure", "none"]) {
    for (const bad of [0, -1, -0.25, NaN, Infinity, "", " ", "abc", "1,5", null, undefined, {}, [], "-3"]) {
      const v = normalizeQuantity(mode, bad, { quantity: KG });
      assert.ok(v > 0, `${mode} ${String(bad)} -> ${v}`);
    }
  }
});

test("units: whole numbers, at least 1, nearest, halves up, capped by stock", () => {
  assert.equal(normalizeQuantity("units", 3), 3);
  assert.equal(normalizeQuantity("units", "4"), 4);
  assert.equal(normalizeQuantity("units", 2.4), 2);
  assert.equal(normalizeQuantity("units", 2.5), 3);
  assert.equal(normalizeQuantity("units", 0.4), 1);
  assert.equal(normalizeQuantity("units", 9, { stock: 5 }), 5);
  assert.equal(normalizeQuantity("units", 9, { stock: 5.9 }), 5);
  assert.equal(normalizeQuantity("units", 2, { stock: 0 }), 1);
  assert.equal(checkQuantity("units", 2, { stock: 0 }).reason, "sold_out");
});

test("measure: nearest step, halves up, minimum, maximum from stock", () => {
  const n = (v, stock) => normalizeQuantity("measure", v, { quantity: KG, stock });
  assert.equal(n(1.5), 1.5);
  assert.equal(n(1.6), 1.5);
  assert.equal(n(1.625), 1.75);
  assert.equal(n(1.62), 1.5);
  assert.equal(n(0.1), 0.5);
  assert.equal(n(0.3), 0.5);
  assert.equal(n(0.6), 0.5);
  assert.equal(n(0.625), 0.75);
  assert.equal(n(10, 3.1), 3);
  assert.equal(n(10, 0.4), 0.5);
  assert.equal(checkQuantity("measure", 10, { quantity: KG, stock: 0.4 }).reason, "sold_out");
  assert.equal(checkQuantity("measure", 10, { quantity: KG, stock: 3.1 }).reason, "above_max");
  assert.equal(checkQuantity("measure", 0.1, { quantity: KG }).reason, "below_min");
  assert.equal(checkQuantity("measure", "x", { quantity: KG }).reason, "not_a_number");
  assert.equal(checkQuantity("measure", 1.5, { quantity: KG }).changed, false);
});

test("measure: the minimum defaults to one step, the step to a quarter", () => {
  assert.deepEqual(quantityRules("measure", { quantity: { step: 0.5, unit: "m" } }), { mode: "measure", min: 0.5, step: 0.5, max: null, unit: "m" });
  assert.equal(normalizeQuantity("measure", 0.01), 0.25);
  assert.equal(quantityRules("measure", { quantity: KG, stock: 2.9 }).max, 2.75);
});

test("float noise cannot leak into a quantity", () => {
  assert.equal(normalizeQuantity("measure", 0.1 + 0.2 + 0.15, { quantity: KG }), 0.5);
  assert.equal(normalizeQuantity("measure", 0.7 + 0.8, { quantity: KG }), 1.5);
  assert.equal(normalizeQuantity("measure", 1.1 * 3, { quantity: KG }), 3.25);
});

test("none is always one", () => {
  assert.equal(normalizeQuantity("none", 7), 1);
  assert.deepEqual(quantityRules("none"), { mode: "none", min: 1, step: 1, max: 1, unit: null });
});

test("mode of an item: legacy items are whole units", () => {
  assert.equal(quantityModeOf(getFixture("fx-legacy").detail), "units");
  assert.equal(quantityModeOf({}), "units");
  assert.equal(quantityModeOf(null), "units");
  assert.equal(quantityModeOf(getFixture("fx-butcher").detail), "measure");
  assert.equal(quantityModeOf({ quantityMode: "none" }), "none");
  assert.equal(quantityModeOf({ quantityMode: "bogus" }), "units");
});

test("parseAmount reads plain numbers only", () => {
  assert.equal(parseAmount("1.5"), 1.5);
  assert.equal(parseAmount(" 2 "), 2);
  assert.equal(parseAmount("1,5"), null);
  assert.equal(parseAmount("1e3"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(NaN), null);
});

test("butcher: KES 800 per kg x 1.5 kg = 1,200, with the seller message", () => {
  assert.equal(measureTotal(800, 1.5), 1200);
  assert.equal(measuredMessage({ name: "Beef", amount: 1.5, unit: "kg", total: 1200 }), "Beef, 1.5 kg, KES 1,200");
  assert.equal(perUnitText(800, "kg"), "KES 800 per kg");
  const line = measuredLine({ name: "Beef", quantity: KG }, 800, "1.5");
  assert.deepEqual([line.amount, line.unit, line.total, line.message, line.reason], [1.5, "kg", 1200, "Beef, 1.5 kg, KES 1,200", null]);
});

test("butcher fixture: priceFor and measuredLine agree", () => {
  const butcher = getFixture("fx-butcher").detail;
  const mince = butcher.optionVariants.find((v) => v.choice.cut === "mince");
  const r = priceFor(butcher, mince.id, 1.75, NOW);
  assert.equal(r.unit, 620);
  assert.equal(r.total, 1085);
  const line = measuredLine({ ...butcher, name: "Beef mince" }, r.unit, 1.75);
  assert.equal(line.total, r.total);
  assert.equal(line.message, "Beef mince, 1.75 kg, KES 1,085");
});

test("fabric per metre", () => {
  assert.equal(measureTotal(450, 2.5), 1125);
  assert.equal(measureTotal(450, 0.5), 225);
  const line = measuredLine(FABRIC, 450, 3.2);
  assert.deepEqual([line.amount, line.total, line.message], [3, 1350, "Kitenge fabric, 3 m, KES 1,350"]);
  assert.equal(measuredLine(FABRIC, 450, 0).amount, 0.5);
  assert.equal(measuredLine(FABRIC, 450, 20, { stock: 6.4 }).amount, 6);
  assert.equal(priceFor(FABRIC, null, 2.5, NOW).total, 1125);
});

test("rounding edge cases: half up to the whole shilling", () => {
  assert.equal(measureTotal(750, 0.25), 188); // 187.5
  assert.equal(measureTotal(749, 0.25), 187); // 187.25
  assert.equal(measureTotal(751, 0.25), 188); // 187.75
  assert.equal(measureTotal(450, 2.75), 1238); // 1237.5
  assert.equal(measureTotal(333, 0.333), 111); // 110.889
  assert.equal(measureTotal(1, 0.5), 1); // 0.5 -> 1, never 0
  assert.equal(measureTotal(1, 0.25), 0); // 0.25 -> 0: a price this small cannot be sold by the quarter
  assert.equal(measureTotal(800, 0), 0);
  assert.equal(measureTotal("800", 1.5), 1200);
  assert.equal(measureTotal(null, 1.5), 0);
});

test("amount text", () => {
  assert.deepEqual([formatAmount(1.5), formatAmount(0.25), formatAmount(2), formatAmount(1.2346)], ["1.5", "0.25", "2", "1.235"]);
  assert.equal(amountText(2, "m"), "2 m");
  assert.equal(amountText(2), "2");
});

test("legacy whole-unit items are unchanged", () => {
  const legacy = getFixture("fx-legacy").detail;
  assert.equal(normalizeQuantity(quantityModeOf(legacy), 3), 3);
  const line = measuredLine({ ...legacy, name: "Plain item" }, 1500, 3);
  assert.deepEqual([line.amount, line.unit, line.total, line.message], [3, null, 4500, "Plain item, 3, KES 4,500"]);
  assert.equal(priceFor(legacy, null, 3, NOW).total, 4500);
});
