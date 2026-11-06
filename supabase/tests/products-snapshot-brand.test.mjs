// Migration 0092: the home products snapshot carries each item's brand (for the buyer's Brand filter) and nothing else changes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_snapshot_brand" }));
  await seedFixtures(c);
  await c.query("update public.businesses set paid_until = now() + interval '30 days'");
});
after(async () => { await c.end(); });

const snapshot = async () => (await tx(c, { role: "anon" }, (k) => sql(k, `select products_snapshot(100) as s`)))[0].s;
const newItem = async (name, brand) => (await sql(c, `insert into items (business_id, name, price, brand) values ($1, $2, 100, $3) returning id`, [ids.bizA, name, brand]))[0].id;

test("each card in the snapshot has its brand, or null", async () => {
  await sql(c, `delete from items`);
  const a = await newItem("Phone", "Samsung");
  const b = await newItem("Case", null);
  const s = await snapshot();
  assert.equal(s.items.find((x) => x.id === a).brand, "Samsung");
  assert.equal(s.items.find((x) => x.id === b).brand, null);
});

test("the other columns, the paging and the hidden items are as before", async () => {
  await sql(c, `delete from items`);
  const a = await newItem("Phone", "Samsung");
  await sql(c, `insert into items (business_id, name, price, visible) values ($1, 'Hidden', 100, false)`, [ids.bizA]);
  const s = await snapshot();
  assert.equal(s.items.length, 1);
  assert.equal(s.truncated, false);
  const card = s.items[0];
  for (const key of ["id", "business_id", "name", "description", "section", "price", "price_type", "unit", "availability", "stock_left", "video_paths", "created_at", "image_path", "sale_id"]) assert.ok(key in card, key);
  assert.equal(card.id, a);
  assert.equal(s.businesses.length, 1);
  const limited = (await tx(c, { role: "anon" }, (k) => sql(k, `select products_snapshot(1) as s`)))[0].s;
  assert.equal(limited.items.length, 1);
});

test("the shop's own brand edits show up: a rename done by admin reaches the snapshot", async () => {
  await sql(c, `delete from items`);
  const a = await newItem("Phone", "Samsng");
  await sql(c, `update items set brand = 'Samsung' where id = $1`, [a]);
  assert.equal((await snapshot()).items[0].brand, "Samsung");
});
