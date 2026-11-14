import test from "node:test";
import assert from "node:assert/strict";
import { duplicateOf, readName, rowFor } from "./nameParse.js";

const labels = (name) => readName(name).map((c) => c.label);

test("reads sizes from ten real names", () => {
  assert.deepEqual(labels("Samsung Galaxy A15 128GB"), ["128 GB"]);
  assert.deepEqual(labels("Philips LED bulb 9W E27"), ["9 W", "E27"]);
  assert.deepEqual(labels("Double A A4 paper 80gsm"), ["A4"]);
  assert.deepEqual(labels("Drinking water 20L"), ["20 L"]);
  assert.deepEqual(labels("Drinking water 20 litres"), ["20 L"]);
  assert.deepEqual(labels("Brookside milk 500ml"), ["500 ml"]);
  assert.deepEqual(labels("Bread 400g"), ["400 g"]);
  assert.deepEqual(labels("Tecno Spark 10 256GB 5000mAh"), ["256 GB", "5000 mAh"]);
  assert.deepEqual(labels("Cooking oil 2 kg"), ["2 kg"]);
  assert.deepEqual(labels("Men's fade cut"), []);
});

test("does not read words that only look like sizes", () => {
  assert.deepEqual(labels("Item 3 pieces"), []);
  assert.deepEqual(labels("Gift 2go"), []);
  assert.deepEqual(labels(""), []);
  assert.deepEqual(labels(null), []);
});

test("a chip finds the type row it belongs to", () => {
  const rows = [{ key: "watts", label: "Wattage" }, { key: "base", label: "Lamp base" }, { key: "colour", label: "Colour" }];
  const [w, b] = readName("LED bulb 9W E27");
  assert.equal(rowFor(w, rows).key, "watts");
  assert.equal(rowFor(b, rows).key, "base");
  assert.equal(rowFor(readName("Water 20L")[0], rows), null);
});

test("finds an item the shop already sells", () => {
  const items = [{ id: "1", name: "Philips LED bulb 9W" }, { id: "2", name: "Cake", removedByAdmin: true }];
  assert.equal(duplicateOf("Philips LED bulb 12W", items).id, "1");
  assert.equal(duplicateOf("Philips LED bulb 9W", items).id, "1");
  assert.equal(duplicateOf("Cake", items), null);
  assert.equal(duplicateOf("Candle", items), null);
  assert.equal(duplicateOf("400g", items), null);
});
