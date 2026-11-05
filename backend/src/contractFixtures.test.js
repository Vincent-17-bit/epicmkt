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

test("items.getList serves all 14 fixtures as valid list cards, filters by type and pages", async () => {
  const all = await getItemList();
  assert.equal(all.total, 14);
  assert.deepEqual(all.items.map((c) => c.id), fixtures.map((f) => f.id));
  assert.ok(all.items.every(isItemListCard));
  const phones = await getItemList({ productType: "phone" });
  assert.deepEqual(phones.items.map((c) => c.id), ["fx-phone"]);
  assert.equal(phones.total, 1);
  const page = await getItemList({ limit: 5, offset: 10 });
  assert.equal(page.total, 14);
  assert.equal(page.items.length, 4);
  assert.deepEqual((await getItemList({ businessId: "nope" })).items, []);
  assert.equal((await getItemList({ businessId: "fixture-store" })).total, 14);
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

test("seller_product_types serves the 13 types, valid, as a copy", async () => {
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
