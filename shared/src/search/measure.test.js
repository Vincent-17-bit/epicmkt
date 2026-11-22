import { test } from "node:test";
import assert from "node:assert/strict";
import { measureTokens, splitMeasures, canonicalMeasureKey } from "./measure.js";
import { searchProducts } from "./search.js";

test("the same amount is one token however it is written", () => {
  for (const text of ["250ml", "250 ml", "250 mL", "250 millilitres", "0.25 l", "0.25L", "25 cl"]) assert.deepEqual(measureTokens(text), ["250ml"], text);
  for (const text of ["1l", "1 L", "1 litre", "1 ltr", "1000ml", "1,000 ml"]) assert.deepEqual(measureTokens(text), ["1000ml"], text);
  for (const text of ["500g", "0.5 kg", "500 grams"]) assert.deepEqual(measureTokens(text), ["500g"], text);
});

test("pack sizes read the same in every spelling", () => {
  for (const text of ["4 pack", "4-Pack", "4pk", "pack of 4", "4 pcs", "4 pieces"]) assert.deepEqual(measureTokens(text), ["4pc"], text);
  assert.deepEqual(measureTokens("Single Can"), ["1pc"]);
});

test("words that merely contain a unit are not amounts", () => {
  assert.deepEqual(measureTokens("Orange 5 litres"), ["5000ml"]);
  assert.deepEqual(measureTokens("gloss lipstick glove 12x"), []);
  assert.deepEqual(measureTokens("Galaxy S24 128 GB"), []);
});

test("splitMeasures separates the words from the amounts", () => {
  assert.deepEqual(splitMeasures("red bull 250ml 4 pack"), { rest: "red bull", measures: ["250ml", "4pc"] });
  assert.equal(canonicalMeasureKey("Red Bull 250 mL"), "red bull 250ml");
});

const shop = { id: "s", slug: "shop", name: "Shop", town: "Nairobi", isOpen: true, verified: false, featured: false, delivery: null };
const item = (id, name, optionValues = [], over = {}) => ({
  id, name, regularPrice: 250, pricing: { regularPrice: 250, salePrice: 250, savings: 0 }, images: [], videos: [], swatches: [], specs: [], highlights: [], optionValues, business: shop, ...over
});
const BULL = item("bull", "Red Bull Energy Drink - Assorted Flavors & Pack Sizes (250 mL & 355 mL)", ["Original", "Sugarfree", "Watermelon", "Fuji Apple & Ginger", "Pistachio & Berries", "250 ml", "355 ml", "Single Can", "4-Pack"]);
const JUICE = item("juice", "Fresh Juice", ["Orange & Ginger", "Orange", "300 ml", "500 ml", "1 L", "5 L"]);
const WATER = item("water", "Drinking Water 500ml");
const CATALOGUE = [BULL, JUICE, WATER, item("bread", "White Bread 400 g")];
const names = (q) => searchProducts(CATALOGUE, { q }, { itemsOnly: true }).items.map((x) => x.id).sort();

test("a flavour that only exists as a variant finds the product", () => {
  assert.deepEqual(names("watermelon"), ["bull"]);
  assert.deepEqual(names("ginger"), ["bull", "juice"]);
  assert.deepEqual(names("pistachio"), ["bull"]);
});

test("'and' between flavours does not hide the product", () => {
  assert.deepEqual(names("orange and ginger"), ["juice"]);
  assert.deepEqual(names("orange & ginger"), ["juice"]);
  assert.deepEqual(names("fuji apple and ginger"), ["bull"]);
});

test("a size finds every product that has it, however it is typed", () => {
  for (const q of ["250ml", "250 ml", "250 mL", "0.25l"]) assert.deepEqual(names(q), ["bull"], q);
  for (const q of ["1l", "1 L", "1 litre", "1000ml"]) assert.deepEqual(names(q), ["juice"], q);
  for (const q of ["500ml", "500 ml", "0.5 l"]) assert.deepEqual(names(q), ["juice", "water"], q);
  assert.deepEqual(names("5l"), ["juice"]);
  assert.deepEqual(names("400g"), ["bread"]);
});

test("a name, a flavour and a size together", () => {
  assert.deepEqual(names("250ml red bull"), ["bull"]);
  assert.deepEqual(names("red bull watermelon 355ml"), ["bull"]);
  assert.deepEqual(names("pistachio & berries 355ml 4 pack"), ["bull"]);
  assert.deepEqual(names("red bull 4-pack"), ["bull"]);
  assert.deepEqual(names("red bull 1l"), []);
});

test("pack words match single can", () => {
  assert.deepEqual(names("red bull 1 piece"), ["bull"]);
});
