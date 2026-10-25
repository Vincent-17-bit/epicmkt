import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_product_ids" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 20 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fields = (o = {}) => ({ name: "Fade cut", description: "", section: "Cuts", price_type: "fixed", price: 1200, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const save = (who, id, f) => tx(c, who, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(f)]), { commit: true }).then((r) => r[0].id);

test("every new product gets its own id, even when the name, price and shop are identical", async () => {
  const made = [];
  for (let i = 0; i < 5; i++) made.push(await save(asA, null, fields()));
  assert.equal(new Set(made).size, 5);
  made.forEach((id) => assert.match(id, UUID));
});

test("a duplicated product and an imported product each get a new id", async () => {
  const original = await save(asB, null, fields({ name: "Beard trim" }));
  const copy = (await tx(c, asB, (k) => sql(k, `select seller_duplicate_item($1::uuid) as id`, [original]), { commit: true }))[0].id;
  assert.notEqual(copy, original);

  await tx(c, asB, (k) => sql(k, `select seller_import_items($1::jsonb)`, [JSON.stringify([{ name: "Same name", price: 10 }, { name: "Same name", price: 10 }])]), { commit: true });
  const all = await sql(c, `select id from items where business_id = $1`, [ids.bizB]);
  assert.equal(all.length, 4);
  assert.equal(new Set(all.map((r) => r.id)).size, 4);
});

test("a seller who inserts straight into the table cannot choose the product id", async () => {
  const chosen = "30000000-0000-0000-0000-000000000001";
  const got = await tx(c, asA, (k) => sql(k, `insert into items (id, business_id, name, visible) values ($1, $2, 'Chosen id', false) returning id`, [chosen, ids.bizA]), { commit: true });
  assert.notEqual(got[0].id, chosen);
  assert.match(got[0].id, UUID);
  assert.equal((await sql(c, `select count(*)::int as n from items where id = $1`, [chosen]))[0].n, 0);
});

test("a visitor or seller cannot take over another shop's product id by inserting it again", async () => {
  const theirs = await save(asB, null, fields({ name: "Their product" }));
  await tx(c, asA, (k) => sql(k, `insert into items (id, business_id, name, visible) values ($1, $2, 'Mine', false)`, [theirs, ids.bizA]), { commit: true });
  const rows = await sql(c, `select id, business_id from items where name in ('Their product', 'Mine') order by name`);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows.find((r) => r.id === theirs).business_id, ids.bizB);
});

test("a product's id can never be changed", async () => {
  const id = await save(asA, null, fields());
  await rejects(c, null, `update items set id = '30000000-0000-0000-0000-000000000002' where id = $1`, [id], /item_id_immutable/);
  await rejects(c, asA, `update items set id = gen_random_uuid() where id = $1`, [id], /item_id_immutable|permission|row-level/);
  assert.equal((await sql(c, `select count(*)::int as n from items where id = $1`, [id]))[0].n, 1);
});

test("editing a product keeps its id", async () => {
  const id = await save(asA, null, fields());
  assert.equal(await save(asA, id, fields({ name: "Renamed", price: 1500 })), id);
  assert.equal((await sql(c, `select count(*)::int as n from items where business_id = $1`, [ids.bizA]))[0].n, 1);
});
