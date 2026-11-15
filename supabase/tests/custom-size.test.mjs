// Migration 0125: a made-to-measure setting is stored per item, checked, owned by the shop, and read by buyers only for a listed item.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
const anon = { role: "anon" };
const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_custom_size" })); await seedFixtures(c); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_media; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const field = (label, over = {}) => ({ key: label.toLowerCase(), label, unit: "cm", min: 60, max: 200, required: true, ...over });
const dress = (over = {}) => ({ enabled: true, axisKey: "size", fields: [field("Bust"), field("Waist")], price: { mode: "fixed", base: 4500 }, ...over });
const sofa = () => ({ enabled: true, axisKey: "size", fields: [field("Width", { min: 10, max: 600 })], price: { mode: "per-extra", base: 30000, perUnit: 100, field: "width", over: 180 } });
const item = async (biz = ids.bizA, visible = true) => (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft) values ($1, 'Wrap dress', 100, 'fixed', $2, false) returning id`, [biz, visible]))[0].id;

test("custom_size_valid: the shapes the editor sends are accepted, the rest are not", async () => {
  const ok = async (cfg) => (await sql(c, `select custom_size_valid($1::jsonb) as v`, [cfg === null ? null : JSON.stringify(cfg)]))[0].v;
  assert.equal(await ok(null), true);
  assert.equal(await ok(dress()), true);
  assert.equal(await ok(sofa()), true);
  assert.equal(await ok(dress({ fields: [] })), false, "at least one measurement");
  assert.equal(await ok(dress({ fields: Array.from({ length: 7 }, (_, i) => field(`F${i}`)) })), false, "at most six");
  assert.equal(await ok(dress({ fields: [field("Bust"), field("bust", { key: "bust2" })] })), false, "labels are unique");
  assert.equal(await ok(dress({ fields: [field("Bust", { unit: "mm" })] })), false);
  assert.equal(await ok(dress({ fields: [field("Bust", { min: 200, max: 60 })] })), false);
  assert.equal(await ok(dress({ price: { mode: "fixed", base: 45.5 } })), false, "whole KES");
  assert.equal(await ok(dress({ price: { mode: "per-extra", base: 1, perUnit: 1, field: "nope", over: 1 } })), false);
  assert.equal(await ok(dress({ enabled: false })), false, "an off setting is stored as null");
  assert.equal(await ok({ ...dress(), extra: 1 }), false);
});

test("the shop saves, reads and clears its own; another shop cannot", async () => {
  const id = await item();
  assert.equal((await as(asA, `select seller_set_item_custom_size($1, $2::jsonb) as v`, [id, JSON.stringify(dress())]))[0].v, true);
  assert.deepEqual((await as(asA, `select seller_item_custom_size($1) as v`, [id]))[0].v, dress());
  await rejects(c, asB, `select seller_set_item_custom_size($1, $2::jsonb)`, [id, JSON.stringify(dress())], /item_not_found/);
  await rejects(c, asB, `select seller_item_custom_size($1)`, [id], /item_not_found/);
  await rejects(c, asA, `select seller_set_item_custom_size($1, $2::jsonb)`, [id, JSON.stringify(dress({ fields: [] }))], /invalid_custom_size/);
  await rejects(c, anon, `select seller_set_item_custom_size($1, $2::jsonb)`, [id, JSON.stringify(dress())], /permission denied/);
  assert.equal((await as(asA, `select seller_set_item_custom_size($1, null) as v`, [id]))[0].v, true);
  assert.equal((await as(asA, `select seller_item_custom_size($1) as v`, [id]))[0].v, null);
});

test("buyers read it for a listed item only", async () => {
  const listed = await item(ids.bizA, true);
  const hidden = await item(ids.bizA, false);
  for (const id of [listed, hidden]) await as(asA, `select seller_set_item_custom_size($1, $2::jsonb)`, [id, JSON.stringify(dress())]);
  assert.deepEqual((await as(anon, `select public_item_custom_size($1) as v`, [listed]))[0].v, dress());
  assert.equal((await as(anon, `select public_item_custom_size($1) as v`, [hidden]))[0].v, null);
});
