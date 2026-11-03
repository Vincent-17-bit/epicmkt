import test from "node:test";
import assert from "node:assert/strict";
import { makeItemOf, pricingOf, variantPricing, variantsOf } from "./itemShape.js";

const itemOf = makeItemOf((path) => `https://img/${path}`);

test("variants keep id, label and price, in order, and drop sold-out or broken rows", () => {
  assert.deepEqual(variantsOf([{ id: "a", label: " S ", price: "5" }, { id: "b", label: "L", price: 9, stock: 0 }, { id: "c", label: "", price: 1 }, null, { id: "d", label: "XL", price: -1 }, { id: "e", label: "M", price: 7, stock: 2 }]), [
    { id: "a", label: "S", price: 5 },
    { id: "e", label: "M", price: 7 }
  ]);
  assert.deepEqual(variantsOf("no"), []);
  assert.equal(variantsOf(Array.from({ length: 30 }, (_, i) => ({ id: `v${i}`, label: `L${i}`, price: 1 }))).length, 10);
});

test("variant prices are the regular price, or the sale price when a function sets one", () => {
  const rows = [{ id: "a", label: "S", price: 500 }];
  assert.deepEqual(variantPricing(rows), [{ id: "a", label: "S", regularPrice: 500, salePrice: 500, savings: 0, discountPercent: 0 }]);
  assert.deepEqual(variantPricing(rows, (p) => p * 0.8), [{ id: "a", label: "S", regularPrice: 500, salePrice: 400, savings: 100, discountPercent: 20 }]);
});

test("item pricing carries the variants the customer view reads", () => {
  const item = itemOf({ id: "1", name: "Cut", price: 500, variants: [{ id: "a", label: "S", price: 500 }, { id: "b", label: "L", price: 800 }] });
  assert.deepEqual(item.variants, [{ id: "a", label: "S", price: 500 }, { id: "b", label: "L", price: 800 }]);
  const pricing = pricingOf(item.regularPrice, item.regularPrice, "fixed", null, item.variants);
  assert.deepEqual(pricing.variants.map((v) => [v.id, v.regularPrice, v.salePrice]), [["a", 500, 500], ["b", 800, 800]]);
  assert.deepEqual(pricingOf(5, 5, "fixed", null).variants, []);
});
