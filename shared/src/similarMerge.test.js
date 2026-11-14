import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { similarKey, similarParts, SIMILAR_UNIT_WORDS, SIMILAR_COLOUR_WORDS } from "./similar.js";

test("sizes and weights are stripped", () => {
  assert.equal(similarKey("Bread 400g"), "bread");
  assert.equal(similarKey("Bread 800 g"), "bread");
  assert.equal(similarKey("Brookside Milk 500ml"), "brookside milk");
  assert.equal(similarKey("Drinking water (20 litres)"), "drinking water");
  assert.equal(similarKey("Drinking water 5L"), "drinking water");
});

test("colour and pack words are stripped", () => {
  assert.equal(similarKey("Cotton T-shirt Red"), "cotton tshirt");
  assert.equal(similarKey("Pens pack of 12"), "pens of");
  assert.equal(similarKey("Notebook blue"), "notebook");
});

test("different products keep different keys", () => {
  assert.notEqual(similarKey("Bread 400g"), similarKey("Cake 400g"));
  assert.notEqual(similarKey("Milk 500ml"), similarKey("Milk powder 500g"));
});

test("a name with nothing left has no key", () => {
  assert.equal(similarKey("400g"), null);
  assert.equal(similarKey(""), null);
  assert.equal(similarKey(null), null);
});

test("the varying part and the kept name are returned", () => {
  assert.deepEqual(similarParts("Fresh Bread 400g Brown"), { key: "fresh bread", name: "Fresh Bread", varies: "400g Brown" });
});

test("the SQL word lists equal the JS ones", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0109_merge_similar_items.sql", import.meta.url), "utf8");
  const list = (name) => [...sql.match(new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]+)\\]`, "s"))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(list("c_units").sort(), [...SIMILAR_UNIT_WORDS].sort());
  assert.deepEqual(list("c_colours").sort(), [...SIMILAR_COLOUR_WORDS].sort());
});
