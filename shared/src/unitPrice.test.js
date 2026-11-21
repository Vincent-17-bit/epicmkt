import test from "node:test";
import assert from "node:assert/strict";
import { pieceCountOf, unitPrice } from "./unitPrice.js";

test("a pack, set, box or pieces size gives a price per piece", () => {
  assert.deepEqual(unitPrice(1500, "Pack of 6"), { amount: 250, unit: "piece", text: "KES 250 per piece" });
  assert.equal(unitPrice(1000, "Set of 4").text, "KES 250 per piece");
  assert.equal(unitPrice(1200, "12 pcs").text, "KES 100 per piece");
  assert.equal(unitPrice(2400, "Box of 24").text, "KES 100 per piece");
  assert.equal(unitPrice(900, "x3").text, "KES 300 per piece");
});

test("the per-piece price is rounded to a whole shilling, half up", () => {
  assert.equal(unitPrice(1000, "Pack of 6").amount, 167);
  assert.equal(unitPrice(5, "Pack of 2").amount, 3);
});

test("a bare number, a pack of one and non-count sizes give nothing", () => {
  assert.equal(unitPrice(5000, "42"), null);
  assert.equal(unitPrice(5000, "64"), null);
  assert.equal(unitPrice(500, "Pack of 1"), null);
  assert.equal(unitPrice(500, "Large"), null);
  assert.equal(unitPrice(500, "3-seater"), null);
  assert.equal(unitPrice(500, "2 gang"), null);
  assert.equal(unitPrice(1, "Pack of 6"), null);
});

test("weights and volumes still win and keep their units", () => {
  assert.deepEqual(unitPrice(144, "1 kg"), { amount: 144, unit: "kg", text: "KES 144 per kg" });
  assert.equal(unitPrice(500, "500 ml").text, "KES 1,000 per L");
});

test("a bad price gives nothing", () => {
  assert.equal(unitPrice(0, "Pack of 6"), null);
  assert.equal(unitPrice("x", "Pack of 6"), null);
  assert.equal(unitPrice(100, null), null);
});

test("pieceCountOf reads the count", () => {
  assert.equal(pieceCountOf("6-pack"), 6);
  assert.equal(pieceCountOf("12"), null);
});
