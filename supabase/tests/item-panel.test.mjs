import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

let c;
const anon = { role: "anon" };

before(async () => {
  const url = await createDatabase({ database: "epicmkt_item_panel" });
  c = await connect(url);
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 600 where category_id = 'barber'`);
  await sql(c, `update businesses set paid_until = now() + interval '20 days'`);
});
after(async () => { await c.end(); });

const item = async (biz, name, extra = {}) => {
  const cols = { business_id: biz, name, price: 100, ...extra };
  const keys = Object.keys(cols);
  const rows = await sql(c, `insert into items (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(cols));
  return rows[0].id;
};
const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const visit = (ip, itemId, kind, flash = false, offer = false) =>
  tx(c, anon, async (k) => {
    await k.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ "x-real-ip": ip })]);
    await k.query(`select log_item_event($1, $2, $3, $4)`, [itemId, kind, flash, offer]);
  }, { commit: true });
const count = (itemId) => sql(c, `select kind, count(*)::int as n from item_events where item_id = $1 group by kind order by kind`, [itemId]);

test("a visit is logged once per hour per visitor, taps every time", async () => {
  const a = await item(ids.bizA, "Alpha");
  await visit("10.0.0.1", a, "view");
  await visit("10.0.0.1", a, "view");
  await visit("10.0.0.2", a, "view", true);
  await visit("10.0.0.1", a, "whatsapp", true);
  await visit("10.0.0.1", a, "call");
  assert.deepEqual(await count(a), [{ kind: "call", n: 1 }, { kind: "view", n: 2 }, { kind: "whatsapp", n: 1 }]);
});

test("nothing is logged for drafts, hidden items, unknown kinds or a missing address", async () => {
  const draft = await item(ids.bizA, "Draft", { draft: true });
  const hidden = await item(ids.bizA, "Hidden", { visible: false });
  const live = await item(ids.bizA, "Live");
  await visit("10.0.1.1", draft, "view");
  await visit("10.0.1.1", hidden, "view");
  await visit("10.0.1.1", live, "share");
  await tx(c, anon, async (k) => { await k.query(`select log_item_event($1, 'view')`, [live]); }, { commit: true });
  assert.deepEqual(await count(draft), []);
  assert.deepEqual(await count(hidden), []);
  assert.deepEqual(await count(live), []);
});

test("nothing is logged while the shop is not live", async () => {
  const a = await item(ids.bizB, "Bravo");
  await sql(c, `update businesses set status = 'paused' where id = $1`, [ids.bizB]);
  await visit("10.0.2.1", a, "view");
  await sql(c, `update businesses set status = 'live' where id = $1`, [ids.bizB]);
  assert.deepEqual(await count(a), []);
});

test("one visitor is limited to 30 events a minute", async () => {
  const a = await item(ids.bizA, "Busy");
  for (let i = 0; i < 35; i++) await visit("10.0.3.1", a, "call");
  assert.equal((await count(a))[0].n, 30);
});

test("events are private: anon cannot read, a seller only sees their own shop", async () => {
  const a = await item(ids.bizA, "Mine");
  const b = await item(ids.bizB, "Theirs");
  await visit("10.0.4.1", a, "view");
  await visit("10.0.4.1", b, "view");
  await rejects(c, anon, `select * from item_events`, [], /permission denied/);
  const seenByA = await as(asA, `select item_id from item_events where item_id in ($1, $2)`, [a, b]);
  assert.deepEqual(seenByA.map((r) => r.item_id), [a]);
  const seenByB = await as(asB, `select item_id from item_events where item_id in ($1, $2)`, [a, b]);
  assert.deepEqual(seenByB.map((r) => r.item_id), [b]);
  await rejects(c, asA, `insert into item_events (business_id, item_id, kind, client_hash, bucket) values ($1, $2, 'view', 'x', 1)`, [ids.bizA, a], /permission denied/);
});

test("stats add up, fill empty days and refuse another shop's item", async () => {
  const a = await item(ids.bizA, "Counted");
  await visit("10.0.5.1", a, "view", true, false);
  await visit("10.0.5.2", a, "view", false, true);
  await visit("10.0.5.3", a, "view");
  await visit("10.0.5.1", a, "whatsapp", true, false);
  await visit("10.0.5.2", a, "call", false, true);
  await sql(c, `update item_events set at = now() - interval '10 days' where item_id = $1 and client_hash in (select client_hash from item_events where item_id = $1 order by id limit 1)`, [a]);
  const r30 = (await as(asA, `select seller_item_stats($1, 30) as r`, [a]))[0].r;
  assert.equal(r30.days, 30);
  assert.equal(r30.views, 3);
  assert.equal(r30.whatsapp, 1);
  assert.equal(r30.calls, 1);
  assert.equal(r30.flash_views, 1);
  assert.equal(r30.flash_taps, 1);
  assert.equal(r30.offer_views, 1);
  assert.equal(r30.offer_taps, 1);
  assert.equal(r30.series.length, 30);
  assert.equal(r30.series.reduce((n, d) => n + d.views, 0), 3);
  const r7 = (await as(asA, `select seller_item_stats($1, 7) as r`, [a]))[0].r;
  assert.equal(r7.series.length, 7);
  assert.ok(r7.views < r30.views);
  const odd = (await as(asA, `select seller_item_stats($1, 11) as r`, [a]))[0].r;
  assert.equal(odd.days, 30);
  const other = await item(ids.bizB, "Not yours");
  await rejects(c, asA, `select seller_item_stats($1, 30)`, [other], /not_found/);
  await rejects(c, anon, `select seller_item_stats($1, 30)`, [a], /permission denied/);
});

test("an item with no visits reports zeros", async () => {
  const a = await item(ids.bizA, "Quiet");
  const r = (await as(asA, `select seller_item_stats($1, 7) as r`, [a]))[0].r;
  assert.equal(r.views, 0);
  assert.equal(r.series.length, 7);
});

test("history records price, stock and status with who changed it", async () => {
  const a = await item(ids.bizA, "Tracked", { track_stock: true, stock_count: 5 });
  await as(asA, `update items set price = 150 where id = $1`, [a]);
  await as(asA, `update items set stock_count = 2 where id = $1`, [a]);
  await as(asA, `update items set visible = false where id = $1`, [a]);
  await as(asAdmin, `update items set hidden_by_admin = true where id = $1`, [a]);
  await sql(c, `update items set draft = true where id = $1`, [a]);
  const rows = await sql(c, `select field, old_value, new_value, actor_role as actor from item_history where item_id = $1 order by id`, [a]);
  assert.deepEqual(rows, [
    { field: "price", old_value: "100.00", new_value: "150.00", actor: "seller" },
    { field: "availability", old_value: "available", new_value: "limited_stock", actor: "seller" },
    { field: "stock_count", old_value: "5", new_value: "2", actor: "seller" },
    { field: "visible", old_value: "true", new_value: "false", actor: "seller" },
    { field: "hidden_by_admin", old_value: "false", new_value: "true", actor: "admin" },
    { field: "draft", old_value: "false", new_value: "true", actor: "system" },
  ]);
});

test("the seller's history leaves out edits to text fields", async () => {
  const a = await item(ids.bizA, "Quiet edit");
  await as(asA, `update items set name = 'Quiet edit two', description = 'More' where id = $1`, [a]);
  assert.deepEqual((await as(asA, `select seller_item_history($1) as r`, [a]))[0].r, []);
});

test("history is returned newest first, limited, and private", async () => {
  const a = await item(ids.bizA, "Timeline");
  for (const p of [110, 120, 130]) await as(asA, `update items set price = $2 where id = $1`, [a, p]);
  const all = (await as(asA, `select seller_item_history($1) as r`, [a]))[0].r;
  assert.deepEqual(all.map((h) => h.new_value), ["130.00", "120.00", "110.00"]);
  assert.equal(all[0].actor, "seller");
  assert.equal(all[0].field, "price");
  const one = (await as(asA, `select seller_item_history($1, 1) as r`, [a]))[0].r;
  assert.equal(one.length, 1);
  await rejects(c, asB, `select seller_item_history($1)`, [a], /not_found/);
  assert.deepEqual(await as(asB, `select * from item_history where item_id = $1`, [a]), []);
  await rejects(c, anon, `select seller_item_history($1)`, [a], /permission denied/);
  await rejects(c, asA, `insert into item_history (business_id, item_id, field, actor_role) values ($1, $2, 'price', 'seller')`, [ids.bizA, a], /permission denied/);
});

test("deleting an item removes its events and history", async () => {
  const a = await item(ids.bizA, "Gone");
  await visit("10.0.6.1", a, "view");
  await as(asA, `update items set price = 999 where id = $1`, [a]);
  await sql(c, `delete from items where id = $1`, [a]);
  assert.deepEqual(await sql(c, `select 1 from item_events where item_id = $1`, [a]), []);
  assert.deepEqual(await sql(c, `select 1 from item_history where item_id = $1`, [a]), []);
});

test("a suspended seller can read neither stats nor history", async () => {
  const a = await item(ids.bizA, "Frozen");
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  try {
    await rejects(c, asA, `select seller_item_stats($1, 30)`, [a], /account_suspended/);
    await rejects(c, asA, `select seller_item_history($1)`, [a], /account_suspended/);
  } finally {
    await sql(c, `update businesses set status = 'live' where id = $1`, [ids.bizA]);
  }
});
