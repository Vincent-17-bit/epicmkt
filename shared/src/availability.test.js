import { test } from "node:test";
import assert from "node:assert/strict";
import { isListed, isSoldOut, listedOnly, statusForForm, statusFromCount, stockTag } from "./availability.js";

test("only out of stock and the older 'unavailable' are sold out", () => {
  for (const a of ["out_of_stock", "unavailable"]) assert.equal(isSoldOut(a), true);
  for (const a of ["available", "limited_stock", "by_appointment", undefined, null]) assert.equal(isSoldOut(a), false);
});

test("a missing availability counts as listed, and sold-out items are dropped from a list", () => {
  assert.equal(isListed({}), true);
  assert.deepEqual(listedOnly([{ id: 1 }, { id: 2, availability: "out_of_stock" }, { id: 3, availability: "limited_stock" }, { id: 4, availability: "unavailable" }]).map((i) => i.id), [1, 3]);
  assert.deepEqual(listedOnly(null), []);
});

test("available items say nothing; low stock says Low stock or how many are left", () => {
  assert.equal(stockTag({ availability: "available" }), null);
  assert.equal(stockTag({ availability: "by_appointment", stockLeft: 2 }), null);
  assert.equal(stockTag({ availability: "limited_stock" }), "Low stock");
  assert.equal(stockTag({ availability: "limited_stock", stockLeft: null }), "Low stock");
  assert.equal(stockTag({ availability: "limited_stock", stockLeft: 0 }), "Low stock");
  assert.equal(stockTag({ availability: "limited_stock", stockLeft: 3 }), "Only 3 left");
  assert.equal(stockTag({ availability: "limited_stock", stockLeft: 3 }, { only: (n) => `Zimebaki ${n}` }), "Zimebaki 3");
});

test("a count decides the status the same way the database does", () => {
  assert.equal(statusFromCount(0), "out_of_stock");
  assert.equal(statusFromCount(1), "limited_stock");
  assert.equal(statusFromCount(3), "limited_stock");
  assert.equal(statusFromCount(4), "available");
  assert.equal(statusFromCount(5, 5), "limited_stock");
  assert.equal(statusForForm("unavailable"), "out_of_stock");
  assert.equal(statusForForm("limited_stock"), "limited_stock");
});
