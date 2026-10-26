import { test } from "node:test";
import assert from "node:assert/strict";
import { validateItemForm, emptyItemForm, formFromItem, SPEC_LIMITS } from "./itemForm.js";

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

const specs = (rows) => validateItemForm({ ...base, specs: rows });

test("specs: trimmed, blank rows dropped, order kept", () => {
  const r = specs([{ label: "  Brand ", value: " Nike " }, { label: "", value: "  " }, { label: "Size", value: "42" }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.specs, [{ label: "Brand", value: "Nike" }, { label: "Size", value: "42" }]);
  assert.deepEqual(specs([]).value.specs, []);
});

test("specs: duplicate labels are dropped case-insensitively, first kept", () => {
  const r = specs([{ label: "Colour", value: "Red" }, { label: "size", value: "M" }, { label: " COLOUR ", value: "Blue" }, { label: "Size", value: "L" }]);
  assert.deepEqual(r.value.specs, [{ label: "Colour", value: "Red" }, { label: "size", value: "M" }]);
});

test("specs: a one-sided row is an error on that row index", () => {
  const r = specs([{ label: "Brand", value: "Nike" }, { label: "Size", value: "" }, { label: "", value: "42" }, { label: "", value: "" }]);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors.specs), ["1", "2"]);
  assert.ok(r.errors.specs[1].value);
  assert.equal(r.errors.specs[1].label, undefined);
  assert.ok(r.errors.specs[2].label);
  assert.equal(r.errors.specs[2].value, undefined);
});

test("specs: label, value and row limits", () => {
  assert.equal(specs([{ label: "l".repeat(SPEC_LIMITS.label), value: "v".repeat(SPEC_LIMITS.value) }]).ok, true);
  const long = specs([{ label: "a", value: "b" }, { label: "l".repeat(SPEC_LIMITS.label + 1), value: "v".repeat(SPEC_LIMITS.value + 1) }]);
  assert.deepEqual(Object.keys(long.errors.specs), ["1"]);
  assert.ok(long.errors.specs[1].label);
  assert.ok(long.errors.specs[1].value);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: "v" }));
  assert.equal(specs(rows(SPEC_LIMITS.rows)).ok, true);
  assert.ok(specs(rows(SPEC_LIMITS.rows + 1)).errors.specsCount);
  const dupes = [...rows(SPEC_LIMITS.rows), { label: "l0", value: "x" }];
  assert.equal(specs(dupes).ok, true);
});

test("specs are optional: none given, none returned, and the form round-trips", () => {
  const { specs: omitted, ...noSpecs } = base;
  assert.equal("specs" in validateItemForm(noSpecs).value, false);
  assert.deepEqual(emptyItemForm().specs, []);
  const plain = formFromItem({ name: "A cut", priceType: "fixed", price: 300, availability: "available" });
  assert.deepEqual(plain.specs, []);
  const f = formFromItem({ name: "Shoe", priceType: "fixed", price: 300, availability: "available", specs: [{ label: "Size", value: "42" }] });
  assert.deepEqual(validateItemForm(f).value.specs, [{ label: "Size", value: "42" }]);
});
