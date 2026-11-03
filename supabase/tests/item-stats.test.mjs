import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(c, `delete from item_events; delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const item = async (biz, extra = {}) => {
  const f = { name: "Fade cut", price: 1000, price_type: "fixed", availability: "available", visible: true, draft: false, ...extra };
  const keys = Object.keys(f);
  const r = await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [biz, ...Object.values(f)]);
  return r[0].id;
};

const log = async (ip, itemId, kind) => {
  await c.query("begin");
  try {
    await c.query(`set local role anon`);
    await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(ip ? { "cf-connecting-ip": ip } : {})]);
    await c.query(`select log_item_event($1::uuid, $2)`, [itemId, kind]);
  } finally {
    await c.query("commit");
  }
};
const events = () => sql(c, `select kind, count(*)::int as n from item_events group by kind order by kind`);
const stats = (who, id, days) => tx(c, who, (k) => sql(k, `select seller_item_stats($1::uuid, $2::int) as s`, [id, days])).then((r) => r[0].s);

test("a visitor's view, WhatsApp tap and call tap are each counted once a day", async () => {
  const id = await item(ids.bizA);
  for (const kind of ["view", "view", "whatsapp", "whatsapp", "call"]) await log("1.1.1.1", id, kind);
  assert.deepEqual(await events(), [{ kind: "call", n: 1 }, { kind: "view", n: 1 }, { kind: "whatsapp", n: 1 }]);
});

test("different visitors add up", async () => {
  const id = await item(ids.bizA);
  await log("1.1.1.1", id, "view");
  await log("2.2.2.2", id, "view");
  assert.deepEqual(await events(), [{ kind: "view", n: 2 }]);
});

test("nothing is stored without an address, for a bad kind, or for an item customers cannot see", async () => {
  const id = await item(ids.bizA);
  await log(null, id, "view");
  await log("1.1.1.1", id, "share");
  await log("1.1.1.1", "00000000-0000-0000-0000-000000000000", "view");
  const hidden = await item(ids.bizA, { visible: false });
  const draft = await item(ids.bizA, { draft: true });
  const out = await item(ids.bizA, { availability: "out_of_stock" });
  for (const x of [hidden, draft, out]) await log("1.1.1.1", x, "view");
  assert.deepEqual(await events(), []);
});

test("the address itself is never stored", async () => {
  const id = await item(ids.bizA);
  await log("9.9.9.9", id, "view");
  const [row] = await sql(c, `select * from item_events`);
  assert.ok(!JSON.stringify(row).includes("9.9.9.9"));
  assert.match(row.client_hash, /^[0-9a-f]{64}$/);
});

test("a visitor past the per-minute limit is dropped", async () => {
  const id = await item(ids.bizA);
  await log("3.3.3.3", id, "view");
  const [{ client_hash: hash }] = await sql(c, `select client_hash from item_events`);
  await sql(c, `insert into item_events (business_id, item_id, kind, client_hash, day) select $1, $2, 'call', $3, current_date - g from generate_series(1, 60) g`, [ids.bizA, id, hash]);
  await log("3.3.3.3", id, "whatsapp");
  assert.equal((await sql(c, `select count(*)::int as n from item_events where kind = 'whatsapp'`))[0].n, 0);
});

test("browser roles cannot read or write the events table", async () => {
  await rejects(c, { role: "anon" }, `select * from item_events`, [], /permission denied/);
  await rejects(c, asA, `select * from item_events`, [], /permission denied/);
  await rejects(c, asA, `insert into item_events (business_id, item_id, kind, client_hash, day) values ($1, $1, 'view', 'x', current_date)`, [ids.bizA], /permission denied/);
});

test("a seller sees totals, the previous period and one row per day", async () => {
  const id = await item(ids.bizA);
  await sql(c, `insert into item_events (business_id, item_id, kind, client_hash, day) values
    ($1, $2, 'view', 'a', (now() at time zone 'Africa/Nairobi')::date),
    ($1, $2, 'view', 'b', (now() at time zone 'Africa/Nairobi')::date),
    ($1, $2, 'whatsapp', 'a', (now() at time zone 'Africa/Nairobi')::date - 2),
    ($1, $2, 'call', 'c', (now() at time zone 'Africa/Nairobi')::date - 3),
    ($1, $2, 'view', 'd', (now() at time zone 'Africa/Nairobi')::date - 10),
    ($1, $2, 'view', 'e', (now() at time zone 'Africa/Nairobi')::date - 40)`, [ids.bizA, id]);
  const s7 = await stats(asA, id, 7);
  assert.equal(s7.days, 7);
  assert.deepEqual(s7.totals, { views: 2, whatsapp: 1, call: 1 });
  assert.deepEqual(s7.previous, { views: 1, whatsapp: 0, call: 0 });
  assert.equal(s7.daily.length, 7);
  assert.equal(s7.daily.at(-1).views, 2);
  const s30 = await stats(asA, id, 30);
  assert.deepEqual(s30.totals, { views: 3, whatsapp: 1, call: 1 });
  assert.deepEqual(s30.previous, { views: 1, whatsapp: 0, call: 0 });
  assert.equal(s30.daily.length, 30);
});

test("a suspended seller cannot read stats", async () => {
  const id = await item(ids.bizA);
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  await rejects(c, asA, `select seller_item_stats($1::uuid, 7)`, [id], /account_suspended/);
});

test("an item with no events reports zeros for every day", async () => {
  const id = await item(ids.bizA);
  const s = await stats(asA, id, 7);
  assert.deepEqual(s.totals, { views: 0, whatsapp: 0, call: 0 });
  assert.ok(s.daily.every((d) => d.views === 0 && d.whatsapp === 0 && d.call === 0));
});

test("only the owner can read an item's stats, and only for 7, 30 or 90 days", async () => {
  const id = await item(ids.bizA);
  await rejects(c, asB, `select seller_item_stats($1::uuid, 7)`, [id], /item_not_found/);
  await rejects(c, asA, `select seller_item_stats($1::uuid, 12)`, [id], /invalid_days/);
  await rejects(c, { role: "anon" }, `select seller_item_stats($1::uuid, 7)`, [id], /permission denied/);
});

test("deleting an item deletes its events", async () => {
  const id = await item(ids.bizA);
  await log("1.1.1.1", id, "view");
  await sql(c, `delete from items where id = $1`, [id]);
  assert.deepEqual(await events(), []);
});
