import test from "node:test";
import assert from "node:assert/strict";
import { defaultVariantId, variantPricing, variantsOf } from "./variants.js";

test("variants keep id, label and price, in order, and drop sold-out or broken rows", () => {
  assert.deepEqual(variantsOf([{ id: "a", label: " S ", price: "5" }, { id: "b", label: "L", price: 9, stock: 0 }, { id: "c", label: "", price: 1 }, null, { id: "d", label: "XL", price: -1 }, { id: "e", label: "M", price: 7, stock: 2 }]), [
    { id: "a", label: "S", price: 5 },
    { id: "e", label: "M", price: 7 }
  ]);
  assert.deepEqual(variantsOf("no"), []);
  assert.deepEqual(variantsOf({}), []);
  assert.equal(variantsOf(Array.from({ length: 30 }, (_, i) => ({ id: `v${i}`, label: `L${i}`, price: 1 }))).length, 10);
});

test("variant prices are the regular price, or the sale price when a function sets one", () => {
  const rows = [{ id: "a", label: "S", price: 500 }];
  assert.deepEqual(variantPricing(rows), [{ id: "a", label: "S", regularPrice: 500, salePrice: 500, savings: 0, discountPercent: 0 }]);
  assert.deepEqual(variantPricing(rows, (p) => p * 0.8), [{ id: "a", label: "S", regularPrice: 500, salePrice: 400, savings: 100, discountPercent: 20 }]);
  assert.deepEqual(variantPricing(undefined), []);
});

test("the option at the item price is the default, else the first", () => {
  assert.equal(defaultVariantId(null), null);
  assert.equal(defaultVariantId({ regularPrice: 5, variants: [] }), null);
  assert.equal(defaultVariantId({ regularPrice: 5, variants: [{ id: "a", regularPrice: 9 }, { id: "b", regularPrice: 5 }] }), "b");
  assert.equal(defaultVariantId({ regularPrice: 1, variants: [{ id: "a", regularPrice: 9 }] }), "a");
});
