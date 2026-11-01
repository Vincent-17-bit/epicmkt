import test from "node:test";
import assert from "node:assert/strict";
import { rankSimilar, priceBand, distanceBand, analyseName, similarTerms, relevance, MIN_RELEVANCE, singular } from "./similar.js";

const current = { id: "cur", businessId: "b0", name: "Wooden dining table", section: "Tables", price: 10000, tags: ["furniture", "wood"], lat: -1.29, lng: 36.82 };
// The default candidate is the same kind of thing as `current`, so the ordering tests below are about ordering, not relevance.
const make = (id, over = {}) => ({
  id,
  businessId: over.businessId ?? `b-${id}`,
  name: "Wooden table",
  section: null,
  price: 10000,
  tags: [],
  lat: -1.29,
  lng: 36.82,
  createdAt: "2026-01-01T00:00:00Z",
  ...over
});
const ids = (rows) => rows.map((r) => r.id);

const bread = { id: "cur", businessId: "b0", categoryId: "bakeries", name: "Bread 400g", section: "Bakery", price: 60, tags: [] };
const loaf = (id, over = {}) => make(id, { name: "Bread loaf", section: "Bread", price: 60, ...over });

// ---- relevance: what counts as "the same kind of thing" -------------------------------------------------------------

test("bread never shows cake: only bread and loaf items come back, even in the same store category and section", () => {
  const rows = rankSimilar({
    current: bread,
    candidates: ["Brown Bread", "Wheat Loaf", "Chocolate Cake", "Cupcake", "Biscuits", "Milk"].map((name) =>
      make(name, { name, categoryId: "bakeries", section: "Bakery", price: 60 })
    )
  });
  assert.deepEqual(ids(rows).sort(), ["Brown Bread", "Wheat Loaf"]);
});

test("a missing categoryId no longer lets everything in", () => {
  const rows = rankSimilar({
    current: { id: "cur", businessId: "b0", name: "Brown Bread 400g", section: "Bakery", price: 60 },
    candidates: [make("bread", { name: "White bread" }), make("cake", { name: "Chocolate cake" }), make("lamp", { name: "Table lamp" }), make("milk", { name: "Fresh milk", section: "Dairy" })]
  });
  assert.deepEqual(ids(rows), ["bread"]);
});

test("fewer matches than the limit gives a short row, never one padded with non-matches", () => {
  const candidates = [
    ...["a", "b", "c"].map((id) => loaf(id)),
    ...Array.from({ length: 20 }, (_, i) => make(`x${i}`, { name: "Chocolate cake", section: "Bread", categoryId: "bakeries" }))
  ];
  const rows = rankSimilar({ current: bread, candidates, limit: 12 });
  assert.deepEqual(ids(rows).sort(), ["a", "b", "c"]);
});

test("a shared modifier alone does not make things similar: chocolate cake is not chocolate biscuits", () => {
  const cake = { id: "cur", businessId: "b0", name: "Chocolate Cake", section: "Bakery", price: 500 };
  const rows = rankSimilar({
    current: cake,
    candidates: [make("bis", { name: "Chocolate Biscuits", section: "Bakery", price: 500 }), make("bar", { name: "Chocolate bar", section: "Bakery" })]
  });
  assert.deepEqual(ids(rows), []);
  assert.equal(relevance(cake, make("bis", { name: "Chocolate Biscuits" })).qualifies, false);
  assert.equal(relevance(cake, make("cake2", { name: "Vanilla Cake" })).qualifies, true);
});

test("the same head noun beats a shared section, and a shared section only qualifies when the name says nothing", () => {
  const rows = rankSimilar({
    current,
    candidates: [
      make("elsewhere", { section: "Chairs", name: "Item" }),
      make("section-only", { section: " tables ", name: "Item", price: 90000 }),
      make("same-head", { section: "Chairs", name: "Oak dining table" })
    ]
  });
  assert.deepEqual(ids(rows), ["same-head", "section-only"]);
});

test("same section but a different head noun ranks below the same head noun, and an unrelated one is out", () => {
  const sofa = { id: "cur", businessId: "b0", name: "Leather sofa", section: "Living room", price: 40000 };
  const rows = rankSimilar({
    current: sofa,
    candidates: [
      make("armchair", { name: "Velvet armchair", section: "Living room", price: 40000 }),
      make("couch", { name: "Fabric couch", section: "Other", price: 90000 }),
      make("lamp", { name: "Table lamp", section: "Living room", price: 40000 })
    ]
  });
  assert.deepEqual(ids(rows), ["couch", "armchair"]);
});

test("related heads need the section too, and opaque heads (names the vocabulary does not know) fall back to the section", () => {
  const sofa = { id: "cur", businessId: "b0", name: "Leather sofa", section: "Seating" };
  assert.equal(relevance(sofa, make("a", { name: "Velvet armchair", section: "Seating" })).state, "related");
  assert.equal(relevance(sofa, make("b", { name: "Velvet armchair", section: "Other" })).qualifies, false);
  const galaxy = { id: "cur", businessId: "b0", name: "Samsung Galaxy A15 128GB", section: "Phones" };
  const spark = relevance(galaxy, make("c", { name: "Tecno Spark 10", section: "Phones" }));
  assert.equal(spark.state, "opaque");
  assert.equal(spark.qualifies, true);
  assert.equal(relevance(galaxy, make("d", { name: "Tecno Spark 10", section: "Other" })).qualifies, false);
  assert.equal(relevance(galaxy, make("e", { name: "Brown bread", section: "Phones" })).qualifies, false);
  assert.ok(MIN_RELEVANCE > 0);
});

test("category and tags only break ties between items that already match", () => {
  const rows = rankSimilar({
    current: { ...bread, tags: ["fresh"] },
    candidates: [
      loaf("plain"),
      loaf("tagged", { tags: ["Fresh"] }),
      loaf("same-category", { categoryId: "bakeries" }),
      make("cake", { name: "Cake", categoryId: "bakeries", tags: ["fresh"], section: "Bakery" })
    ]
  });
  assert.deepEqual(ids(rows), ["same-category", "tagged", "plain"]);
});

test("within the same head noun, shared modifiers and tags rank higher", () => {
  const rows = rankSimilar({
    current,
    candidates: [
      make("plain", { section: "Tables", name: "Glass table" }),
      make("words", { section: "Tables", name: "Dining tables, oak" }),
      make("tags", { section: "Tables", name: "Glass table", tags: ["Wood"] })
    ]
  });
  assert.deepEqual(ids(rows), ["words", "tags", "plain"]);
});

test("an explicit productType overrides the name", () => {
  const cur = { id: "cur", businessId: "b0", name: "Mama's special", productType: "bread", section: "" };
  assert.deepEqual(ids(rankSimilar({ current: cur, candidates: [make("x", { name: "Wheat loaf" }), make("y", { name: "Cake", productType: "cake" })] })), ["x"]);
});

// ---- name analysis ---------------------------------------------------------------------------------------------------

test("units, pack sizes, models and brands are ignored when working out what an item is", () => {
  assert.equal(analyseName("Brown Bread 400g").head, "bread");
  assert.equal(analyseName("Fresh Milk 2L x6").head, "milk");
  assert.equal(analyseName("Brookside Fresh Milk 500ml", "Brookside").head, "milk");
  assert.equal(analyseName("Milk Brookside", "Brookside").head, "milk");
  assert.equal(analyseName("Chocolate Cake").head, "cake");
  assert.equal(analyseName("Sliced bread loaf 400g").head, "bread");
  assert.equal(analyseName("Phone case for iPhone 13").head, "case");
  assert.equal(analyseName("Pack of 6 eggs").head, "egg");
  assert.equal(analyseName("Leather Sofa Black").head, "sofa");
  assert.equal(analyseName("Brown bread, Brookside 400g").head, "bread");
  assert.equal(analyseName("iPhone 13 Pro 128GB").head, "phone");
  assert.equal(analyseName("T-Shirt (cotton)").head, "tshirt");
  assert.equal(analyseName("Samsung 43 inch TV").head, "tv");
  assert.equal(analyseName("Item").head, null);
  assert.equal(analyseName("").head, null);
  assert.equal(analyseName(null).head, null);
  assert.equal(analyseName("Brown Bread 400g").headWord, "bread");
  assert.equal(analyseName("Brown Breads").headWord, "breads");
  assert.deepEqual([...analyseName("Brown Bread 400g").mods], ["brown"]);
  assert.equal(analyseName("Brown Bread 400g").known, true);
  assert.equal(analyseName("Samsung Galaxy A15").known, false);
  assert.equal(analyseName("Item").known, false);
});

test("aliases and plurals fold together", () => {
  const same = (a, b) => assert.equal(relevance({ id: "1", name: a, section: "" }, make("2", { name: b })).state, "same", `${a} ~ ${b}`);
  same("Brown bread", "Wheat loaf");
  same("Loaves", "Bread");
  same("Leather sofa", "Fabric couch");
  same("Samsung phone", "Mobile phone");
  same("Boxes", "Box");
  same("Berries", "Berry");
  same("Dresses", "Dress");
  assert.equal(singular("shoes"), "shoe");
  assert.equal(singular("lens"), "lens");
  assert.equal(singular("glass"), "glass");
});

test("similarTerms gives every written form of the head and its aliases, for the database search", () => {
  const terms = similarTerms("Brown Bread 400g");
  for (const word of ["bread", "breads", "loaf", "loaves"]) assert.ok(terms.includes(word), word);
  assert.deepEqual(similarTerms("Item"), []);
  assert.ok(similarTerms("Galaxy A15").includes("galaxy"));
  assert.ok(terms.every((word) => /^[a-z0-9]+$/.test(word)));
});

// ---- ordering --------------------------------------------------------------------------------------------------------

test("never returns the current item or anything from the current store", () => {
  const rows = rankSimilar({ current, candidates: [make("cur"), make("same-store", { businessId: "b0" }), make("ok")] });
  assert.deepEqual(ids(rows), ["ok"]);
});

test("the order is the same whatever order the candidates arrive in", () => {
  const candidates = ["a", "b", "c", "d", "e"].map((id, i) => make(id, { price: 10000 + (i % 2) * 100 }));
  const forward = ids(rankSimilar({ current, candidates }));
  assert.deepEqual(ids(rankSimilar({ current, candidates: [...candidates].reverse() })), forward);
  assert.deepEqual(forward, ["a", "c", "e", "b", "d"]);
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

test("each store's best item comes first, so one store cannot overpower the others", () => {
  const rows = rankSimilar({
    current,
    limit: 4,
    perStore: 2,
    candidates: [make("a1", { businessId: "A" }), make("a2", { businessId: "A" }), make("a3", { businessId: "A" }), make("b1", { businessId: "B" })]
  });
  assert.deepEqual(ids(rows), ["a1", "b1", "a2", "a3"]);
});

test("with plenty of stores, every card is from a different store", () => {
  const candidates = Array.from({ length: 30 }, (_, i) => make(`i${i}`, { businessId: `s${i % 15}` }));
  const rows = rankSimilar({ current, candidates });
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map((r) => r.businessId)).size, 12);
});

test("about half the row is from different featured stores that really have the item, alternating with the rest", () => {
  const candidates = [
    ...Array.from({ length: 8 }, (_, i) => loaf(`f${i}`, { featured: true, name: "Bread loaf extra" })),
    ...Array.from({ length: 8 }, (_, i) => loaf(`o${i}`, { price: 61 })),
    loaf("f-second", { featured: true, businessId: "b-f0", price: 60 })
  ];
  const rows = rankSimilar({ current: bread, candidates, limit: 12 });
  const featured = rows.filter((r) => r.featured);
  assert.equal(rows.length, 12);
  assert.equal(featured.length, 6);
  assert.equal(new Set(featured.map((r) => r.businessId)).size, 6);
  assert.deepEqual(rows.slice(0, 6).map((r) => Boolean(r.featured)), [true, false, true, false, true, false]);
});

test("featured is a priority, not a pass: a featured store without the item is not promoted, and a short supply is not padded", () => {
  const candidates = [
    make("f-shoes", { featured: true, name: "Sneakers", section: "Men", categoryId: "shoes" }),
    loaf("f-bread", { featured: true }),
    ...Array.from({ length: 5 }, (_, i) => loaf(`o${i}`))
  ];
  const rows = rankSimilar({ current: bread, candidates, limit: 12 });
  assert.deepEqual(rows.filter((r) => r.featured).map((r) => r.id), ["f-bread"]);
  assert.equal(rows.some((r) => r.id === "f-shoes"), false);
  assert.equal(rows.length, 6);
});

test("a featured store that only matches by section is not promoted either", () => {
  const candidates = [make("f-opaque", { featured: true, name: "Item", section: "Bakery" }), ...Array.from({ length: 4 }, (_, i) => loaf(`o${i}`))];
  const rows = rankSimilar({ current: bread, candidates, limit: 4 });
  assert.equal(rows.some((r) => r.id === "f-opaque"), false);
});

test("respects the limit, drops duplicates, is deterministic, and survives bad input", () => {
  const candidates = [make("x"), make("x"), make("y"), make("z")];
  assert.deepEqual(ids(rankSimilar({ current, candidates, limit: 2 })), ["x", "y"]);
  assert.deepEqual(rankSimilar({ current, candidates: null }), []);
  assert.deepEqual(rankSimilar({ current: null, candidates }), []);
  // Nothing to compare on (no name, no section) means nothing qualifies.
  assert.deepEqual(rankSimilar({ current: { id: "c" }, candidates: [{ id: "q" }, null, { id: "r", price: "abc", tags: "no" }] }), []);
  assert.doesNotThrow(() => rankSimilar({ current: { id: "c", name: "Bread" }, candidates: [{ id: "q", name: "Bread" }, null, { id: "r", name: "Loaf", price: "abc", tags: "no" }] }));
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
