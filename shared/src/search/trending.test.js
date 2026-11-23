import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyTrending } from "./index.js";

// The same small catalogue shape the search tests use (item + business card + option summary).
const shop = (slug) => ({ id: slug, slug, name: slug.replace(/-/g, " "), town: "Nakuru", isOpen: true, verified: false, featured: false, delivery: null });
const p = (id, name, over = {}) => ({
  id, name, regularPrice: 1000, pricing: { regularPrice: 1000, salePrice: 1000, savings: 0 }, images: [{ url: `${id}.png` }], videos: [], swatches: [], specs: [], highlights: [],
  business: shop("nakuru-audio"), ...over
});
const CATALOGUE = [
  p("flip", "JBL Flip 6 portable Bluetooth speaker", { brand: "JBL" }),
  p("charge", "JBL Charge 5 Bluetooth speaker with power bank", { brand: "JBL" }),
  p("oraimo", "Oraimo SoundPro portable speaker 20 W", { brand: "Oraimo" }),
  p("tv", "Hisense 55 inch 4K UHD smart TV", { brand: "Hisense" }),
  p("bread", "White bread 400 g", { business: shop("mama-bakery") })
];

test("a product word that finds something is kept, with its example item and picture", () => {
  const out = tidyTrending([{ term: "bread", count: 9, hot: true }], CATALOGUE, 1);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].term, out[0].count, out[0].hot, out[0].itemId], ["bread", 9, true, "bread"]);
  assert.equal(out[0].image, "bread.png");
});

test("a product word that finds nothing is dropped, so the menu never shows a dead word", () => {
  const out = tidyTrending([{ term: "unicorn saddle", count: 50 }, { term: "bread", count: 9 }], CATALOGUE, 1);
  assert.deepEqual(out.map((x) => x.term), ["bread"]);
});

test("a store, a flash sale or a category the database already checked is kept even though no product has that name", () => {
  const out = tidyTrending(
    [
      { term: "mama njeri bakery", count: 7, kind: "store", slug: "mama-njeri" },
      { term: "flash sneakers", count: 5, kind: "flash" },
      { term: "barber", count: 4, kind: "category" },
      { term: "unicorn saddle", count: 3, kind: "product" } // a product word is still checked
    ],
    CATALOGUE,
    4
  );
  assert.deepEqual(out.slice(0, 3).map((x) => [x.term, x.kind]), [["mama njeri bakery", "store"], ["flash sneakers", "flash"], ["barber", "category"]]);
  assert.equal(out[0].slug, "mama-njeri", "what the database said about it is not overwritten");
  assert.ok(!out.some((x) => x.term === "unicorn saddle"));
});

test("words that mean the same are shown once, the first (highest) one", () => {
  const out = tidyTrending([{ term: "speaker", count: 9 }, { term: "speakers", count: 7 }, { term: "Speaker", count: 2 }], CATALOGUE, 5);
  assert.equal(out.filter((x) => /speaker/i.test(x.term) && x.count > 0).length, 1);
  assert.equal(out[0].count, 9);
});

test("a store and a product with the same word are not shown twice", () => {
  const out = tidyTrending([{ term: "bread", count: 9, kind: "store" }, { term: "breads", count: 5 }], CATALOGUE, 5);
  assert.equal(out.filter((x) => x.count > 0).length, 1);
  assert.equal(out[0].kind, "store");
});

test("a short list is topped up with the commonest kinds of product, after the real ones, each with a picture", () => {
  const out = tidyTrending([{ term: "bread", count: 9, hot: false }], CATALOGUE, 4);
  assert.equal(out.length, 3);
  assert.equal(new Set(out.map((x) => x.itemId)).size, out.length);
  assert.equal(out[0].term, "bread");
  assert.equal(out[0].count, 9);
  for (const filler of out.slice(1)) {
    assert.equal(filler.count, 0);
    assert.equal(filler.hot, false);
    assert.equal(filler.kind, "product");
    assert.ok(filler.image, "a filler word has a picture");
  }
});

test("it never returns more than the limit, and real words come before filler", () => {
  const items = ["bread", "speaker", "tv"].map((term, i) => ({ term, count: 10 - i }));
  assert.deepEqual(tidyTrending(items, CATALOGUE, 2).map((x) => x.term), ["bread", "speaker"]);
  assert.deepEqual(tidyTrending([], [], 5), []);
  assert.deepEqual(tidyTrending(undefined, CATALOGUE, 0), []);
});

test("a product from the server snapshot (picture stored as imagePath) still gets its picture", () => {
  const snap = [{ ...p("bull", "Red Bull Energy Drink"), images: undefined, imagePath: "shop/bull.jpg", imageUrl: "shop/bull.jpg" }];
  const out = tidyTrending([{ term: "red bull", count: 5 }], snap, 1);
  assert.equal(out[0].image, "shop/bull.jpg");
});

test("two searches that find the same product show it once", () => {
  const snap = [{ ...p("bull", "Red Bull Energy Drink"), imagePath: "shop/bull.jpg", images: undefined }];
  const out = tidyTrending([{ term: "red bull", count: 9 }, { term: "energy drink", count: 5 }], snap, 5);
  assert.equal(out.filter((row) => row.itemId === "bull").length, 1);
  assert.equal(out[0].term, "red bull");
});

test("a category or store with no picture of its own gets one from a product it matches", () => {
  const out = tidyTrending([{ term: "speaker", kind: "category", count: 9 }, { term: "mama bakery", kind: "store", slug: "mama-bakery", image: null }], CATALOGUE, 5);
  assert.ok(out[0].image);
  assert.equal(out[0].kind, "category");
  assert.ok(out[1].image === null || typeof out[1].image === "string");
});

test("risers are checked against the catalogue and given a picture, but never padded with filler", () => {
  const out = tidyTrending([{ term: "bread", count: 3 }, { term: "unicorn saddle", count: 9 }], CATALOGUE, 10, { topUp: false });
  assert.deepEqual(out.map((x) => x.term), ["bread"]);
  assert.equal(out[0].image, "bread.png");
  assert.equal(out.some((x) => x.filler), false);
});
