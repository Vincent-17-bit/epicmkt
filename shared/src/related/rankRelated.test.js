import test from "node:test";
import assert from "node:assert/strict";
import { rankRelated, relatedScore } from "./rankRelated.js";

const soundbar = { id: "sb", businessId: "shop-1", productTypeId: "soundbar", departmentId: "electronics", name: "Samsung soundbar", price: 150 };
const make = (n, over = {}) => ({ id: n, businessId: `shop-${n}`, productTypeId: "other", departmentId: "other", name: `Item ${n}`, availability: "available", createdAt: "2026-01-01T00:00:00Z", ...over });
const relations = [
  { fromKind: "type", fromId: "soundbar", toKind: "type", toId: "smart-tv", weight: 5 },
  { fromKind: "type", fromId: "soundbar", toKind: "department", toId: "cables-power", weight: 0 },
  { fromKind: "type", fromId: "soundbar", toKind: "type", toId: "speakers", weight: 2 }
];
const ids = (r) => r.items.map((x) => x.id);

test("soundbar goes with smart TV, cables and speakers, best relation first; unrelated items never appear", () => {
  const tv = make("tv", { productTypeId: "smart-tv", departmentId: "electronics", name: "Smart TV" });
  const cable = make("cable", { productTypeId: "hdmi", departmentId: "cables-power", name: "HDMI cable" });
  const speaker = make("speaker", { productTypeId: "speakers", departmentId: "electronics", name: "Speaker" });
  const bread = make("bread", { productTypeId: "bread", departmentId: "food-drink", name: "Bread" });
  const got = rankRelated(soundbar, [bread, cable, speaker, tv], { relations });
  assert.deepEqual(ids(got), ["tv", "speaker", "cable"]);
  assert.equal(got.hasMore, false);
  assert.equal(got.total, 3);
});

test("the item itself, sold-out items and duplicates are left out", () => {
  const tv = make("tv", { productTypeId: "smart-tv" });
  const rows = [soundbar, tv, tv, make("gone", { productTypeId: "smart-tv", availability: "out_of_stock" }), make("old", { productTypeId: "smart-tv", availability: "unavailable" })];
  assert.deepEqual(ids(rankRelated(soundbar, rows, { relations })), ["tv"]);
});

test("an inactive relation is ignored", () => {
  const tv = make("tv", { productTypeId: "smart-tv" });
  assert.equal(relatedScore(soundbar, tv, [{ ...relations[0], active: false }]), 0);
});

test("with no relations only the same department or type qualifies", () => {
  const sameDept = make("d", { departmentId: "electronics" });
  assert.deepEqual(ids(rankRelated(soundbar, [sameDept, make("x")])), ["d"]);
  assert.deepEqual(ids(rankRelated({ id: "legacy", businessId: "s" }, [make("a"), make("b")])), [], "an item with no type or department gets nothing");
});

const tvs = (count, { mine = 0 } = {}) =>
  Array.from({ length: count }, (_, i) =>
    make(`tv${String(i).padStart(2, "0")}`, { productTypeId: "smart-tv", businessId: i < mine ? "shop-1" : `shop-x${i}`, createdAt: `2026-01-${String(10 + (i % 18)).padStart(2, "0")}T00:00:00Z` })
  );
const fromShop = (r) => r.items.filter((x) => x.fromThisShop).length;

test("1 in 5 from this shop: 5 results need 1, even when the shop's items score lower", () => {
  // this shop's single item is a department-only match (low score); four others are strong relation matches
  const weak = make("weak", { businessId: "shop-1", departmentId: "electronics" });
  const got = rankRelated(soundbar, [weak, ...tvs(4)], { relations });
  assert.equal(got.items.length, 5);
  assert.equal(fromShop(got), 1);
  assert.ok(ids(got).includes("weak"));
});

test("1 in 5 from this shop: 10 results need 2", () => {
  const weak = ["w1", "w2", "w3"].map((n) => make(n, { businessId: "shop-1", departmentId: "electronics" }));
  const got = rankRelated(soundbar, [...weak, ...tvs(9)], { relations });
  assert.equal(got.items.length, 10);
  assert.equal(fromShop(got), 2);
});

test("1 in 5 from this shop: 3 results need 1", () => {
  const weak = make("weak", { businessId: "shop-1", departmentId: "electronics" });
  const got = rankRelated(soundbar, [weak, ...tvs(2)], { relations });
  assert.equal(got.items.length, 3);
  assert.equal(fromShop(got), 1);
});

test("when this shop has more strong matches than the quota, they may fill more slots", () => {
  const got = rankRelated(soundbar, tvs(10, { mine: 6 }), { relations });
  assert.ok(fromShop(got) >= 2);
});

test("a shop with only the viewed item: no this-shop results, nothing padded", () => {
  const got = rankRelated(soundbar, [soundbar, ...tvs(5)], { relations });
  assert.equal(got.items.length, 5);
  assert.equal(fromShop(got), 0);
});

test("a short page is never padded with unrelated items", () => {
  const got = rankRelated(soundbar, [make("x"), make("y")], { relations });
  assert.deepEqual(got, { items: [], page: 1, pageSize: 10, hasMore: false, total: 0 });
});

test("paging: pages do not overlap, cover everything once, and say whether more exist", () => {
  const weak = ["w1", "w2", "w3"].map((n) => make(n, { businessId: "shop-1", departmentId: "electronics" }));
  const all = [...weak, ...tvs(22)]; // 25 in total
  const one = rankRelated(soundbar, all, { relations, page: 1 });
  const two = rankRelated(soundbar, all, { relations, page: 2 });
  const three = rankRelated(soundbar, all, { relations, page: 3 });
  assert.deepEqual([one.items.length, two.items.length, three.items.length], [10, 10, 5]);
  assert.deepEqual([one.hasMore, two.hasMore, three.hasMore], [true, true, false]);
  const every = [...ids(one), ...ids(two), ...ids(three)];
  assert.equal(new Set(every).size, 25);
  // quota is 2 per full page; this shop has 3 items, so page 1 gets 2, page 2 gets the last one, page 3 none
  assert.deepEqual([fromShop(one), fromShop(two), fromShop(three)], [2, 1, 0]);
  assert.equal(rankRelated(soundbar, all, { relations, page: 4 }).items.length, 0);
  assert.equal(rankRelated(soundbar, all, { relations, page: 4 }).hasMore, false);
});

test("bad page numbers fall back to the first page; the order is the same on every call", () => {
  const all = tvs(12);
  assert.deepEqual(ids(rankRelated(soundbar, all, { relations, page: 0 })), ids(rankRelated(soundbar, all, { relations, page: 1 })));
  assert.deepEqual(ids(rankRelated(soundbar, all, { relations, page: 1 })), ids(rankRelated(soundbar, [...all].reverse(), { relations, page: 1 })));
});

test("a department-level relation and a heavier weight rank higher", () => {
  const a = make("a", { productTypeId: "t1", departmentId: "d1" });
  const b = make("b", { productTypeId: "t2", departmentId: "d1" });
  const item = { id: "i", businessId: "s", productTypeId: "tx", departmentId: "dx" };
  const rels = [{ fromKind: "type", fromId: "tx", toKind: "type", toId: "t1", weight: 1 }, { fromKind: "type", fromId: "tx", toKind: "type", toId: "t2", weight: 9 }];
  assert.deepEqual(ids(rankRelated(item, [a, b], { relations: rels })), ["b", "a"]);
  const dep = [{ fromKind: "department", fromId: "dx", toKind: "department", toId: "d1", weight: 0 }];
  assert.equal(rankRelated(item, [a], { relations: dep }).items.length, 1);
});
