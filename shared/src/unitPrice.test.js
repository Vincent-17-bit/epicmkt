import test from "node:test";
import assert from "node:assert/strict";
import { multipackOf, sizeInItemName, pieceCountOf, unitPrice, unitPricePolicy, unitPrices } from "./unitPrice.js";

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

const M = { measure: true };

test("the size an item's name states, only when it states exactly one", () => {
  assert.equal(sizeInItemName("Soda 24 Pack"), "24 Pack");
  assert.equal(sizeInItemName("Water 6 x 500 ml", M), "6 x 500 ml");
  assert.equal(sizeInItemName("Cola Pack of 6 x 500ml", M), "Pack of 6 x 500ml");
  assert.equal(sizeInItemName("Eggs half dozen"), "half dozen");
  assert.equal(sizeInItemName("Bread 400g", M), "400g");
  assert.equal(sizeInItemName("Cooking Oil 1.5 Litres", M), "1.5 Litres");
  assert.equal(sizeInItemName("Red Bull Assorted (250 mL & 355 mL)", M), "");
  assert.equal(sizeInItemName("Socks 3 pairs or 6 pairs"), "");
  assert.equal(sizeInItemName("Soda", M), "");
});

test("a weight or volume is read from the name only when the caller allows it", () => {
  assert.equal(sizeInItemName("Bread 400g"), "");
  assert.equal(sizeInItemName("Bread 400g", { measure: false }), "");
  assert.equal(sizeInItemName("Bread 400g", M), "400g");
  assert.equal(sizeInItemName("Soda 500 ml 24 Pack"), "24 Pack");
});

test("a count and a measure in one name read as a multipack", () => {
  assert.equal(sizeInItemName("Soda 500 ml 24 Pack", M), "24 x 500 ml");
  assert.deepEqual(unitPrices(2400, sizeInItemName("Soda 500 ml 24 Pack", M)).map((x) => x.text), ["KES 100 per piece", "KES 200 per L"]);
  assert.equal(sizeInItemName("Socks 400 g 3 pairs", M), "");
});

test("a name that only looks like a size gives nothing, even when measures are allowed", () => {
  for (const name of ["Phone 8 L", "Laptop 15.6 in 8 g", "Model A8-L", "Phone 8 GB RAM 128 GB", "Router 5 g", "Samsung 6 G", "Mixer 1/2 L bowl", "Tecno Spark 5G"]) assert.equal(sizeInItemName(name, M), "", name);
});

test("real sizes read when measures are allowed", () => {
  assert.equal(sizeInItemName("Mango Juice 1L", M), "1L");
  assert.equal(sizeInItemName("Mango Juice 1 Litre", M), "1 Litre");
  assert.equal(sizeInItemName("Sugar 2kg", M), "2kg");
  assert.equal(sizeInItemName("Flour 500 g", M), "500 g");
  assert.equal(sizeInItemName("Flour 500 grams", M), "500 grams");
});

test("unitPrices can leave out weights and volumes, or counts", () => {
  assert.deepEqual(unitPrices(1200, "6 x 500 ml", { measure: false }).map((x) => x.text), ["KES 200 per piece"]);
  assert.deepEqual(unitPrices(1200, "6 x 500 ml", { count: false }).map((x) => x.text), ["KES 400 per L"]);
  assert.deepEqual(unitPrices(1200, "1 kg", { measure: false }), []);
  assert.deepEqual(unitPrices(1200, "Pack of 6", { count: false }), []);
});

test("the policy asks for positive evidence before reading a measure from a name", () => {
  const p = unitPricePolicy;
  assert.deepEqual(p({ productType: "bread" }), { measure: true, nameMeasure: true, count: true });
  assert.deepEqual(p({ productType: "fragrance" }), { measure: false, nameMeasure: false, count: true });
  assert.deepEqual(p({ productType: "meat-by-weight" }), { measure: true, nameMeasure: true, count: true });
  for (const productType of ["phone", "memory-card", "shoes-eu", "table", "sofa", "led-bulb", "gold-necklace"]) assert.deepEqual(p({ productType }), { measure: false, nameMeasure: false, count: true }, productType);
  assert.deepEqual(p({ productType: "printing" }), { measure: false, nameMeasure: false, count: false });
  assert.deepEqual(p({ kind: "service", productType: "bread" }), { measure: false, nameMeasure: false, count: false });
});

test("an untyped item or an item of another type never reads a measure from its name, but can still count", () => {
  assert.equal(unitPricePolicy({}).nameMeasure, false);
  assert.equal(unitPricePolicy({ productType: "liquor" }).nameMeasure, true);
  assert.equal(unitPricePolicy({}).count, true);
  assert.equal(unitPricePolicy({}).measure, true);
});
