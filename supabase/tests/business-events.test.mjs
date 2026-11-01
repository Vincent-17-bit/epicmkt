import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
const ITEM = "20000000-0000-0000-0000-0000000000a1";

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `update businesses set paid_until = now() + interval '30 days'`);
  await sql(c, `insert into items (id, business_id, name) values ('${ITEM}', '${ids.bizA}', 'Fade cut')`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from business_events; delete from business_event_daily; delete from item_history`);
});

const log = async (ip, type, { biz = ids.bizA, item = null, role = "anon" } = {}) => {
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(ip ? { "cf-connecting-ip": ip } : {})]);
    await c.query(`select log_business_event($1, $2, $3)`, [biz, type, item]);
  } finally {
    await c.query("commit");
  }
};
const daily = async () => sql(c, `select type, item_id, sum(n)::int as n from business_event_daily group by 1, 2 order by 1, 2`);
const rawCount = async () => Number((await sql(c, `select count(*) as n from business_events`))[0].n);

test("one client repeating a tap in the same hour counts once", async () => {
  for (let i = 0; i < 10; i += 1) await log("1.1.1.1", "call");
  assert.equal(await rawCount(), 1);
  assert.deepEqual(await daily(), [{ type: "call", item_id: null, n: 1 }]);
});

test("different clients and different types each count, and rollup equals raw", async () => {
  await log("1.1.1.1", "view");
  await log("2.2.2.2", "view");
  await log("1.1.1.1", "whatsapp");
  await log("1.1.1.1", "directions", { item: ITEM });
  assert.equal(await rawCount(), 4);
  const rows = await daily();
  assert.equal(rows.reduce((s, r) => s + r.n, 0), 4);
  assert.equal(rows.find((r) => r.type === "view").n, 2);
});

test("no IP header, bad type, unknown business, foreign item and non-live business are ignored", async () => {
  await log(null, "view");
  await log("1.1.1.1", "nonsense");
  await log("1.1.1.1", "view", { biz: "10000000-0000-0000-0000-0000000000ff" });
  await sql(c, `insert into items (id, business_id, name) values ('20000000-0000-0000-0000-0000000000b1', '${ids.bizB}', 'B item')`);
  await log("1.1.1.1", "view", { item: "20000000-0000-0000-0000-0000000000b1" });
  await sql(c, `update businesses set status = 'paused' where id = '${ids.bizB}'`);
  await log("1.1.1.1", "view", { biz: ids.bizB });
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizB}'`);
  assert.equal(await rawCount(), 0);
  assert.deepEqual(await daily(), []);
});

test("no raw IP is stored anywhere", async () => {
  await log("203.0.113.77", "view");
  const dump = JSON.stringify(await sql(c, `select * from business_events`)) + JSON.stringify(await sql(c, `select * from business_event_daily`));
  assert.ok(!dump.includes("203.0.113.77"));
});

test("a client is rate limited per minute", async () => {
  for (let i = 0; i < 70; i += 1) await log("9.9.9.9", "view", { item: i % 2 ? ITEM : null });
  assert.ok((await rawCount()) <= 2);   // dedupe already holds it to two distinct (item, type) rows
  for (const type of ["view", "call", "whatsapp", "directions"]) await log("9.9.9.9", type);
  assert.ok((await rawCount()) <= 8);
});

test("the tables are closed to anon and sellers; only the RPCs are open", async () => {
  for (const t of ["business_events", "business_event_daily"]) {
    await rejects(c, { role: "anon" }, `select * from ${t}`, [], /permission denied/);
    await rejects(c, asA, `select * from ${t}`, [], /permission denied/);
  }
  await rejects(c, { role: "anon" }, `select seller_performance('7d')`, [], /permission denied/);
});

test("seller_performance totals, ranges, gap fill and isolation", async () => {
  const today = (await sql(c, `select (now() at time zone 'Africa/Nairobi')::date::text as d`))[0].d;
  await sql(c, `insert into business_event_daily (business_id, day, type, item_id, n) values
    ('${ids.bizA}', (now() at time zone 'Africa/Nairobi')::date, 'view', null, 4),
    ('${ids.bizA}', (now() at time zone 'Africa/Nairobi')::date, 'whatsapp', null, 2),
    ('${ids.bizA}', (now() at time zone 'Africa/Nairobi')::date - 20, 'call', null, 3),
    ('${ids.bizA}', (now() at time zone 'Africa/Nairobi')::date - 200, 'directions', null, 5),
    ('${ids.bizA}', (now() at time zone 'Africa/Nairobi')::date - 800, 'view', null, 7),
    ('${ids.bizB}', (now() at time zone 'Africa/Nairobi')::date, 'view', null, 99)
    on conflict do nothing`);
  const get = (range, who = asA, item = null) => tx(c, who, async (k) => (await sql(k, `select seller_performance($1, $2) as p`, [range, item]))[0].p);

  const w = await get("7d");
  assert.equal(w.grain, "day");
  assert.equal(w.series.length, 7);
  assert.equal(w.totals.view, 4);
  assert.equal(w.totals.whatsapp, 2);
  assert.equal(w.totals.call, 0);

  const m = await get("1m");
  assert.equal(m.totals.call, 3);
  const six = await get("6m");
  assert.equal(six.totals.directions, 0);
  const yr = await get("12m");
  assert.equal(yr.totals.directions, 5);
  assert.equal(yr.totals.view, 4);
  const three = await get("36m");
  assert.equal(three.totals.view, 11);
  assert.equal(three.grain, "month");
  const all = await get("all");
  assert.equal(all.totals.view, 11);
  assert.equal(all.to, today);

  assert.equal((await get("7d", asB)).totals.view, 99);
  await rejects(c, asA, `select seller_performance('forever')`, [], /invalid_range/);
  await rejects(c, { role: "authenticated" }, `select seller_performance('7d')`, [], /not_a_seller/);
});

test("seller_performance with no data returns zeros and a gap-filled series", async () => {
  const p = await tx(c, asA, async (k) => (await sql(k, `select seller_performance('all') as p`))[0].p);
  assert.deepEqual(p.totals, { view: 0, whatsapp: 0, call: 0, directions: 0 });
  assert.equal(p.series.length, 1);
});

const addHistory = async (n) => {
  for (let i = 0; i < n; i += 1) {
    await sql(c, `insert into item_history (item_id, business_id, field, old_value, new_value, actor_role, created_at)
      values ('${ITEM}', '${ids.bizA}', 'price', '${i}', '${i + 1}', 'seller', now() - interval '${n - i} minutes')`);
  }
};

test("History: standard sees the newest 5 and is told the rest is locked", async () => {
  await addHistory(8);
  const h = await tx(c, asA, async (k) => (await sql(k, `select seller_item_history($1) as h`, [ITEM]))[0].h);
  assert.equal(h.limit, 5);
  assert.equal(h.total, 8);
  assert.equal(h.locked, true);
  assert.equal(h.entries.length, 5);
  assert.equal(h.entries[0].new_value, "8");
});

test("History: standard with 5 or fewer entries is not locked", async () => {
  await addHistory(5);
  const h = await tx(c, asA, async (k) => (await sql(k, `select seller_item_history($1) as h`, [ITEM]))[0].h);
  assert.equal(h.locked, false);
  assert.equal(h.entries.length, 5);
});

test("History: premium sees everything; a global_limits override is honoured; other shops' items are refused", async () => {
  const B_ITEM = "20000000-0000-0000-0000-0000000000b2";
  await sql(c, `insert into items (id, business_id, name) values ('${B_ITEM}', '${ids.bizB}', 'B thing')`);
  for (let i = 0; i < 9; i += 1) {
    await sql(c, `insert into item_history (item_id, business_id, field, new_value, actor_role) values ('${B_ITEM}', '${ids.bizB}', 'price', '${i}', 'seller')`);
  }
  const all = await tx(c, asB, async (k) => (await sql(k, `select seller_item_history($1) as h`, [B_ITEM]))[0].h);
  assert.equal(all.limit, null);
  assert.equal(all.entries.length, 9);
  assert.equal(all.locked, false);

  const before = (await sql(c, `select standard from global_limits where id = 1`))[0].standard;
  await sql(c, `update global_limits set standard = standard || '{"historyEntries": 2}'::jsonb where id = 1`);
  await addHistory(6);
  const tight = await tx(c, asA, async (k) => (await sql(k, `select seller_item_history($1) as h`, [ITEM]))[0].h);
  assert.equal(tight.entries.length, 2);
  await sql(c, `update global_limits set standard = $1::jsonb where id = 1`, [JSON.stringify(before)]);

  await rejects(c, asA, `select seller_item_history($1)`, [B_ITEM], /item_not_found/);
  await rejects(c, { role: "anon" }, `select seller_item_history($1)`, [ITEM], /permission denied/);
});

test("Deals: premium sees per-deal numbers, standard gets a locked answer with none, an override can open it", async () => {
  const B_ITEM = "20000000-0000-0000-0000-0000000000b3";
  await sql(c, `insert into items (id, business_id, name, price, price_type, availability, visible) values ('${B_ITEM}', '${ids.bizB}', 'Promo thing', 1000, 'fixed', 'available', true)`);
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value)
    values ('${ids.bizB}', '${B_ITEM}', now() - interval '3 hours', now() + interval '2 hours', 'percent', 20)`);
  await sql(c, `insert into business_event_daily (business_id, day, type, item_id, n) values
    ('${ids.bizB}', (now() at time zone 'Africa/Nairobi')::date, 'view', '${B_ITEM}', 6),
    ('${ids.bizB}', (now() at time zone 'Africa/Nairobi')::date, 'whatsapp', '${B_ITEM}', 2),
    ('${ids.bizB}', (now() at time zone 'Africa/Nairobi')::date - 30, 'view', '${B_ITEM}', 50)`);
  const prem = await tx(c, asB, async (k) => (await sql(k, `select seller_item_deals($1) as d`, [B_ITEM]))[0].d);
  assert.equal(prem.locked, false);
  assert.equal(prem.flash.length, 1);
  assert.equal(prem.flash[0].view, 6);
  assert.equal(prem.flash[0].whatsapp, 2);

  const std = await tx(c, asA, async (k) => (await sql(k, `select seller_item_deals($1) as d`, [ITEM]))[0].d);
  assert.deepEqual(std, { locked: true, flash: [], offers: [] });

  await sql(c, `update global_limits set standard = standard || '{"flashAttribution": true}'::jsonb where id = 1`);
  const open = await tx(c, asA, async (k) => (await sql(k, `select seller_item_deals($1) as d`, [ITEM]))[0].d);
  assert.equal(open.locked, false);
  await sql(c, `update global_limits set standard = standard - 'flashAttribution' where id = 1`);

  await rejects(c, asA, `select seller_item_deals($1)`, [B_ITEM], /item_not_found/);
});
