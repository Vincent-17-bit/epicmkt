import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_merge" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50`);
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(c, `delete from item_merges; delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const addItem = async (biz, name, price, over = {}) => {
  const [r] = await sql(c, `insert into items (business_id, name, price, price_type, visible, draft, track_stock, stock_count, brand) values ($1, $2, $3, 'fixed', $4, $5, $6, $7, $8) returning id`,
    [biz, name, price, over.visible ?? true, over.draft ?? false, over.track ?? false, over.stock ?? null, over.brand ?? null]);
  return r.id;
};
const call = (who, fn, ...args) => tx(c, who, (k) => sql(k, `select ${fn} as r`, args), { commit: true }).then((r) => r[0].r);
const groups = () => call(asA, "seller_similar_item_groups()");
const merge = (idList, plan, who = asA) => call(who, "seller_merge_items($1::uuid[], $2::jsonb)", idList, JSON.stringify(plan));
const undo = (id, who = asA) => call(who, "seller_undo_merge($1::uuid)", id);

const breadPlan = (a, b) => ({
  name: "Bread",
  axes: [{ key: "weight", label: "Weight", display: "button", values: [{ id: "400-g", label: "400 g" }, { id: "800-g", label: "800 g" }] }],
  choices: { [a]: { weight: "400-g" }, [b]: { weight: "800-g" } }
});
const waterPlan = (a, b, d) => ({
  name: "Drinking water",
  axes: [{ key: "size", label: "Container size", display: "button", values: [{ id: "5-l", label: "5 L" }, { id: "10-l", label: "10 L" }, { id: "20-l", label: "20 L" }] }],
  choices: { [a]: { size: "5-l" }, [b]: { size: "10-l" }, [d]: { size: "20-l" } }
});

test("bread 400g and 800g are suggested as one group", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800 g", 115);
  await addItem(ids.bizA, "Cake 1kg", 900);
  const g = await groups();
  assert.equal(g.length, 1);
  assert.equal(g[0].key, "bread");
  assert.equal(g[0].name, "Bread");
  assert.deepEqual(g[0].items.map((i) => i.id).sort(), [a, b].sort());
  assert.deepEqual(g[0].items.map((i) => i.varies).sort(), ["400g", "800 g"]);
});

test("different brands are not grouped, and another shop's items are never listed", async () => {
  await addItem(ids.bizA, "Milk 500ml", 60, { brand: "Brookside" });
  await addItem(ids.bizA, "Milk 1L", 110, { brand: "Tuzo" });
  await addItem(ids.bizB, "Milk 500ml", 60, { brand: "Brookside" });
  await addItem(ids.bizB, "Milk 1L", 110, { brand: "Brookside" });
  assert.deepEqual(await groups(), []);
});

test("merge creates one item with a variant per source and hides the sources", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  const r = await merge([a, b], breadPlan(a, b));
  assert.equal(r.published, true);
  const [item] = await sql(c, `select name, price, price_type, visible, draft from items where id = $1`, [r.itemId]);
  assert.equal(item.name, "Bread");
  assert.equal(Number(item.price), 60);
  assert.equal(item.price_type, "from");
  assert.equal(item.visible, true);
  assert.equal(item.draft, false);
  const v = await sql(c, `select combo_key, price from item_variants where item_id = $1 order by price`, [r.itemId]);
  assert.deepEqual(v.map((x) => [x.combo_key, Number(x.price)]), [["weight=400-g", 60], ["weight=800-g", 115]]);
  const old = await sql(c, `select visible from items where id = any($1)`, [[a, b]]);
  assert.deepEqual(old.map((x) => x.visible), [false, false]);
});

test("old ids redirect to the combined item with the option chosen", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  const r = await merge([a, b], breadPlan(a, b));
  const red = await tx(c, { role: "anon" }, (k) => sql(k, `select public_item_redirect($1) as r`, [b]));
  assert.equal(red[0].r.itemId, r.itemId);
  assert.deepEqual(red[0].r.choice, { weight: "800-g" });
  const none = await tx(c, { role: "anon" }, (k) => sql(k, `select public_item_redirect($1) as r`, [r.itemId]));
  assert.equal(none[0].r, null);
});

test("20 L water: three sizes merge, stock and sale price carry over", async () => {
  const a = await addItem(ids.bizA, "Drinking water 5L", 30, { track: true, stock: 7 });
  const b = await addItem(ids.bizA, "Drinking water 10L", 50);
  const d = await addItem(ids.bizA, "Drinking water 20L", 80);
  await sql(c, `update items set sale_price = 70 where id = $1`, [d]);
  const r = await merge([a, b, d], waterPlan(a, b, d));
  const v = await sql(c, `select combo_key, price, sale_price, stock_count from item_variants where item_id = $1 order by price`, [r.itemId]);
  assert.deepEqual(v.map((x) => [x.combo_key, Number(x.price), x.sale_price === null ? null : Number(x.sale_price), x.stock_count]),
    [["size=5-l", 30, null, 7], ["size=10-l", 50, null, null], ["size=20-l", 80, 70, null]]);
});

test("photos move to the combined item", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $3, 'image', 'a/1.jpg', 'image/jpeg'), ($2, $3, 'image', 'b/1.jpg', 'image/jpeg')`, [a, b, ids.bizA]);
  const r = await merge([a, b], breadPlan(a, b));
  const m = await sql(c, `select item_id from item_media`);
  assert.ok(m.every((x) => x.item_id === r.itemId));
  const v = await sql(c, `select cardinality(media_ids) as n from item_variants where item_id = $1`, [r.itemId]);
  assert.deepEqual(v.map((x) => x.n), [1, 1]);
});

test("undo restores the sources, photos and removes the redirects", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115, { visible: false, draft: true });
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', 'a/1.jpg', 'image/jpeg')`, [a, ids.bizA]);
  const r = await merge([a, b], breadPlan(a, b));
  assert.equal(r.published, false);
  await undo(r.mergeId);
  assert.equal((await sql(c, `select 1 from items where id = $1`, [r.itemId])).length, 0);
  const old = await sql(c, `select id, visible, draft from items where id = any($1) order by name`, [[a, b]]);
  assert.deepEqual(old.map((x) => [x.visible, x.draft]), [[true, false], [false, true]]);
  assert.equal((await sql(c, `select item_id from item_media`))[0].item_id, a);
  assert.equal((await sql(c, `select 1 from item_redirects`)).length, 0);
  await rejects(c, asA, `select seller_undo_merge($1)`, [r.mergeId], /already_undone/);
  assert.equal((await groups()).length, 1);
});

test("undo is refused after the window", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  const r = await merge([a, b], breadPlan(a, b));
  await sql(c, `update item_merges set expires_at = now() - interval '1 minute' where id = $1`, [r.mergeId]);
  await rejects(c, asA, `select seller_undo_merge($1)`, [r.mergeId], /undo_window_closed/);
  assert.equal((await sql(c, `select 1 from items where id = $1`, [r.itemId])).length, 1);
});

test("another shop cannot undo a merge", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  const r = await merge([a, b], breadPlan(a, b));
  await rejects(c, asB, `select seller_undo_merge($1)`, [r.mergeId], /merge_not_found/);
});

test("items of two shops are never merged", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const x = await addItem(ids.bizB, "Bread 800g", 115);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, x], JSON.stringify(breadPlan(a, x))], /item_not_found/);
  await rejects(c, asB, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, x], JSON.stringify(breadPlan(a, x))], /item_not_found/);
  assert.equal((await sql(c, `select 1 from items`)).length, 2);
  assert.equal((await sql(c, `select 1 from item_merges`)).length, 0);
});

test("bad merges are refused and leave everything untouched", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  const plan = breadPlan(a, b);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a], JSON.stringify(plan)], /invalid_merge/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, a], JSON.stringify(plan)], /invalid_merge/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ ...plan, name: "x" })], /invalid_name/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ ...plan, choices: { [a]: { weight: "400-g" }, [b]: { weight: "400-g" } } })], /duplicate_variant/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ ...plan, choices: { [a]: { weight: "400-g" }, [b]: { weight: "9-g" } } })], /invalid_choice/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ ...plan, axes: [] })], /invalid_options/);
  assert.equal((await sql(c, `select 1 from items`)).length, 2);
  assert.equal((await sql(c, `select 1 from items where visible`)).length, 2);
});

test("an item in a flash sale, or already merged, cannot be merged", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20)`, [ids.bizA, a]);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify(breadPlan(a, b))], /item_in_flash_sale/);
  await sql(c, `delete from flash_sales`);
  await merge([a, b], breadPlan(a, b));
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify(breadPlan(a, b))], /already_merged/);
});

test("merged items and items with options no longer appear in groups", async () => {
  const a = await addItem(ids.bizA, "Bread 400g", 60);
  const b = await addItem(ids.bizA, "Bread 800g", 115);
  await merge([a, b], breadPlan(a, b));
  assert.deepEqual(await groups(), []);
});
