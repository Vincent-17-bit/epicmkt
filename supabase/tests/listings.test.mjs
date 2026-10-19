import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  const url = await createDatabase();
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
const bulk = (who, action, list, args = {}) => as(who, `select seller_bulk_items($1, $2::uuid[], $3::jsonb) as r`, [action, list, JSON.stringify(args)]).then((r) => r[0].r);
const row = (id) => sql(c, `select * from items where id = $1`, [id]).then((r) => r[0]);

test("catalog items include media, shop state and are scoped to the seller", async () => {
  const a = await item(ids.bizA, "Alpha");
  await item(ids.bizB, "Bravo");
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', 'a/1.webp', 'image/webp'), ($1, $2, 'video', 'a/1.mp4', 'video/mp4')`, [a, ids.bizA]);
  const r = (await as(asA, `select seller_catalog_items() as r`))[0].r;
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].name, "Alpha");
  assert.deepEqual(r.items[0].image_paths, ["a/1.webp"]);
  assert.equal(r.items[0].has_video, true);
  assert.equal(r.shop.slug, "shop-a");
  assert.equal(r.shop.live, true);
  await rejects(c, { role: "anon" }, `select seller_catalog_items()`, [], /permission denied/);
});

test("extended stats count the new states", async () => {
  await sql(c, `delete from items`);
  await item(ids.bizA, "Appt", { availability: "by_appointment" });
  await item(ids.bizA, "Hidden", { visible: false });
  await item(ids.bizA, "Draft", { visible: false, draft: true });
  await item(ids.bizA, "Admin", { hidden_by_admin: true, admin_hide_reason: "x" });
  await item(ids.bizA, "Season", { season: '{"from":"12-01","to":"01-15"}' });
  await item(ids.bizA, "Soon", { available_from: new Date(Date.now() + 864e5 * 5).toISOString() });
  const low = await item(ids.bizA, "Low", { track_stock: true, stock_count: 2, low_stock_threshold: 3 });
  await sql(c, `insert into reports (business_id, item_id, reason) values ($1, $2, 'spam')`, [ids.bizA, low]);
  await sql(c, `insert into flags (business_id, item_id, reason) values ($1, $2, 'please check this')`, [ids.bizA, low]);
  const s = (await as(asA, `select seller_catalog_stats() as s`))[0].s;
  assert.equal(s.total, 7);
  assert.equal(s.by_appointment, 1);
  assert.equal(s.hidden_by_me, 1);
  assert.equal(s.drafts, 1);
  assert.equal(s.hidden_by_admin, 1);
  assert.equal(s.seasonal, 1);
  assert.equal(s.coming_soon, 1);
  assert.equal(s.low_stock, 1);
  assert.equal(s.reported, 1);
  assert.equal(s.flagged, 1);
  assert.equal(s.visible, 4);
});

test("drafts never reach the public view", async () => {
  await sql(c, `delete from items`);
  const d = await item(ids.bizA, "Hidden draft", { draft: true, visible: true });
  await item(ids.bizA, "Shown");
  const names = (await sql(c, `select name from public_items`)).map((r) => r.name);
  assert.deepEqual(names, ["Shown"]);
  await bulk(asA, "show", [d]);
  assert.equal((await sql(c, `select count(*)::int as n from public_items`))[0].n, 2);
});

test("bulk hide, show, availability and section move", async () => {
  await sql(c, `delete from items`);
  const [x, y, z] = [await item(ids.bizA, "Item X"), await item(ids.bizA, "Item Y"), await item(ids.bizA, "Item Z")];
  assert.deepEqual(await bulk(asA, "hide", [x, y]), { affected: 2, skipped: 0 });
  assert.equal((await row(x)).visible, false);
  assert.deepEqual(await bulk(asA, "hide", [x, y]), { affected: 0, skipped: 0 });
  assert.equal((await bulk(asA, "show", [x])).affected, 1);
  assert.equal((await bulk(asA, "set_availability", [x, y, z], { availability: "out_of_stock" })).affected, 3);
  assert.equal((await row(z)).availability, "out_of_stock");
  assert.equal((await bulk(asA, "move_section", [x, y], { section: "  Cuts " })).affected, 2);
  assert.equal((await row(y)).section, "Cuts");
  assert.equal((await bulk(asA, "move_section", [y], { section: "" })).affected, 1);
  assert.equal((await row(y)).section, null);
  await rejects(c, asA, `select seller_bulk_items('set_availability', array['${x}']::uuid[], '{"availability":"bogus"}')`, [], /invalid_availability/);
  await rejects(c, asA, `select seller_bulk_items('explode', array['${x}']::uuid[])`, [], /invalid_action/);
  await rejects(c, asA, `select seller_bulk_items('hide', '{}'::uuid[])`, [], /no_items/);
});

test("a seller cannot touch another shop's items or admin-removed ones", async () => {
  await sql(c, `delete from items`);
  const mine = await item(ids.bizA, "Mine");
  const theirs = await item(ids.bizB, "Theirs");
  const gone = await item(ids.bizA, "Removed", { removed_by_admin: true });
  const r = await bulk(asA, "hide", [mine, theirs, gone]);
  assert.deepEqual(r, { affected: 1, skipped: 2 });
  assert.equal((await row(theirs)).visible, true);
  assert.equal((await row(gone)).visible, true);
  assert.equal((await bulk(asA, "delete", [theirs])).affected, 0);
  assert.equal((await sql(c, `select count(*)::int as n from items where id = $1`, [theirs]))[0].n, 1);
});

test("showing an item hidden by admin leaves it hidden", async () => {
  await sql(c, `delete from items`);
  const id = await item(ids.bizA, "Admin hidden", { hidden_by_admin: true, admin_hide_reason: "photo", visible: false });
  await bulk(asA, "show", [id]);
  const r = await row(id);
  assert.equal(r.hidden_by_admin, true);
  assert.equal((await sql(c, `select count(*)::int as n from public_items`))[0].n, 0);
});

test("bulk delete removes the rows", async () => {
  await sql(c, `delete from items`);
  const a = await item(ids.bizA, "Del A");
  const b = await item(ids.bizA, "Del B");
  assert.equal((await bulk(asA, "delete", [a, b])).affected, 2);
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 0);
});

test("percent price change matches the shared rounding rule", async () => {
  await sql(c, `delete from items`);
  const fixed = await item(ids.bizA, "Fixed", { price: 333, sale_price: 300 });
  const range = await item(ids.bizA, "Range", { price: 2000, price_max: 3000, price_type: "range" });
  const free = await item(ids.bizA, "Free", { price: null, price_type: "free" });
  const tiny = await item(ids.bizA, "Tiny", { price: 2, sale_price: 1 });
  const half = await item(ids.bizA, "Half", { price: 15, price_type: "from" });
  const r = await bulk(asA, "price_percent", [fixed, range, free, tiny, half], { percent: 10 });
  assert.deepEqual(r, { affected: 4, skipped: 1 });
  const f = await row(fixed);
  assert.equal(Number(f.price), 366);
  assert.equal(Number(f.sale_price), 330);
  const g = await row(range);
  assert.deepEqual([Number(g.price), Number(g.price_max)], [2200, 3300]);
  assert.equal((await row(free)).price, null);
  const t = await row(tiny);
  assert.equal(Number(t.price), 2);
  assert.ok(Number(t.sale_price) < Number(t.price));
  assert.equal(Number((await row(half)).price), 17);
  const down = await bulk(asA, "price_percent", [fixed], { percent: -12.5 });
  assert.equal(down.affected, 1);
  assert.equal(Number((await row(fixed)).price), 320);
  await rejects(c, asA, `select seller_bulk_items('price_percent', array['${fixed}']::uuid[], '{"percent":0}')`, [], /invalid_percent/);
  await rejects(c, asA, `select seller_bulk_items('price_percent', array['${fixed}']::uuid[], '{"percent":301}')`, [], /invalid_percent/);
  await rejects(c, asA, `select seller_bulk_items('price_percent', array['${fixed}']::uuid[], '{"percent":-91}')`, [], /invalid_percent/);
  await rejects(c, asA, `select seller_bulk_items('price_percent', array['${fixed}']::uuid[], '{"percent":"abc"}')`, [], /invalid_percent/);
});

test("a failing batch changes nothing", async () => {
  await sql(c, `delete from items`);
  const ok = await item(ids.bizA, "Fine", { price: 1000 });
  const huge = await item(ids.bizA, "Huge", { price: 9999999999 });
  await rejects(c, asA, `select seller_bulk_items('price_percent', array['${ok}','${huge}']::uuid[], '{"percent":300}')`, [], /price_too_large/);
  assert.equal(Number((await row(ok)).price), 1000);
  assert.equal(Number((await row(huge)).price), 9999999999);
});

test("confirm prices stamps only the chosen items", async () => {
  await sql(c, `delete from items`);
  const a = await item(ids.bizA, "Old A");
  const b = await item(ids.bizA, "Old B");
  await sql(c, `update items set price_confirmed_at = now() - interval '200 days'`);
  assert.equal((await bulk(asA, "confirm_prices", [a])).affected, 1);
  assert.ok(Date.now() - Date.parse((await row(a)).price_confirmed_at) < 60000);
  assert.ok(Date.now() - Date.parse((await row(b)).price_confirmed_at) > 100 * 864e5);
  const s = (await as(asA, `select seller_catalog_stats(90) as s`))[0].s;
  assert.equal(s.stale_prices, 1);
});

test("reorder writes the manual order", async () => {
  await sql(c, `delete from items`);
  const [a, b, d] = [await item(ids.bizA, "Item A"), await item(ids.bizA, "Item B"), await item(ids.bizA, "Item D")];
  await as(asA, `select seller_reorder_items($1::uuid[])`, [[d, a, b]]);
  const list = (await as(asA, `select seller_catalog_items() as r`))[0].r.items.map((i) => i.name);
  assert.deepEqual(list, ["Item D", "Item A", "Item B"]);
  const other = await item(ids.bizB, "Other");
  await as(asA, `select seller_reorder_items($1::uuid[])`, [[other, a]]);
  assert.equal((await row(other)).sort, 0);
});

test("duplicate makes a hidden draft copy and respects the plan limit", async () => {
  await sql(c, `delete from items`);
  await sql(c, `update plans set items_limit = 2 where category_id = 'barber' and plan_key = 'standard'`);
  const a = await item(ids.bizA, "Original", { price: 250, tags: "{x,y}" });
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [a]))[0].id;
  const r = await row(copy);
  assert.equal(r.name, "Original (copy)");
  assert.equal(r.draft, true);
  assert.equal(r.visible, false);
  assert.deepEqual(r.tags, ["x", "y"]);
  await rejects(c, asA, `select seller_duplicate_item('${a}')`, [], /limit_reached/);
  await rejects(c, asB, `select seller_duplicate_item('${a}')`, [], /item_not_found/);
  await sql(c, `update plans set items_limit = 600 where category_id = 'barber'`);
});

test("import is Premium only, drafts-safe, limited and atomic", async () => {
  await sql(c, `delete from items`);
  const rows = JSON.stringify([
    { name: "Imported one", price_type: "fixed", price: 100, price_max: null, unit: "each", availability: "available", section: "Menu", tags: ["a", "b"] },
    { name: "Imported two", price_type: "contact", price: null, price_max: null, unit: null, availability: "by_appointment", section: null, tags: [] },
  ]);
  await rejects(c, asA, `select seller_import_items('${rows}'::jsonb)`, [], /premium_required/);
  const res = (await as(asB, `select seller_import_items($1::jsonb) as r`, [rows]))[0].r;
  assert.deepEqual(res, { created: 2 });
  const made = await sql(c, `select * from items where business_id = $1 order by sort`, [ids.bizB]);
  assert.equal(made.length, 2);
  assert.ok(made.every((m) => m.draft && !m.visible));
  assert.deepEqual(made[0].tags, ["a", "b"]);
  assert.equal(made[1].availability, "by_appointment");
  assert.equal((await sql(c, `select count(*)::int as n from public_items`))[0].n, 0);

  const bad = JSON.stringify([{ name: "Fine row", price_type: "fixed", price: 5 }, { name: "=SUM(A1)", price_type: "fixed", price: 5 }]);
  await rejects(c, asB, `select seller_import_items('${bad}'::jsonb)`, [], /formula_rejected/);
  const broken = JSON.stringify([{ name: "Fine row two", price_type: "fixed", price: 5 }, { name: "Bad type", price_type: "nonsense", price: 5 }]);
  await assert.rejects(tx(c, asB, (k) => sql(k, `select seller_import_items($1::jsonb)`, [broken])), /violates check constraint/);
  assert.equal((await sql(c, `select count(*)::int as n from items where business_id = $1`, [ids.bizB]))[0].n, 2);

  await sql(c, `update plans set items_limit = 3 where category_id = 'barber' and plan_key = 'premium'`);
  const over = JSON.stringify([{ name: "Over one", price_type: "free" }, { name: "Over two", price_type: "free" }]);
  await rejects(c, asB, `select seller_import_items('${over}'::jsonb)`, [], /limit_reached/);
  assert.equal((await sql(c, `select count(*)::int as n from items where business_id = $1`, [ids.bizB]))[0].n, 2);
  await sql(c, `update plans set items_limit = 600 where category_id = 'barber'`);

  const many = JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ name: `Row ${i}`, price_type: "free" })));
  await rejects(c, asB, `select seller_import_items('${many}'::jsonb)`, [], /too_many_rows/);
  await rejects(c, asB, `select seller_import_items('[]'::jsonb)`, [], /no_rows/);
});

test("saved views are validated, capped at ten and private", async () => {
  const save = (who, views) => as(who, `select seller_save_views($1::jsonb) as r`, [JSON.stringify(views)]);
  const view = (n, name = `View ${n}`) => ({ id: `id${n}`, name, query: "sort=name_asc" });
  await save(asA, [view(1), view(2)]);
  assert.equal((await as(asA, `select seller_get_views() as r`))[0].r.length, 2);
  assert.deepEqual((await as(asB, `select seller_get_views() as r`))[0].r, []);
  await save(asA, Array.from({ length: 10 }, (_, i) => view(i)));
  await rejects(c, asA, `select seller_save_views('${JSON.stringify(Array.from({ length: 11 }, (_, i) => view(i)))}'::jsonb)`, [], /too_many_views/);
  for (const bad of [
    [{ id: "a", name: "<b>", query: "" }],
    [{ id: "a", name: "=cmd", query: "" }],
    [{ id: "a", name: "x".repeat(31), query: "" }],
    [{ id: "a b", name: "Ok", query: "" }],
    [{ id: "a", name: "Ok", query: "x".repeat(601) }],
    [{ id: "a", name: "Same", query: "" }, { id: "b", name: "same", query: "" }],
  ]) {
    await assert.rejects(save(asA, bad), /invalid_view|duplicate_view/);
  }
  assert.equal((await as(asA, `select seller_get_views() as r`))[0].r.length, 10);
  await sql(c, `update seller_settings set settings = settings || '{"other": 1}' where business_id = '${ids.bizA}'`);
  await save(asA, [view(1)]);
  assert.equal((await sql(c, `select settings->>'other' as o from seller_settings where business_id = '${ids.bizA}'`))[0].o, "1");
});

test("anonymous callers cannot reach the listing functions", async () => {
  for (const fn of ["seller_bulk_items('hide', '{}'::uuid[])", "seller_import_items('[]'::jsonb)", "seller_save_views('[]'::jsonb)", "seller_get_views()", "seller_reorder_items('{}'::uuid[])", "seller_duplicate_item(gen_random_uuid())"]) {
    await rejects(c, { role: "anon" }, `select ${fn}`, [], /permission denied/);
  }
});

test("a suspended seller cannot use any listing function", async () => {
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizA}'`);
  const calls = [
    "seller_catalog_items()", "seller_catalog_stats()", "seller_get_views()", "seller_save_views('[]'::jsonb)",
    "seller_bulk_items('hide', array[gen_random_uuid()])", "seller_reorder_items(array[gen_random_uuid()])",
    "seller_duplicate_item(gen_random_uuid())", "seller_import_items('[{\"name\":\"Ab\"}]'::jsonb)",
  ];
  for (const text of calls) await rejects(c, asA, `select ${text}`, [], /account_suspended/);
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
});
