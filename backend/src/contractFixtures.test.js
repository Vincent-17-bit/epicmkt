import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_TYPES, getFixtures, isItemDetail, isItemListCard, isProductType } from "@epicmkt/shared";
import { getItemDetail, getItemList, getRelatedItems, getSellerProductTypes, getAllProducts, getSimilarItems, setLatency, NotFoundError } from "./index.js";

setLatency(0);
const fixtures = getFixtures();

test("items.getDetail serves every fixture exactly as written, valid, and as a copy", async () => {
  for (const f of fixtures) {
    const served = await getItemDetail(f.id);
    assert.deepEqual(served, f.detail, f.id);
    assert.ok(isItemDetail(served), f.id);
    served.name = "changed";
    assert.notEqual(f.detail.name, "changed", `${f.id} is a copy`);
    assert.deepEqual(await getItemDetail(f.id, { businessId: f.detail.businessId }), f.detail, `${f.id} by business id`);
    assert.deepEqual(await getItemDetail(f.id, { businessId: f.detail.businessSlug }), f.detail, `${f.id} by business slug`);
  }
});

test("items.getDetail refuses a fixture asked for under another business", async () => {
  await assert.rejects(() => getItemDetail("fx-phone", { businessId: "b_001" }), NotFoundError);
});

test("items.getList serves all 15 fixtures as valid list cards, filters by type and pages", async () => {
  const all = await getItemList();
  assert.equal(all.total, 15);
  assert.deepEqual(all.items.map((c) => c.id), fixtures.map((f) => f.id));
  assert.ok(all.items.every(isItemListCard));
  const phones = await getItemList({ productType: "phone" });
  assert.deepEqual(phones.items.map((c) => c.id), ["fx-phone"]);
  assert.equal(phones.total, 1);
  const page = await getItemList({ limit: 5, offset: 10 });
  assert.equal(page.total, 15);
  assert.equal(page.items.length, 5);
  assert.deepEqual((await getItemList({ businessId: "nope" })).items, []);
  assert.equal((await getItemList({ businessId: "fixture-store" })).total, 15);
});

test("items.getList cards carry the price range fields", async () => {
  const by = Object.fromEntries((await getItemList()).items.map((c) => [c.id, c]));
  const pick = (c) => [c.priceMin, c.priceMax, c.hasPriceRange, c.hasOptions, c.productTypeId, c.has3d];
  assert.deepEqual(pick(by["fx-legacy"]), [1500, 1500, false, false, null, false]);
  assert.deepEqual(pick(by["fx-phone"]), [24000, 25000, true, true, "phone", false]);
  assert.deepEqual(pick(by["fx-printing"]), [20, 40, true, true, "printing", false]);
  assert.deepEqual(pick(by["fx-sandisk"]).slice(0, 3), [by["fx-sandisk"].priceMin, by["fx-sandisk"].priceMax, true]);
  for (const c of Object.values(by)) assert.ok(c.priceMin !== null && c.priceMin <= c.priceMax, c.id);
  assert.ok(Object.values(by).every((c) => c.departmentId === null));
});

test("items.getList filters and sorts on priceMin", async () => {
  const cheap = await getItemList({ maxPrice: 100 });
  assert.ok(cheap.items.length > 0 && cheap.items.every((c) => c.priceMin <= 100));
  assert.equal(cheap.total, cheap.items.length);
  const band = await getItemList({ minPrice: 2000, maxPrice: 3000 });
  assert.ok(band.items.every((c) => c.priceMin >= 2000 && c.priceMin <= 3000));
  const asc = (await getItemList({ sort: "price_asc", limit: 50 })).items.map((c) => c.priceMin);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const desc = (await getItemList({ sort: "price_desc", limit: 50 })).items.map((c) => c.priceMin);
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  assert.deepEqual((await getItemList({ sort: "nope" })).items.map((c) => c.id), (await getItemList()).items.map((c) => c.id));
});

test("items.getRelated finds same-group fixtures, never the item itself", async () => {
  assert.deepEqual((await getRelatedItems("fx-led-bulb")).map((c) => c.id), ["fx-led-strip"]);
  assert.deepEqual((await getRelatedItems("fx-led-strip")).map((c) => c.id), ["fx-led-bulb"]);
  assert.deepEqual((await getRelatedItems("fx-phone")).map((c) => c.id), ["fx-sandisk"]);
  assert.deepEqual(await getRelatedItems("fx-legacy"), [], "no type, no group");
  assert.deepEqual(await getRelatedItems("fx-necklace"), [], "a group of one");
  assert.deepEqual(await getRelatedItems("fx-led-bulb", { limit: 0 }), []);
  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await getRelatedItems("fx-led-bulb", { signal: aborted.signal }), []);
  for (const f of fixtures) assert.ok((await getRelatedItems(f.id)).every(isItemListCard), f.id);
});

test("items.getRelated for a real item is the existing similar-items ranking", async () => {
  const [row] = await getAllProducts();
  assert.deepEqual(await getRelatedItems(row.id), await getSimilarItems(row.id, {}));
});

test("seller_product_types serves the 14 types, valid, as a copy", async () => {
  const types = await getSellerProductTypes();
  assert.deepEqual(types, PRODUCT_TYPES);
  assert.ok(types.every(isProductType));
  types[0].name = "changed";
  assert.notEqual(PRODUCT_TYPES[0].name, "changed");
  for (const f of fixtures.filter((x) => x.productType)) assert.ok(types.some((t) => t.id === f.productType), f.productType);
});

test("real mock items are unchanged: no fixture in the product list, no v1 field on their detail", async () => {
  const rows = await getAllProducts();
  assert.ok(rows.length > 0);
  assert.ok(!rows.some((r) => r.id.startsWith("fx-")));
  const plain = await getItemDetail("b_001-haircut", { businessId: "b_001" });
  for (const k of ["productType", "priceTiers", "quantity", "dimensions"]) assert.ok(!(k in plain), k);
});
