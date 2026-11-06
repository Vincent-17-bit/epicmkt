import { test } from "node:test";
import assert from "node:assert/strict";
import { REGULATED_TYPES, canSellType, isRestricted, restrictedToOf, sellableTypesFor, cleanTypeRequest, TYPE_REQUEST_LIMITS } from "./restrictions.js";
import * as shared from "../index.js";

test("prescription medicine is chemist only; vet drugs and agrochemicals are agrovet only", () => {
  assert.equal(canSellType("prescription-medicine", "chemist"), true);
  assert.equal(canSellType("prescription-medicine", "tailor-boutique"), false);
  assert.equal(canSellType("vet-medicine", "agrovet"), true);
  assert.equal(canSellType("vet-medicine", "chemist"), false);
  assert.equal(canSellType("agrochemicals", "agrovet"), true);
  assert.equal(canSellType("agrochemicals", "supermarket-minimart"), false);
});

test("everything else is open to any shop, and Other goods (null) always is", () => {
  assert.equal(canSellType("fragrance", "tailor-boutique"), true);
  assert.equal(canSellType("stationery", "electronics-computers"), true);
  assert.equal(canSellType(null, "chemist"), true);
  assert.equal(canSellType({ id: "x" }, undefined), true);
  assert.equal(canSellType({ id: "x", restrictedTo: [] }, "barber"), true);
});

test("a restricted type fails closed when the shop category is missing or unknown", () => {
  for (const c of [undefined, null, "", "nope", 5]) assert.equal(canSellType("prescription-medicine", c), false);
});

test("a type object's own restrictedTo wins over the regulated list", () => {
  assert.deepEqual(restrictedToOf({ id: "fragrance", restrictedTo: ["salon-beauty"] }), ["salon-beauty"]);
  assert.equal(canSellType({ id: "fragrance", restrictedTo: ["salon-beauty"] }, "barber"), false);
  assert.equal(isRestricted("fragrance"), false);
  assert.equal(isRestricted("agrochemicals"), true);
});

test("restrictedToOf returns a copy, and REGULATED_TYPES cannot be edited", () => {
  restrictedToOf("agrochemicals").push("x");
  assert.deepEqual(REGULATED_TYPES.agrochemicals, ["agrovet"]);
  assert.throws(() => { "use strict"; REGULATED_TYPES["new"] = ["x"]; });
});

test("sellableTypesFor filters a list", () => {
  const types = [{ id: "fragrance" }, { id: "prescription-medicine", restrictedTo: ["chemist"] }, { id: "vet-medicine", restrictedTo: ["agrovet"] }];
  assert.deepEqual(sellableTypesFor(types, "chemist").map((t) => t.id), ["fragrance", "prescription-medicine"]);
  assert.deepEqual(sellableTypesFor(types, "barber").map((t) => t.id), ["fragrance"]);
  assert.deepEqual(sellableTypesFor(undefined, "barber"), []);
});

test("cleanTypeRequest trims, collapses spaces, and enforces the limits the database enforces", () => {
  assert.deepEqual(cleanTypeRequest("  Wedding   favours ", "  "), { ok: true, value: { name: "Wedding favours", note: null } });
  assert.equal(cleanTypeRequest("a", "").error, "invalid_name");
  assert.equal(cleanTypeRequest("x".repeat(TYPE_REQUEST_LIMITS.nameMax + 1), "").error, "invalid_name");
  assert.equal(cleanTypeRequest("Ok name", "n".repeat(TYPE_REQUEST_LIMITS.noteMax + 1)).error, "invalid_note");
  assert.equal(cleanTypeRequest(undefined, undefined).ok, false);
});

test("the helpers are exported from @epicmkt/shared without clashing with another export", () => {
  for (const n of ["canSellType", "sellableTypesFor", "REGULATED_TYPES", "cleanTypeRequest", "TYPE_ERRORS"]) assert.equal(typeof shared[n] !== "undefined", true, n);
});
