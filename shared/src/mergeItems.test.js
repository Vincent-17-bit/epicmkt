import test from "node:test";
import assert from "node:assert/strict";
import { colourInName, mergePreview, similarGroups, similarKey, sizeInName, suggestAxes } from "./mergeItems.js";
import { unitPrice } from "./unitPrice.js";

test("the key ignores sizes, units and colours", () => {
  assert.equal(similarKey("Bread 400g"), "bread");
  assert.equal(similarKey("Bread 800 g"), "bread");
  assert.equal(similarKey("Drinking water 20 Litres"), "drinking water");
  assert.equal(similarKey("Cotton shirt Red"), "cotton shirt");
  assert.equal(similarKey("Cotton shirt"), "cotton shirt");
  assert.notEqual(similarKey("Rice 1kg"), similarKey("Flour 1kg"));
});

test("sizes and colours are read from the name", () => {
  assert.equal(sizeInName("Bread 400g"), "400 g");
  assert.equal(sizeInName("Water 20 litres"), "20 L");
  assert.equal(sizeInName("Water 500ml"), "500 ml");
  assert.equal(sizeInName("Rice 1,5 kg"), "1.5 kg");
  assert.equal(sizeInName("Plain bread"), "");
  assert.equal(colourInName("Shirt red"), "Red");
});

test("groups need two items without options and stay within a type", () => {
  const items = [
    { id: "a", name: "Bread 400g", productTypeId: "bread" }, { id: "b", name: "Bread 800g", productTypeId: "bread" },
    { id: "c", name: "Milk", productTypeId: "milk" }, { id: "d", name: "Bread 1kg", productTypeId: "bread", hasOptions: true },
    { id: "e", name: "Bread 600g", productTypeId: "other" }
  ];
  const groups = similarGroups(items);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((i) => i.id), ["a", "b"]);
});

test("axes are suggested from the names", () => {
  const axes = suggestAxes([{ id: "a", name: "Bread 400g" }, { id: "b", name: "Bread 800g" }]);
  assert.equal(axes.length, 1);
  assert.equal(axes[0].key, "weight");
  assert.deepEqual(axes[0].labels, { a: "400 g", b: "800 g" });
  const water = suggestAxes([{ id: "a", name: "Water 5 L" }, { id: "b", name: "Water 20 L" }]);
  assert.equal(water[0].key, "volume");
  assert.deepEqual(suggestAxes([{ id: "a", name: "Bread" }, { id: "b", name: "Bread" }]), []);
});

test("the preview grid has a row per size and a cell per item", () => {
  const items = [{ id: "a", price: 60 }, { id: "b", price: 110 }];
  const axes = [{ key: "weight", labels: { a: "400 g", b: "800 g" } }];
  const g = mergePreview(items, axes);
  assert.deepEqual(g.rows, ["400 g", "800 g"]);
  assert.equal(g.cell("800 g", "").price, 110);
});

test("unit price per kg and per L", () => {
  assert.equal(unitPrice(60, "400 g").text, "KES 150 per kg");
  assert.equal(unitPrice(110, "800 g").amount, 138);
  assert.equal(unitPrice(80, "20 L").text, "KES 4 per L");
  assert.equal(unitPrice(30, "5 L").amount, 6);
  assert.equal(unitPrice(100, "500 ml").text, "KES 200 per L");
  assert.equal(unitPrice(100, "Large"), null);
  assert.equal(unitPrice(0, "1 kg"), null);
  assert.equal(unitPrice("x", "1 kg"), null);
});
