import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  const url = await createDatabase();
  c = await connect(url);
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const seedB = async () => {
  await sql(c, `delete from items where business_id = '${ids.bizB}'`);
  const rows = await sql(c, `insert into items (business_id, name, price, price_max, sale_price, price_type, sort, section) values
    ('${ids.bizB}', 'Alpha', 100, null, null, 'fixed', 1, 'Cuts'),
    ('${ids.bizB}', 'Bravo', 15, null, null, 'fixed', 2, 'Cuts'),
    ('${ids.bizB}', 'Charlie', 200, 400, null, 'range', 3, 'Packs'),
    ('${ids.bizB}', 'Delta', 1000, null, 800, 'fixed', 4, null),
    ('${ids.bizB}', 'Echo', null, null, null, 'free', 5, null) returning id, name`);
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
};

const bulk = (who, action, idList, args = {}) => tx(c, who, async (k) => (await sql(k, `select seller_bulk_items($1, $2::uuid[], $3::jsonb) as r`, [action, idList, JSON.stringify(args)]))[0].r, { commit: true });
const row = async (id) => (await sql(c, `select * from items where id = $1`, [id]))[0];

test("stats cover every tracker tile and match the rows", async () => {
  const it = await seedB();
  await sql(c, `update items set availability = 'seasonal' where id = '${it.Alpha}'`);
  await sql(c, `update items set availability = 'by_appointment' where id = '${it.Bravo}'`);
  await sql(c, `update items set availability = 'coming_soon', visible = false where id = '${it.Charlie}'`);
  await sql(c, `update items set visible = false, draft = true where id = '${it.Delta}'`);
  await sql(c, `update items set hidden_by_admin = true, admin_hide_reason = 'Misleading' where id = '${it.Echo}'`);
  await sql(c, `insert into flags (business_id, item_id, reason) values ('${ids.bizB}', '${it.Alpha}', 'check this one')`);
  await sql(c, `insert into reports (business_id, item_id, reason) values ('${ids.bizB}', '${it.Bravo}', 'spam')`);
  const s = (await tx(c, asB, (k) => sql(k, `select seller_catalog_stats(90) as s`)))[0].s;
  assert.deepEqual(
    [s.total, s.available, s.seasonal, s.by_appointment, s.coming_soon, s.hidden_by_me, s.hidden_by_admin, s.drafts, s.visible, s.reported, s.flagged],
    [5, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1]
  );
  assert.equal(s.hidden_by_me + s.hidden_by_admin + s.drafts + s.visible, s.total);
  await sql(c, `update items set track_stock = true, stock_count = 2, low_stock_threshold = 3 where id = '${it.Alpha}'`);
  const low = (await tx(c, asB, (k) => sql(k, `select seller_catalog_stats(90) as s`)))[0].s;
  assert.equal(low.low_stock, 1);
});

test("bulk hide, show, section, availability and confirm change only own, seller controlled items", async () => {
  const it = await seedB();
  await sql(c, `update items set hidden_by_admin = true where id = '${it.Echo}'`);
  const all = Object.values(it);
  const hid = await bulk(asB, "hide", all);
  assert.deepEqual([hid.changed, hid.skipped], [4, 1]);
  assert.equal((await row(it.Alpha)).visible, false);
  assert.equal((await row(it.Echo)).visible, true);
  await sql(c, `update items set draft = true where id = '${it.Alpha}'`);
  await bulk(asB, "show", [it.Alpha]);
  assert.deepEqual([(await row(it.Alpha)).visible, (await row(it.Alpha)).draft], [true, false]);
  await bulk(asB, "move_section", [it.Alpha, it.Bravo], { section: "  New   section " });
  assert.equal((await row(it.Bravo)).section, "New section");
  await bulk(asB, "move_section", [it.Alpha], { section: "" });
  assert.equal((await row(it.Alpha)).section, null);
  await bulk(asB, "set_availability", [it.Alpha], { availability: "seasonal" });
  assert.equal((await row(it.Alpha)).availability, "seasonal");
  await sql(c, `update items set price_confirmed_at = now() - interval '200 days' where id = '${it.Alpha}'`);
  await bulk(asB, "confirm_prices", [it.Alpha]);
  assert.ok(Date.now() - new Date((await row(it.Alpha)).price_confirmed_at).getTime() < 60000);
});

test("bulk rejects bad input and other sellers items atomically", async () => {
  const it = await seedB();
  const [other] = await sql(c, `insert into items (business_id, name, price) values ('${ids.bizA}', 'A only', 50) returning id`);
  await rejects(c, asB, `select seller_bulk_items('hide', $1::uuid[], '{}')`, [[it.Alpha, other.id]], /item_not_found/);
  assert.equal((await row(it.Alpha)).visible, true);
  await rejects(c, asB, `select seller_bulk_items('explode', $1::uuid[], '{}')`, [[it.Alpha]], /invalid_action/);
  await rejects(c, asB, `select seller_bulk_items('hide', '{}'::uuid[], '{}')`, [], /invalid_selection/);
  await rejects(c, asB, `select seller_bulk_items('set_availability', $1::uuid[], '{"availability":"nope"}')`, [[it.Alpha]], /invalid_availability/);
  await rejects(c, asB, `select seller_bulk_items('move_section', $1::uuid[], '{"section":"=cmd"}')`, [[it.Alpha]], /invalid_section/);
  await rejects(c, { role: "anon" }, `select seller_bulk_items('hide', $1::uuid[], '{}')`, [[it.Alpha]], /permission denied/);
});

test("bulk price change returns exactly what it wrote and skips what cannot change", async () => {
  const it = await seedB();
  const res = await bulk(asB, "price_percent", Object.values(it), { percent: 10, direction: "raise" });
  const byId = Object.fromEntries(res.rows.map((r) => [r.id, r]));
  assert.deepEqual(byId[it.Alpha].after, { price: 110, priceMax: null, salePrice: null });
  assert.deepEqual(byId[it.Bravo].after, { price: 17, priceMax: null, salePrice: null });
  assert.deepEqual(byId[it.Charlie].after, { price: 220, priceMax: 440, salePrice: null });
  assert.deepEqual(byId[it.Delta].after, { price: 1100, priceMax: null, salePrice: 880 });
  assert.equal(res.changed, 4);
  assert.equal(res.skipped, 1);
  for (const r of res.rows) {
    const now = await row(r.id);
    assert.deepEqual([Number(now.price), now.price_max === null ? null : Number(now.price_max), now.sale_price === null ? null : Number(now.sale_price)], [r.after.price, r.after.priceMax, r.after.salePrice]);
  }
  const lowered = await bulk(asB, "price_percent", [it.Alpha], { percent: 50, direction: "lower" });
  assert.equal(lowered.rows[0].after.price, 55);
  const tiny = await sql(c, `insert into items (business_id, name, price) values ('${ids.bizB}', 'Tiny', 1) returning id`);
  const none = await bulk(asB, "price_percent", [tiny[0].id], { percent: 60, direction: "lower" });
  assert.deepEqual([none.changed, none.skipped], [0, 1]);
  assert.equal(Number((await row(tiny[0].id)).price), 1);
  for (const args of [{ percent: 0, direction: "raise" }, { percent: 501, direction: "raise" }, { percent: 1.234, direction: "raise" }, { percent: "x", direction: "raise" }, { percent: 5, direction: "sideways" }]) {
    await rejects(c, asB, `select seller_bulk_items('price_percent', $1::uuid[], $2::jsonb)`, [[it.Alpha], JSON.stringify(args)], /invalid_percent/);
  }
});

test("bulk delete removes only seller controlled items in one transaction", async () => {
  const it = await seedB();
  await sql(c, `update items set hidden_by_admin = true where id = '${it.Echo}'`);
  const res = await bulk(asB, "delete", Object.values(it));
  assert.deepEqual([res.changed, res.skipped], [4, 1]);
  assert.equal((await sql(c, `select id from items where business_id = '${ids.bizB}'`)).length, 1);
});

const rowsJson = (n, extra = {}) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: `Import ${i}`, price_type: "fixed", price: 100 + i, unit: "each", availability: "available", section: "Imported", search_tags: ["a", "b"], ...extra })));

test("import is Premium only, creates hidden drafts in one transaction and respects the plan limit", async () => {
  await sql(c, `delete from items where business_id in ('${ids.bizA}', '${ids.bizB}')`);
  await rejects(c, asA, `select seller_import_items($1::jsonb)`, [rowsJson(1)], /premium_only/);
  const res = await tx(c, asB, async (k) => (await sql(k, `select seller_import_items($1::jsonb) as r`, [rowsJson(4)]))[0].r, { commit: true });
  assert.equal(res.imported, 4);
  const items = await sql(c, `select * from items where business_id = '${ids.bizB}' order by sort`);
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.draft && !i.visible));
  assert.deepEqual(items.map((i) => i.sort), [1, 2, 3, 4]);
  assert.deepEqual(items[0].search_tags, ["a", "b"]);
  await rejects(c, asB, `select seller_import_items($1::jsonb)`, [rowsJson(3)], /limit_reached/);
  assert.equal((await sql(c, `select id from items where business_id = '${ids.bizB}'`)).length, 4);
  const two = await tx(c, asB, async (k) => (await sql(k, `select seller_import_items($1::jsonb) as r`, [rowsJson(2)]))[0].r, { commit: true });
  assert.equal(two.imported, 2);
});

test("import is all or nothing and rejects formulas and bad rows", async () => {
  await sql(c, `delete from items where business_id = '${ids.bizB}'`);
  const mixed = JSON.stringify([{ name: "Good one", price: 10 }, { name: "=HYPERLINK(1)", price: 10 }]);
  await rejects(c, asB, `select seller_import_items($1::jsonb)`, [mixed], /invalid_row:2:formula/);
  const bad = [
    [{ name: "x", price: 1 }, /invalid_row:1:name/],
    [{ name: "Okay", price_type: "weird", price: 1 }, /price_type/],
    [{ name: "Okay", price: 1.5 }, /invalid_row:1:price/],
    [{ name: "Okay", price_type: "free", price: 5 }, /invalid_row:1:price/],
    [{ name: "Okay", price_type: "range", price: 5, price_max: 3 }, /price_max/],
    [{ name: "Okay", price: 5, availability: "nope" }, /availability/],
    [{ name: "Okay", price: 5, unit: "@x" }, /formula/],
    [{ name: "Okay", price: 5, section: "-x" }, /formula/],
    [{ name: "Okay", price: 5, search_tags: ["+x"] }, /tags/],
    [{ name: "Okay", price: 5, search_tags: new Array(16).fill("t") }, /tags/]
  ];
  for (const [r, pattern] of bad) await rejects(c, asB, `select seller_import_items($1::jsonb)`, [JSON.stringify([r])], pattern);
  await rejects(c, asB, `select seller_import_items('[]'::jsonb)`, [], /invalid_rows/);
  await rejects(c, asB, `select seller_import_items('{}'::jsonb)`, [], /invalid_rows/);
  assert.equal((await sql(c, `select id from items where business_id = '${ids.bizB}'`)).length, 0);
});

test("saved views are validated, capped and merged without losing other settings", async () => {
  const views = (n) => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, name: `View ${i}`, params: "sort=name_asc" }));
  await sql(c, `insert into seller_settings (business_id, settings) values ('${ids.bizA}', '{"idle_minutes": 30}')`);
  const saved = await tx(c, asA, async (k) => (await sql(k, `select seller_save_views($1::jsonb) as v`, [JSON.stringify(views(3))]))[0].v, { commit: true });
  assert.equal(saved.length, 3);
  const settings = (await sql(c, `select settings from seller_settings where business_id = '${ids.bizA}'`))[0].settings;
  assert.equal(settings.idle_minutes, 30);
  assert.equal(settings.saved_views.length, 3);
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_save_views($1::jsonb) as v`, [JSON.stringify(views(10))])))[0].v.length, 10);
  await rejects(c, asA, `select seller_save_views($1::jsonb)`, [JSON.stringify(views(11))], /invalid_saved_views/);
  await rejects(c, asA, `select seller_save_views($1::jsonb)`, [JSON.stringify([{ id: "a", name: "<b>", params: "" }])], /invalid_saved_views/);
  await rejects(c, asA, `select seller_save_views($1::jsonb)`, [JSON.stringify([{ id: "a", name: "=SUM(1)", params: "" }])], /invalid_saved_views/);
  await rejects(c, asA, `select seller_save_views($1::jsonb)`, [JSON.stringify([{ id: "a", name: "Same", params: "" }, { id: "b", name: "same", params: "" }])], /invalid_saved_views/);
  await rejects(c, asA, `select seller_save_views($1::jsonb)`, [JSON.stringify([{ id: "a", name: "x".repeat(41), params: "" }])], /invalid_saved_views/);
  await rejects(c, asA, `update seller_settings set settings = '{"saved_views": "nope"}'`, [], /invalid_saved_views/);
});

test("reorder rewrites the order atomically and only for own items", async () => {
  const it = await seedB();
  const [other] = await sql(c, `insert into items (business_id, name, price) values ('${ids.bizA}', 'A only', 50) returning id`);
  const order = [it.Echo, it.Delta, it.Charlie, it.Bravo, it.Alpha];
  const n = await tx(c, asB, async (k) => (await sql(k, `select seller_reorder_items($1::uuid[]) as n`, [order]))[0].n, { commit: true });
  assert.equal(n, 5);
  const rows = await sql(c, `select id from items where business_id = '${ids.bizB}' order by sort`);
  assert.deepEqual(rows.map((r) => r.id), order);
  await rejects(c, asB, `select seller_reorder_items($1::uuid[])`, [[it.Alpha, other.id]], /item_not_found/);
  await rejects(c, asB, `select seller_reorder_items($1::uuid[])`, [[it.Alpha, it.Alpha]], /invalid_selection/);
  await rejects(c, asB, `select seller_reorder_items('{}'::uuid[])`, [], /invalid_selection/);
  assert.deepEqual((await sql(c, `select id from items where business_id = '${ids.bizB}' order by sort`)).map((r) => r.id), order);
});
