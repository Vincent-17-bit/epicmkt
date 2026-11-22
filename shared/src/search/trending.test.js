import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyTrending } from "./trending.js";

const shop = (slug) => ({ id: slug, slug, name: slug.replace(/-/g, " "), town: "Nakuru", isOpen: true, verified: false, featured: false, delivery: null });
const product = (id, name, slug, image = "a.png") => ({
  id, name, slug, price: 100, regularPrice: 100, pricing: { regularPrice: 100, salePrice: 100, savings: 0 }, image, images: [{ url: image }],
  videos: [], swatches: [], specs: [], highlights: [], business: shop(slug)
});

test("an example the database confirmed is kept even when the older snapshot still shows another shop's product for the term", () => {
  const snapshot = [product("old", "Glowberry Juice", "lapsed-shop"), product("new", "Glowberry Tea", "open-shop", "b.png")];
  const out = tidyTrending([{ term: "glowberry", count: 4, hot: false, itemId: "new", label: "Glowberry Tea", slug: "open-shop", image: null }], snapshot, 10);
  assert.equal(out[0].itemId, "new");
  assert.equal(out[0].slug, "open-shop");
  assert.equal(out[0].image, "b.png"); // the snapshot only lends the picture of that very product
});

test("a picture from a different product is never borrowed for a confirmed example", () => {
  const snapshot = [product("old", "Glowberry Juice", "lapsed-shop", "x.png")];
  const out = tidyTrending([{ term: "glowberry", count: 4, hot: false, itemId: "new", label: "Glowberry Tea", slug: "open-shop", image: null }], snapshot, 10);
  assert.equal(out[0].slug, "open-shop");
  assert.equal(out[0].image, null);
});

test("a term without a confirmed example still needs a product in the snapshot", () => {
  const out = tidyTrending([{ term: "glowberry", count: 4, hot: false }, { term: "nothingness", count: 3, hot: false }], [product("a", "Glowberry Juice", "s")], 10);
  assert.equal(out[0].term, "glowberry");
  assert.ok(!out.some((i) => i.term === "nothingness"));
});
