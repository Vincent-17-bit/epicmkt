import test from "node:test";
import assert from "node:assert/strict";
import { chipsFor, shopMemory } from "./shopMemory.js";

const item = (over) => ({ id: "x", name: "Item", draft: false, productTypeId: "phone", brand: null, specs: [], updatedAt: "2026-01-01", ...over });

test("keeps the newest brand, warranty and condition per type", () => {
  const m = shopMemory([
    item({ id: "a", brand: "Samsung", updatedAt: "2026-01-01", specs: [{ label: "Warranty", value: "6 months" }] }),
    item({ id: "b", brand: "Tecno", updatedAt: "2026-03-01", specs: [{ label: "Condition", value: "New" }] }),
    item({ id: "c", productTypeId: "bulb", brand: "Philips" })
  ]);
  assert.deepEqual(m.phone, { brand: "Tecno", warranty: "6 months", condition: "New" });
  assert.deepEqual(m.bulb, { brand: "Philips" });
});

test("nothing is remembered for an untyped or removed item", () => {
  assert.deepEqual(shopMemory([item({ productTypeId: null, brand: "X" }), item({ removedByAdmin: true, brand: "Y" })]), {});
  assert.deepEqual(chipsFor({}, "phone"), []);
});

test("chips list the remembered values for a type", () => {
  assert.deepEqual(chipsFor({ phone: { brand: "Tecno", condition: "New" } }, "phone"), [{ field: "brand", value: "Tecno" }, { field: "condition", value: "New" }]);
});
