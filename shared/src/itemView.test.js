import test from "node:test";
import assert from "node:assert/strict";
import { buildSpecGroups, chatMessage, countRows, defaultVariantId, normalizeHighlights, HIGHLIGHT_LIMIT } from "./itemView.js";

test("chat message states the regular price, the flash price, or nothing", () => {
  const item = { name: "Fade" };
  assert.equal(chatMessage({ item, pricing: { regularPrice: 300, salePrice: 300, savings: 0 } }), "Hi, I saw Fade (KES 300) on EpicMKT");
  assert.equal(chatMessage({ item, pricing: { regularPrice: 300, salePrice: 240, savings: 60 } }), "Hi, I saw the flash sale on Fade: KES 240 (was KES 300) on EpicMKT");
  assert.equal(chatMessage({ item, pricing: null }), "Hi, I saw Fade on EpicMKT");
});

test("default variant is the one at the item price, else the first", () => {
  assert.equal(defaultVariantId(null), null);
  assert.equal(defaultVariantId({ regularPrice: 5, variants: [{ id: "a", regularPrice: 9 }, { id: "b", regularPrice: 5 }] }), "b");
  assert.equal(defaultVariantId({ regularPrice: 1, variants: [{ id: "a", regularPrice: 9 }] }), "a");
});

test("highlights accept strings and objects and drop empties", () => {
  assert.deepEqual(normalizeHighlights(["One", { title: "T", text: "x" }, { title: "Only" }, {}, null]), [{ title: "", text: "One" }, { title: "T", text: "x" }, { title: "", text: "Only" }]);
  assert.equal(normalizeHighlights("no").length, 0);
  assert.equal(HIGHLIGHT_LIMIT, 5);
});

test("spec groups keep their order, merge duplicates and skip blanks", () => {
  const groups = buildSpecGroups({ item: { specs: [{ group: "Measurements", label: "Width", value: "5" }, { label: "Color", value: "Red" }, { label: "color", value: "Blue" }, { label: "Empty", value: "" }], packSize: "6" } });
  assert.deepEqual(groups.map((g) => g.name), ["Features & Specs", "Measurements", "Item details"]);
  assert.equal(countRows(groups), 3);
});
