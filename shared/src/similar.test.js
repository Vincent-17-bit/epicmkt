import test from "node:test";
import assert from "node:assert/strict";
import { rankSimilar, priceBand, distanceBand } from "./similar.js";

const current = { id: "cur", businessId: "b0", name: "Wooden dining table", section: "Tables", price: 10000, tags: ["furniture", "wood"], lat: -1.29, lng: 36.82 };
const make = (id, over = {}) => ({
  id,
  businessId: over.businessId ?? `b-${id}`,
  name: "Item",
  section: null,
  price: 10000,
  tags: [],
  lat: -1.29,
  lng: 36.82,
  createdAt: "2026-01-01T00:00:00Z",
  ...over
});
const ids = (rows) => rows.map((r) => r.id);

test("never returns the current item or anything from the current store", () => {
  const rows = rankSimilar({ current, candidates: [make("cur"), make("same-store", { businessId: "b0" }), make("ok")] });
  assert.deepEqual(ids(rows), ["ok"]);
});

test("a shared name word beats a shared section, and a shared section beats nothing", () => {
  const rows = rankSimilar({
    current,
    candidates: [
      make("nothing", { section: "Chairs", name: "Item" }),
      make("section-only", { section: " tables ", name: "Item", price: 90000 }),
      make("same-name", { section: "Chairs", name: "Wooden dining table" })
    ]
  });
  assert.deepEqual(ids(rows), ["same-name", "section-only", "nothing"]);
});

test("any category: the same product in any store is found, unrelated products are not", () => {
  const bread = { id: "cur", businessId: "b0", categoryId: "bakeries", name: "White bread loaf", section: "Bread", price: 60, tags: [] };
  const rows = rankSimilar({
    current: bread,
    candidates: [
      make("same-category", { categoryId: "bakeries", name: "Cake slice", section: "Cakes", price: 60 }),
      make("supermarket-bread", { categoryId: "supermarkets", name: "Brown Bread", section: "Bakery", price: 70 }),
      make("shoes", { categoryId: "shoes", name: "Sneakers", section: "Men", price: 60 }),
      make("kiosk-loaf", { categoryId: "kiosks", name: "Sliced bread loaf 400g", section: "Food", price: 65 })
    ]
  });
  assert.deepEqual(ids(rows), ["kiosk-loaf", "supermarket-bread", "same-category"]);
});

test("within a section, shared name words and tags rank higher", () => {
  const rows = rankSimilar({
    current,
    candidates: [
      make("plain", { section: "Tables", name: "Glass top" }),
      make("words", { section: "Tables", name: "Dining tables, oak" }),
      make("tags", { section: "Tables", name: "Glass top", tags: ["Wood"] })
    ]
  });
  assert.deepEqual(ids(rows), ["words", "tags", "plain"]);
});

test("price bands decide once section and affinity tie", () => {
  const rows = rankSimilar({
    current,
    candidates: [make("far", { price: 50000 }), make("near", { price: 11000 }), make("mid", { price: 15000 }), make("none", { price: null })]
  });
  assert.deepEqual(ids(rows), ["near", "mid", "far", "none"]);
});

test("equal bands fall through to distance, then exact price", () => {
  const rows = rankSimilar({
    current,
    origin: { lat: -1.29, lng: 36.82 },
    candidates: [make("far-town", { price: 10100, lat: -0.1, lng: 34.8 }), make("here-b", { price: 10400 }), make("here-a", { price: 10100 })]
  });
  assert.deepEqual(ids(rows), ["here-a", "here-b", "far-town"]);
});

test("falls back to the viewed store's position when the visitor's is unknown", () => {
  const rows = rankSimilar({ current, candidates: [make("far", { lat: -0.1, lng: 34.8 }), make("near")] });
  assert.deepEqual(ids(rows), ["near", "far"]);
});

test("one store cannot fill the row, but spare room is still used", () => {
  const rows = rankSimilar({
    current,
    limit: 4,
    perStore: 2,
    candidates: [make("a1", { businessId: "A" }), make("a2", { businessId: "A" }), make("a3", { businessId: "A" }), make("b1", { businessId: "B" })]
  });
  assert.deepEqual(ids(rows), ["a1", "a2", "b1", "a3"]);
});

test("respects the limit, drops duplicates, is deterministic, and survives bad input", () => {
  const candidates = [make("x"), make("x"), make("y"), make("z")];
  assert.deepEqual(ids(rankSimilar({ current, candidates, limit: 2 })), ["x", "y"]);
  assert.deepEqual(rankSimilar({ current, candidates: null }), []);
  assert.deepEqual(rankSimilar({ current: null, candidates }), []);
  assert.deepEqual(rankSimilar({ current: { id: "c" }, candidates: [{ id: "q" }, null, { id: "r", price: "abc", tags: "no" }] }).length, 2);
});

test("band helpers", () => {
  assert.equal(priceBand(100, 120), 0);
  assert.equal(priceBand(100, 150), 1);
  assert.equal(priceBand(100, 200), 2);
  assert.equal(priceBand(100, 900), 3);
  assert.equal(priceBand(null, 900), 4);
  assert.equal(distanceBand(2), 0);
  assert.equal(distanceBand(500), 4);
  assert.equal(distanceBand(null), 5);
});
