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
  assert.deepEqual(measureTokens("Galaxy S24 128 GB"), ["128gb"]);
  assert.deepEqual(measureTokens("size 5 W shirt"), []);
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

test("metres, millilitres and kilograms never collide", () => {
  assert.deepEqual(measureTokens("6m"), ["6000mm"]);
  assert.deepEqual(measureTokens("6 metres"), ["6000mm"]);
  assert.deepEqual(measureTokens("6ml"), ["6ml"]);
  assert.deepEqual(measureTokens("6kg"), ["6000g"]);
  assert.deepEqual(measureTokens("PVC pipe class C 6m"), ["6000mm"]);
});

test("fractions and words for half and quarter", () => {
  for (const text of ["1/2 kg", "half kg", "nusu kilo", "0.5kg", "500g", "half a kilo"]) assert.deepEqual(measureTokens(text), ["500g"], text);
  for (const text of ["1/4 kg", "quarter kg", "robo kilo", "250g", "0.25 kg"]) assert.deepEqual(measureTokens(text), ["250g"], text);
  for (const text of ['1/2 inch', '1/2"', "0.5 inch"]) assert.deepEqual(measureTokens(text), ["12.7mm"], text);
  assert.deepEqual(measureTokens("nyama choma 1/2 kg"), ["500g"]);
});

test("storage, power and local words", () => {
  assert.deepEqual(measureTokens("16gb ram 512 GB ssd"), ["16gb", "512gb"]);
  assert.deepEqual(measureTokens("0.5tb"), ["512gb"]);
  assert.deepEqual(measureTokens("200w solar panel 12v"), ["200w", "12v"]);
  assert.deepEqual(measureTokens("20ltrs"), ["20000ml"]);
  assert.deepEqual(measureTokens("20 lita"), ["20000ml"]);
  assert.deepEqual(measureTokens("jameson mzinga"), ["750ml"]);
  assert.deepEqual(measureTokens("2 bedroom apartment"), ["2bed"]);
  assert.deepEqual(measureTokens("2 bed"), ["2bed"]);
});

test("short meaningful words are never read as amounts", () => {
  for (const text of ["it", "a4", "b2b", "tv", "ac", "5g phone", "iphone 13 pro max", "core i7", "1080p"]) {
    const found = measureTokens(text);
    assert.ok(!found.some((t) => /mm$|ml$/.test(t)), `${text} -> ${found}`);
  }
});

const prod = (id, name, optionValues = [], over = {}) => item(id, name, optionValues, over);
const MIXED = [
  prod("gas", "LPG Gas Refill 6kg", ["6 kg", "13 kg"]),
  prod("gasnew", "Empty Gas Cylinder 13kg"),
  prod("water", "Drinking Water Refill 20 L"),
  prod("bread", "White Bread Loaf 400 g"),
  prod("wbread", "Whole Wheat Bread 800g Sliced"),
  prod("sugar", "Sugar 500g"),
  prod("pvc", 'PVC Pipe 1/2 inch Class C 6m'),
  prod("ml6", "Eye Drops 6ml"),
  prod("lap", "HP Core i7 Laptop 16GB RAM 512GB SSD"),
  prod("flash", "Flash Drive 16GB"),
  prod("panel", "Monocrystalline Solar Panel 200W 12V"),
  prod("flood", "LED Floodlight 200W"),
  prod("apt", "2 Bedroom Apartment Master Ensuite"),
  prod("jam", "Jameson Irish Whiskey 750 mL"),
  prod("it", "IT Support and Computer Repair"),
  prod("paper", "A4 Printing Paper 500 sheets"),
  prod("med", "Panadol Extra - relieves pain and fever"),
  prod("juice", "Fresh Juice", ["Orange & Ginger", "Orange"])
];
const hits = (q) => searchProducts(MIXED, { q }, { itemsOnly: true }).items.map((x) => x.id).sort();

test("units never collide in search", () => {
  assert.deepEqual(hits("6m pipe"), ["pvc"]);
  assert.deepEqual(hits("6ml"), ["ml6"]);
  assert.deepEqual(hits("6kg gas"), ["gas"]);
  assert.ok(!hits("6m").includes("ml6"));
});

test("fractions find the weight the seller wrote in grams", () => {
  assert.deepEqual(hits("1/2 kg sugar"), ["sugar"]);
  assert.deepEqual(hits("half kg sugar"), ["sugar"]);
  assert.deepEqual(hits("nusu kilo sugar"), ["sugar"]);
  assert.deepEqual(hits("1/2 inch pvc pipe class c 6m"), ["pvc"]);
});

test("specs in any spelling, no loose lookalikes", () => {
  assert.deepEqual(hits("core i7 16 gb ram 512gb ssd laptop"), ["lap"]);
  assert.deepEqual(hits("200w monocrystalline solar panel 12v"), ["panel"]);
  assert.deepEqual(hits("jameson 0.75 l"), ["jam"]);
  assert.deepEqual(hits("jameson mzinga"), ["jam"]);
  assert.deepEqual(hits("2 bedroom apartment master"), ["apt"]);
});

test("short meaningful words are not thrown away as stop words", () => {
  assert.deepEqual(hits("it"), ["it"]);
  assert.deepEqual(hits("a4"), ["paper"]);
});

test("Swahili joiners and words", () => {
  assert.deepEqual(hits("juice ya machungwa na tangawizi"), ["juice"]);
  assert.deepEqual(hits("mkate"), ["bread", "wbread"]);
  assert.deepEqual(hits("dawa ya homa"), ["med"]);
  assert.deepEqual(hits("maji 20ltrs"), ["water"]);
  assert.deepEqual(hits("maji 20 lita"), ["water"]);
  assert.deepEqual(hits("refill 6kg"), ["gas"]);
});
