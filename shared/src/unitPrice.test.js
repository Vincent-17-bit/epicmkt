import test from "node:test";
import assert from "node:assert/strict";
import { multipackOf, sizeInItemName, pieceCountOf, unitPrice, unitPrices } from "./unitPrice.js";

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

test("pieceCountOf reads the count and what it counts", () => {
  assert.deepEqual(pieceCountOf("6-pack"), { n: 6, unit: "piece" });
  assert.deepEqual(pieceCountOf("3 pairs"), { n: 3, unit: "pair" });
  assert.equal(pieceCountOf("12"), null);
  assert.equal(pieceCountOf("pair"), null);
});

test("dozen, half dozen and pairs", () => {
  assert.equal(unitPrice(1200, "dozen").text, "KES 100 per piece");
  assert.equal(unitPrice(1200, "half dozen").text, "KES 200 per piece");
  assert.equal(unitPrice(1200, "2 dozen").text, "KES 50 per piece");
  assert.equal(unitPrice(1200, "3 pairs").text, "KES 400 per pair");
});

test("a multipack gives per piece and per litre or kilo of everything in it", () => {
  assert.deepEqual(unitPrices(1200, "6 x 500 ml").map((x) => x.text), ["KES 200 per piece", "KES 400 per L"]);
  assert.deepEqual(unitPrices(1200, "500ml x 6").map((x) => x.text), ["KES 200 per piece", "KES 400 per L"]);
  assert.deepEqual(unitPrices(900, "Pack of 3 x 1 kg").map((x) => x.text), ["KES 300 per piece", "KES 300 per kg"]);
  assert.deepEqual(multipackOf("1 x 500 ml"), null);
  assert.equal(multipackOf("6 x Large"), null);
});

test("the size an item's name states, only when it states exactly one", () => {
  assert.equal(sizeInItemName("Soda 24 Pack"), "24 Pack");
  assert.equal(sizeInItemName("Water 6 x 500 ml"), "6 x 500 ml");
  assert.equal(sizeInItemName("Cola Pack of 6 x 500ml"), "Pack of 6 x 500ml");
  assert.equal(sizeInItemName("Eggs half dozen"), "half dozen");
  assert.equal(sizeInItemName("Bread 400g"), "400g");
  assert.equal(sizeInItemName("Cooking Oil 1.5 Litres"), "1.5 Litres");
  assert.equal(sizeInItemName("Red Bull Assorted (250 mL & 355 mL)"), "");
  assert.equal(sizeInItemName("Socks 3 pairs or 6 pairs"), "");
  assert.equal(sizeInItemName("Tecno Spark 5G phone"), "");
  assert.equal(sizeInItemName("Phone 128GB 8GB RAM"), "");
  assert.equal(sizeInItemName("Soda"), "");
});

test("a count and a measure in one name read as a multipack", () => {
  assert.equal(sizeInItemName("Soda 500 ml 24 Pack"), "24 x 500 ml");
  assert.deepEqual(unitPrices(2400, sizeInItemName("Soda 500 ml 24 Pack")).map((x) => x.text), ["KES 100 per piece", "KES 200 per L"]);
  assert.equal(sizeInItemName("Socks 400 g 3 pairs"), "");
});
