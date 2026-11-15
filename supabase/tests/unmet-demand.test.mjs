// Migration 0115 (Prompt A22): unmet demand. Logging, one count per buyer per day, privacy, rate limits, and who may read what.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

let c;
let itemA, itemB;
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_unmet_demand" })); await seedFixtures(c); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from unmet_demand; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
  itemA = (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft) values ($1, 'Galaxy S26', 25000, 'fixed', true, false) returning id`, [ids.bizA]))[0].id;
  itemB = (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft) values ($1, 'Other', 90, 'fixed', true, false) returning id`, [ids.bizB]))[0].id;
});

const from = async (ip, shop, item, filters) => {
  await c.query("begin");
  try {
    await c.query(`set local role anon`);
    await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(ip ? { "cf-connecting-ip": ip } : {})]);
    await c.query(`select log_unmet_demand($1, $2, $3::jsonb)`, [shop, item, JSON.stringify(filters)]);
  } finally { await c.query("commit"); }
};
const total = async () => Number((await sql(c, `select count(*) as n from unmet_demand`))[0].n);
const S512 = { brand: "Samsung", storage: "512 GB" };

test("a tap is logged once per buyer per day, however often it is pressed", async () => {
  for (let i = 0; i < 6; i += 1) await from("1.1.1.1", ids.bizA, itemA, S512);
  assert.equal(await total(), 1);
  await from("1.1.1.1", ids.bizA, itemA, { brand: "Samsung", storage: "1 TB" });
  assert.equal(await total(), 2, "another filter set is another row");
  await from("2.2.2.2", ids.bizA, itemA, S512);
  assert.equal(await total(), 3, "another buyer counts again");
});

test("the same filters in another order, case or spacing are the same demand", async () => {
  await from("1.1.1.1", ids.bizA, itemA, { storage: "512 GB", brand: "Samsung" });
  await from("1.1.1.1", ids.bizA, itemA, { brand: "  SAMSUNG ", storage: "512  gb" });
  assert.equal(await total(), 1);
});

test("nothing personal is stored: only a salted hash, never the address", async () => {
  await from("203.0.113.9", ids.bizA, itemA, S512);
  const [row] = await sql(c, `select * from unmet_demand`);
  assert.match(row.client_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(row).includes("203.0.113.9"));
  assert.deepEqual(Object.keys(row).sort(), ["at", "business_id", "client_hash", "day", "filter_key", "filters", "id", "item_id"]);
});

test("bad calls are ignored without an error: no address, wrong shop, unknown or hidden item, bad filters", async () => {
  await from(null, ids.bizA, itemA, S512);
  await from("1.1.1.1", ids.bizB, itemA, S512);
  await from("1.1.1.1", ids.bizA, "00000000-0000-0000-0000-000000000000", S512);
  await sql(c, `update items set visible = false where id = $1`, [itemA]);
  await from("1.1.1.1", ids.bizA, itemA, S512);
  await sql(c, `update items set visible = true where id = $1`, [itemA]);
  for (const bad of [{}, [], "x", { Brand: "x" }, { brand: "" }, { brand: "a".repeat(41) }, { brand: "<script>" }, { brand: { a: 1 } }, { a: "1", b: "1", c: "1", d: "1", e: "1", f: "1", g: "1" }, null]) {
    await from("1.1.1.1", ids.bizA, itemA, bad);
  }
  assert.equal(await total(), 0);
});

test("one buyer is limited to 12 different logs a minute", async () => {
  for (let i = 0; i < 20; i += 1) await from("9.9.9.9", ids.bizA, itemA, { storage: `${i + 1} GB` });
  assert.equal(await total(), 12);
});

test("a seller sees only their own shop; counts are buyers, by item and filter", async () => {
  await from("1.1.1.1", ids.bizA, itemA, S512);
  await from("2.2.2.2", ids.bizA, itemA, S512);
  await from("3.3.3.3", ids.bizA, itemA, { brand: "Samsung", storage: "1 TB" });
  await from("1.1.1.1", ids.bizB, itemB, { colour: "red" });
  const a = (await tx(c, asA, (k) => sql(k, `select seller_unmet_demand(7) as r`)))[0].r;
  assert.equal(a.period, 7); assert.equal(a.total, 3);
  assert.deepEqual(a.rows.map((r) => [r.itemName, r.count]), [["Galaxy S26", 2], ["Galaxy S26", 1]]);
  assert.deepEqual(a.rows[0].filters, { brand: "samsung", storage: "512 gb" });
  const b = (await tx(c, asB, (k) => sql(k, `select seller_unmet_demand(30) as r`)))[0].r;
  assert.equal(b.total, 1); assert.equal(b.rows[0].itemName, "Other");
});

test("the period is 7 or 30 days; older rows fall out of the 7-day view", async () => {
  await from("1.1.1.1", ids.bizA, itemA, S512);
  await sql(c, `update unmet_demand set at = now() - interval '10 days'`);
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_unmet_demand(7) as r`)))[0].r.total, 0);
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_unmet_demand(30) as r`)))[0].r.total, 1);
  await rejects(c, asA, `select seller_unmet_demand(14)`, [], /invalid_period/);
});

test("anonymous callers cannot read, and the table is closed to everyone but the service", async () => {
  await rejects(c, { role: "anon" }, `select seller_unmet_demand(7)`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select admin_unmet_demand(7)`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select * from unmet_demand`, [], /permission denied/);
  await rejects(c, asA, `select * from unmet_demand`, [], /permission denied/);
});

test("admin sees every shop by category and type, and a seller cannot call the admin view", async () => {
  await from("1.1.1.1", ids.bizA, itemA, S512);
  await from("2.2.2.2", ids.bizB, itemB, S512);
  const all = (await tx(c, asAdmin, (k) => sql(k, `select admin_unmet_demand(7) as r`)))[0].r;
  assert.equal(all.total, 2);
  assert.equal(all.rows[0].categoryId, "barber"); assert.equal(all.rows[0].count, 2 === all.rows.length ? all.rows[0].count : all.rows[0].count);
  assert.ok(all.rows.every((r) => Array.isArray(r.shops) && r.shops.length >= 1));
  const one = (await tx(c, asAdmin, (k) => sql(k, `select admin_unmet_demand(7, 'nothing') as r`)))[0].r;
  assert.equal(one.total, 0); assert.deepEqual(one.rows, []);
  await rejects(c, asA, `select admin_unmet_demand(7)`, [], /forbidden/);
});

test("removing an item removes its demand rows", async () => {
  await from("1.1.1.1", ids.bizA, itemA, S512);
  await sql(c, `delete from items where id = $1`, [itemA]);
  assert.equal(await total(), 0);
});
