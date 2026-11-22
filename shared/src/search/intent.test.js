import test from "node:test";
import assert from "node:assert/strict";
import { searchProducts, EMPTY_SEARCH } from "./search.js";

const shop = (slug, town, over = {}) => ({ id: slug, slug, name: slug.replace(/-/g, " "), town, county: town, isOpen: true, verified: false, featured: false, delivery: null, ...over });
const p = (id, name, price, business, over = {}) => ({ id, name, description: "", pricing: { priceMin: price, salePrice: price }, regularPrice: price, business, ...over });
const CATALOGUE = [
  p("a15", "Samsung Galaxy A15 128GB phone", 18500, shop("kisumu-phones", "Kisumu")),
  p("s24", "Samsung Galaxy S24 256GB phone", 98000, shop("kisumu-phones", "Kisumu")),
  p("tecno", "Tecno Spark 20 128GB phone", 15500, shop("nairobi-mobile", "Nairobi")),
  p("old", "Used iPhone 8 64GB phone", 12000, shop("nairobi-mobile", "Nairobi"), { shortDescription: "second hand, clean" }),
  p("cut", "Haircut", 200, shop("fade-kings", "Maseno"), { kind: "service" }),
  p("shave", "Shave", 100, shop("fade-kings", "Maseno"), { kind: "service" }),
  p("sufuria", "Non-stick sufuria set 5 pcs", 2400, shop("nairobi-mobile", "Nairobi")),
  p("lady", "Ladies handbag", 1800, shop("kisumu-phones", "Kisumu")),
  p("sugar", "Mumias brown sugar 2kg", 320, shop("kisumu-phones", "Kisumu"))
];
const find = (q, extra = {}) => searchProducts(CATALOGUE, { ...EMPTY_SEARCH, q, ...extra }, { pageSize: 50 });
const ids = (q, extra) => find(q, extra).items.map((i) => i.id);

test("a request in plain words finds the thing, not the words around it", () => {
  for (const q of ["where can i find a haircut", "i need haircut please", "haircut near me", "haircut"]) assert.equal(ids(q)[0], "cut", q);
});

test("a price in the words is a price limit, with a chip to undo it", () => {
  const r = find("samsung phone under 20000");
  assert.deepEqual(r.items.map((i) => i.id), ["a15"]);
  assert.equal(r.understood.chips[0].label, "Up to KES 20,000");
  assert.equal(r.understood.chips[0].without, "samsung phone");
});

test("cheap sorts by price, and a place narrows to its shops", () => {
  assert.deepEqual(ids("cheap phone").slice(0, 4), ["old", "tecno", "a15", "s24"], "the phones, cheapest first, before anything that only mentions phones");
  assert.deepEqual(ids("phone in kisumu").slice(0, 2).sort(), ["a15", "s24"]);
  assert.ok(ids("phone in kisumu").every((id) => CATALOGUE.find((x) => x.id === id).business.town === "Kisumu"));
});

test("a typed condition is a filter", () => {
  assert.deepEqual(ids("used phone"), ["old"]);
});

test("spelling: a slip, a swap, an unfinished word", () => {
  for (const q of ["harcut", "haricut", "hairc"]) assert.equal(ids(q)[0], "cut", q);
  const r = find("samsng galaxy");
  assert.deepEqual(r.items.map((i) => i.id).sort(), ["a15", "s24"]);
  assert.deepEqual(r.understood.changes, [{ from: "samsng", to: "samsung" }]);
  assert.equal(r.corrected, "samsung galaxy");
});

test("Swahili and trade words find the English listing", () => {
  assert.deepEqual(ids("kinyozi").sort(), ["cut", "shave"], "kinyozi is both the haircut and the shave");
  assert.deepEqual(ids("simu ya bei nafuu").slice(0, 4), ["old", "tecno", "a15", "s24"]);
  assert.deepEqual(ids("mkoba"), ["lady"]);
});

test("a word the shop does not stock is not 'corrected' into one it does", () => {
  assert.equal(find("sofa").total, 0);
  assert.equal(find("pizza").total, 0);
  assert.equal(find("xyzqq").total, 0);
});

test("zero results offers the words that do find something", () => {
  const r = find("samsung sufuria");
  assert.equal(r.total, 0);
  assert.deepEqual(r.understood.alternatives.map((a) => a.q).sort(), ["samsung", "sufuria"]);
});

test("a place with no shops is dropped, and said, instead of emptying the page", () => {
  const r = find("haircut in mombasa");
  assert.equal(r.items[0].id, "cut");
  assert.ok(r.understood.relaxed.some((x) => x.id === "missing-place" && /mombasa/.test(x.label)));
});

test("a price nothing fits is loosened, and said", () => {
  const r = find("samsung phone under 500");
  assert.ok(r.total > 0);
  assert.ok(r.understood.relaxed.some((x) => x.id === "price"));
  assert.equal(r.understood.chips.find((c) => c.id === "price").applied, false, "the chip says it was not applied");
});

test("a long request that no listing fully matches still finds the nearest", () => {
  const r = find("5 piece non-stick sufuria for my wedding party");
  assert.ok(r.items.some((i) => i.id === "sufuria"));
  assert.equal(r.understood.partial, true);
});

test("a town that is also a brand is searched as a word when it is all that was typed", () => {
  assert.deepEqual(ids("mumias"), ["sugar"]);
});

test("quotes, minus and or", () => {
  assert.deepEqual(ids('"galaxy" -s24'), ["a15"]);
  assert.deepEqual(ids("tecno or iphone phone").sort(), ["old", "tecno"]);
});

test("a filter the shopper set by hand is never overridden by the words", () => {
  const r = find("phone under 20000", { max: 99000 });
  assert.ok(r.items.some((i) => i.id === "s24"));
});

test("cheapest first still puts the thing before the things that go with it", () => {
  const things = [
    p("ph1", "Tecno Spark 20 phone", 15500, shop("m", "Nairobi")),
    p("ph2", "Samsung Galaxy A15 phone", 18500, shop("m", "Nairobi")),
    p("cs1", "Silicone phone case", 450, shop("m", "Nairobi")),
    p("cs2", "Phone charger", 300, shop("m", "Nairobi"))
  ];
  const r = searchProducts(things, { ...EMPTY_SEARCH, q: "cheap phone" }, { pageSize: 50 });
  assert.equal(r.understood.sort, "price_asc", "the page can show the order it used");
  assert.deepEqual(r.items.map((i) => i.id).slice(0, 2), ["ph1", "ph2"], "the phones, cheapest first, then the cases and chargers");
});
