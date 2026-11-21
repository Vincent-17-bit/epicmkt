import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestProductType, scoreTypes, OTHER_TYPE_ID, hasNoTypeEvidence } from "./suggest.js";
import { relevance, rankSimilar } from "../similar.js";
import { complementGroupOf } from "../related/complements.js";
import { relatedScore } from "../related/rankRelated.js";

const TYPES = [
  { id: "phone", name: "Phones (smartphone, feature phone)", categoryIds: ["phones-accessories"] },
  { id: "dress-shirt", name: "Dress shirt", categoryIds: ["fashion-boutiques"] },
  { id: "clothing", name: "Clothing (dress, top, skirt, trousers, shirt)", categoryIds: ["fashion-boutiques"] },
  { id: "laundry-by-item", name: "Laundry by item (shirt, trousers, dress, suit)", categoryIds: ["laundry"] },
  { id: "eggs", name: "Eggs", categoryIds: ["agrovet"] },
  { id: "poultry-equipment", name: "Poultry equipment (egg tray, feeder, drinker)", categoryIds: ["agrovet"] },
  { id: "cctv-camera-kit", name: "CCTV cameras and kits", categoryIds: ["security"] },
  { id: "bread", name: "Bread", categoryIds: ["bakery"] },
  { id: OTHER_TYPE_ID, name: "Other", categoryIds: [] }
];

test("a name that is a type's own phrase gets that type with high confidence", () => {
  const s = suggestProductType("Dress shirt", TYPES);
  assert.equal(s.typeId, "dress-shirt");
  assert.equal(s.confidence, "high");
});

test("sizes, pack counts, model codes and the brand do not hide the phrase", () => {
  assert.equal(suggestProductType("Brookside Bread 400g", TYPES, { brand: "Brookside" }).typeId, "bread");
  assert.equal(suggestProductType("Bread 400g", TYPES).confidence, "high");
});

test("one generic word inside a longer name is a hint, never high confidence", () => {
  const s = suggestProductType("Drip kit", TYPES);
  assert.notEqual(s.confidence, "high");
});

test("a listed example beats a type that merely holds one of its words", () => {
  // "Egg tray" is listed under poultry equipment, and must not be called eggs just because it holds the word
  const s = suggestProductType("Egg tray", TYPES);
  assert.equal(s.typeId, "poultry-equipment");
  assert.equal(s.candidates[1].typeId, "eggs");
});

test("the same word under several types is ambiguous until the shop's category decides", () => {
  const blind = suggestProductType("Shirt", TYPES);
  assert.notEqual(blind.confidence, "high");
  assert.equal(suggestProductType("Shirt", TYPES, { categoryId: "laundry" }).typeId, "laundry-by-item");
  assert.equal(suggestProductType("Shirt", TYPES, { categoryId: "fashion-boutiques" }).typeId, "clothing");
});

test("the category and the group only support a match, they never start one", () => {
  const s = suggestProductType("Zzyzx", TYPES, { categoryId: "bakery" });
  assert.deepEqual(s, { typeId: null, confidence: "none", candidates: [] });
});

test("nothing to go on gives none, and bad input never throws", () => {
  assert.equal(suggestProductType("", TYPES).confidence, "none");
  assert.equal(suggestProductType(null, TYPES).confidence, "none");
  assert.equal(suggestProductType("Bread", null).confidence, "none");
  assert.equal(suggestProductType("Bread", [null, {}, { id: 4 }]).confidence, "none");
});

test("Other is never suggested", () => {
  assert.ok(!scoreTypes("Other", TYPES).some((r) => r.type.id === OTHER_TYPE_ID));
  assert.ok(!scoreTypes("Other goods", TYPES).some((r) => r.type.id === OTHER_TYPE_ID));
});

test("hasNoTypeEvidence: Other, blank and missing mean the same", () => {
  for (const v of [undefined, null, "", "  ", "other", "OTHER", " Other ", 5]) assert.equal(hasNoTypeEvidence(v), true, String(v));
  for (const v of ["phone", "others", "bread"]) assert.equal(hasNoTypeEvidence(v), false, v);
});

test("ranking: an item typed Other is read by its name alone, like an untyped item", () => {
  // Similar: two different types cancel a section match, but Other is not a type, so the section still counts.
  const a = { name: "Galaxy", section: "Phones", productTypeId: OTHER_TYPE_ID };
  const b = { name: "Camon", section: "Phones", productTypeId: "phone" };
  const untyped = { ...a, productTypeId: undefined };
  assert.deepEqual(relevance(a, b), relevance(untyped, b));
  // two Others are not "the same type"
  assert.deepEqual(relevance(a, { ...b, productTypeId: OTHER_TYPE_ID }), relevance(untyped, { ...b, productTypeId: undefined }));
  // Goes well with: the name decides, as with no type
  assert.equal(complementGroupOf({ name: "Pilau", productTypeId: OTHER_TYPE_ID }), complementGroupOf({ name: "Pilau" }));
  assert.equal(relatedScore({ name: "Pilau", productTypeId: OTHER_TYPE_ID }, { name: "Soda" }), relatedScore({ name: "Pilau" }, { name: "Soda" }));
  // and rankSimilar agrees
  const current = { id: "c", businessId: "x", name: "Galaxy", section: "Phones", productTypeId: OTHER_TYPE_ID };
  const cand = [{ id: "1", businessId: "y", name: "Camon", section: "Phones", productTypeId: OTHER_TYPE_ID }];
  assert.deepEqual(rankSimilar({ current, candidates: cand }).map((r) => r.id), rankSimilar({ current: { ...current, productTypeId: undefined }, candidates: cand.map((c) => ({ ...c, productTypeId: undefined })) }).map((r) => r.id));
});
