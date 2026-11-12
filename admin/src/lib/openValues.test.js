import { test } from "node:test";
import assert from "node:assert/strict";
import { VALUE_ERRORS, VALUE_KINDS, VALUE_TABS, itemsText, kindLabel, parseTags, valueError } from "./openValues.js";

test("counts the items a merge changes in words", () => {
  assert.equal(itemsText(0), "0 items");
  assert.equal(itemsText(1), "1 item");
  assert.equal(itemsText(12), "12 items");
});

test("reads tags from a comma list, trimmed and without blanks", () => {
  assert.deepEqual(parseTags("precious-metal, jewellery"), ["precious-metal", "jewellery"]);
  assert.deepEqual(parseTags(" a ,, b , "), ["a", "b"]);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags(null), []);
});

test("names every kind and falls back to the id", () => {
  assert.deepEqual(VALUE_KINDS.map((k) => k.id), ["material", "color", "brand", "finish", "flavour"]);
  assert.equal(kindLabel("color"), "Colour");
  assert.equal(kindLabel("other"), "other");
});

test("opens on the review queue", () => {
  assert.deepEqual(VALUE_TABS[0], { id: "pending", label: "Waiting for review" });
});

test("explains rename and merge refusals in words, by code or by message prefix", () => {
  assert.equal(valueError({ code: "value_exists" }), VALUE_ERRORS.value_exists);
  assert.equal(valueError({ message: "kind_mismatch: material vs brand" }), VALUE_ERRORS.kind_mismatch);
  assert.match(valueError({ code: "same_value" }), /different value/);
  assert.equal(valueError({ message: "boom" }), "boom");
  assert.equal(valueError(null), "Something went wrong. Try again.");
});
