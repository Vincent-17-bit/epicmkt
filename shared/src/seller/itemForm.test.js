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
