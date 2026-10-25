import { test } from "node:test";
import assert from "node:assert/strict";
import { validateItemForm, emptyItemForm, formFromItem } from "./itemForm.js";

const base = { ...emptyItemForm(), name: "Fade cut", price: "500" };

test("a valid fixed item", () => {
  const r = validateItemForm(base);
  assert.equal(r.ok, true);
  assert.deepEqual([r.value.price, r.value.priceMax, r.value.salePrice], [500, null, null]);
});

test("name, price and sale price rules", () => {
  assert.equal(validateItemForm({ ...base, name: "x" }).errors.name.length > 0, true);
  assert.ok(validateItemForm({ ...base, price: "" }).errors.price);
  assert.ok(validateItemForm({ ...base, price: "abc" }).errors.price);
  assert.ok(validateItemForm({ ...base, salePrice: "500" }).errors.salePrice);
  assert.equal(validateItemForm({ ...base, salePrice: "400" }).value.salePrice, 400);
  assert.ok(validateItemForm({ ...base, unit: "u".repeat(31) }).errors.unit);
});

test("range, free and contact", () => {
  assert.ok(validateItemForm({ ...base, priceType: "range" }).errors.priceMax);
  assert.ok(validateItemForm({ ...base, priceType: "range", priceMax: "100" }).errors.priceMax);
  assert.equal(validateItemForm({ ...base, priceType: "range", priceMax: "900" }).value.priceMax, 900);
  const free = validateItemForm({ ...base, priceType: "free", price: "" });
  assert.equal(free.ok, true);
  assert.equal(free.value.price, null);
  assert.equal(validateItemForm({ ...base, priceType: "contact", price: "", salePrice: "5" }).value.salePrice, null);
});

test("form from an item and back", () => {
  const f = formFromItem({ name: "A cut", description: null, section: null, unit: null, priceType: "fixed", price: 300, priceMax: null, salePrice: 250, availability: "available" });
  assert.equal(f.price, "300");
  assert.equal(validateItemForm(f).value.salePrice, 250);
});

test("counting stock: a number is required, and it is optional otherwise", () => {
  assert.equal(validateItemForm({ ...base, trackStock: false, stockCount: "junk" }).ok, true);
  const noCount = validateItemForm({ ...base, trackStock: true, stockCount: "" });
  assert.equal(noCount.ok, false);
  assert.ok(noCount.errors.stockCount);
  assert.ok(validateItemForm({ ...base, trackStock: true, stockCount: "-2" }).errors.stockCount);
  assert.ok(validateItemForm({ ...base, trackStock: true, stockCount: "4", lowStockThreshold: "x" }).errors.lowStockThreshold);
  const ok = validateItemForm({ ...base, trackStock: true, stockCount: "0", lowStockThreshold: "5", showStockCount: true });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.value.trackStock, ok.value.stockCount, ok.value.lowStockThreshold, ok.value.showStockCount], [true, 0, 5, true]);
});

test("without counting, the stock fields are cleared and the chosen status is kept", () => {
  const r = validateItemForm({ ...base, availability: "limited_stock", trackStock: false, stockCount: "9", showStockCount: true });
  assert.deepEqual([r.value.trackStock, r.value.stockCount, r.value.showStockCount, r.value.availability], [false, null, false, "limited_stock"]);
});

test("'unavailable' is not offered; the form shows it as out of stock", () => {
  assert.equal(validateItemForm({ ...base, availability: "unavailable" }).ok, false);
  const f = formFromItem({ name: "Old", priceType: "fixed", price: 1, availability: "unavailable", trackStock: true, stockCount: 0, lowStockThreshold: 4, showStockCount: true });
  assert.deepEqual([f.availability, f.trackStock, f.stockCount, f.lowStockThreshold, f.showStockCount], ["out_of_stock", true, "0", "4", true]);
});
