import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "../scales/index.js";
import { unitPriceText } from "./unitPrice.js";

const size = (scale, raw) => parse(scale, raw, {}).value;

test("bread: KES 144 per kg from 115 for 800 g", () => {
  assert.equal(unitPriceText(115, size("weight", "800 g")), "KES 144 per kg");
  assert.equal(unitPriceText(60, size("weight", "400 g")), "KES 150 per kg");
});

test("water: KES 4 per L from 80 for 20 L", () => {
  assert.equal(unitPriceText(80, size("volume", "20 L")), "KES 4 per L");
  assert.equal(unitPriceText(30, size("volume", "5 litres")), "KES 6 per L");
});

test("millilitres and kilograms are converted", () => {
  assert.equal(unitPriceText(50, size("volume", "500 ml")), "KES 100 per L");
  assert.equal(unitPriceText(300, size("weight", "2 kg")), "KES 150 per kg");
});

test("no unit price for other scales, missing price or missing size", () => {
  assert.equal(unitPriceText(100, size("length", "2 m")), null);
  assert.equal(unitPriceText(null, size("weight", "1 kg")), null);
  assert.equal(unitPriceText(0, size("weight", "1 kg")), null);
  assert.equal(unitPriceText(100, null), null);
});
