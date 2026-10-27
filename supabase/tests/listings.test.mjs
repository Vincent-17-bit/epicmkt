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

test("reorder photos sets the cover and refuses another seller's item", async () => {
  await sql(c, `delete from items`);
  const it = await item(ids.bizA, "Photo item");
  const other = await item(ids.bizB, "Other photo item");
  for (const [n, p] of ["p1", "p2", "p3"].entries()) await sql(c, `insert into item_media (item_id, business_id, kind, path, mime, sort) values ($1, $2, 'image', $3, 'image/jpeg', $4)`, [it, ids.bizA, `${ids.bizA}/${p}`, n]);
  const paths = ["p3", "p1", "p2"].map((p) => `${ids.bizA}/${p}`);
  await as(asA, `select seller_reorder_item_photos($1, $2::text[])`, [it, paths]);
  const order = (await as(asA, `select seller_catalog_items() as r`))[0].r.items.find((i) => i.id === it).image_paths;
  assert.deepEqual(order, paths);
  await rejects(c, asA, `select seller_reorder_item_photos($1, $2::text[])`, [other, paths], /item_not_found/);
  await rejects(c, { role: "anon" }, `select seller_reorder_item_photos($1, $2::text[])`, [it, paths], /permission denied/);
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

test("customers get an item's video paths in the seller's order, apart from the image paths", async () => {
  await sql(c, `delete from item_media`);
  const withVideos = await item(ids.bizA, "Reel item");
  const plain = await item(ids.bizA, "Photo only");
  const draft = await item(ids.bizA, "Draft reel", { draft: true });
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime, sort) values
    ($1, $3, 'video', 'a/second.mp4', 'video/mp4', 2), ($1, $3, 'video', 'a/first.webm', 'video/webm', 1), ($1, $3, 'image', 'a/photo.webp', 'image/webp', 1),
    ($2, $3, 'image', 'a/solo.webp', 'image/webp', 1), ($4, $3, 'video', 'a/draft.mp4', 'video/mp4', 1)`, [withVideos, plain, ids.bizA, draft]);
  const rows = await tx(c, { role: "anon" }, (k) => sql(k, `select name, image_paths, video_paths from public_items where business_id = $1 order by name`, [ids.bizA]));
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.deepEqual(by["Reel item"].video_paths, ["a/first.webm", "a/second.mp4"]);
  assert.deepEqual(by["Reel item"].image_paths, ["a/photo.webp"]);
  assert.deepEqual(by["Photo only"].video_paths, []);
  assert.equal(by["Draft reel"], undefined, "a draft item, and so its video, stays private");
});

const json = JSON.stringify;
const spec = (n, extra = {}) => ({ group: "Features & Specs", label: `Label ${n}`, value: `Value ${n}`, ...extra });
const specList = (n) => Array.from({ length: n }, (_, i) => spec(i));
const detailFields = { name: "Detail item", price_type: "fixed", price: "1200", availability: "available" };
const save = (who, fields, id = null) => as(who, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, json(fields)]).then((r) => r[0].id);

test("item details with a bad shape or length cannot be stored", async () => {
  await sql(c, `delete from items`);
  const longer = (n) => "x".repeat(n);
  const bad = [
    [{ highlights: json({}) }, /items_highlights_shape/],
    [{ highlights: "null" }, /items_highlights_shape/],
    [{ highlights: json(Array.from({ length: 9 }, () => ({ text: "Fast" }))) }, /items_highlights_shape/],
    [{ highlights: json([{ title: "Only a title" }]) }, /items_highlights_shape/],
    [{ highlights: json([{ text: "   " }]) }, /items_highlights_shape/],
    [{ highlights: json([{ text: 5 }]) }, /items_highlights_shape/],
    [{ highlights: json([{ text: longer(201) }]) }, /items_highlights_shape/],
    [{ highlights: json([{ title: longer(41), text: "Fast" }]) }, /items_highlights_shape/],
    [{ highlights: json([{ title: null, text: "Fast" }]) }, /items_highlights_shape/],
    [{ highlights: json([{ text: "Fast", url: "x" }]) }, /items_highlights_shape/],
    [{ highlights: json(["Fast"]) }, /items_highlights_shape/],
    [{ highlights: json([null]) }, /items_highlights_shape/],
    [{ specs: json({}) }, /items_specs_shape/],
    [{ specs: json([spec(1, { group: "Elsewhere" })]) }, /items_specs_shape/],
    [{ specs: json([spec(1, { group: "measurements" })]) }, /items_specs_shape/],
    [{ specs: json([{ label: "Weight", value: "2 kg" }]) }, /items_specs_shape/],
    [{ specs: json([spec(1, { label: longer(41) })]) }, /items_specs_shape/],
    [{ specs: json([spec(1, { value: longer(121) })]) }, /items_specs_shape/],
    [{ specs: json([spec(1, { label: " " })]) }, /items_specs_shape/],
    [{ specs: json([spec(1, { extra: "x" })]) }, /items_specs_shape/],
    [{ specs: json(specList(21)) }, /items_specs_shape/],
    [{ includes: Array.from({ length: 11 }, (_, i) => `Part ${i}`) }, /items_includes_shape/],
    [{ includes: [longer(81)] }, /items_includes_shape/],
    [{ includes: ["Cable", " "] }, /items_includes_shape/],
    [{ includes: ["Cable", null] }, /items_includes_shape/],
    [{ includes: "{{a},{b}}" }, /items_includes_shape/],
    [{ brand: longer(61) }, /items_brand_len/],
    [{ short_description: longer(141) }, /items_short_description_len/],
    [{ terms: longer(501) }, /items_terms_len/],
    [{ pack_size: longer(41) }, /items_pack_size_len/],
  ];
  for (const [extra, pattern] of bad) await assert.rejects(item(ids.bizA, "Bad shape", extra), pattern, Object.keys(extra)[0]);
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 0);
});

test("item details at their limits are stored as given", async () => {
  await sql(c, `delete from items`);
  const longer = (n) => "x".repeat(n);
  const groups = ["Features & Specs", "Measurements", "Additional details", "User guide", "Item details"];
  const id = await item(ids.bizA, "At the limit", {
    brand: longer(60),
    short_description: longer(140),
    terms: longer(500),
    pack_size: longer(40),
    highlights: json(Array.from({ length: 8 }, () => ({ title: longer(40), text: longer(200) }))),
    specs: json(Array.from({ length: 20 }, (_, i) => ({ group: groups[i % 5], label: longer(40), value: longer(120) }))),
    includes: Array.from({ length: 10 }, () => longer(80)),
  });
  const r = await row(id);
  assert.equal(r.brand.length, 60);
  assert.equal(r.highlights.length, 8);
  assert.equal(r.specs.length, 20);
  assert.deepEqual([...new Set(r.specs.map((s) => s.group))].sort(), [...groups].sort());
  assert.equal(r.includes.length, 10);
  const titleless = await item(ids.bizA, "Titleless", { highlights: json([{ text: "Just text" }]) });
  assert.deepEqual((await row(titleless)).highlights, [{ text: "Just text" }]);
});

test("the 21st spec is refused by the save function and the table", async () => {
  await sql(c, `delete from items`);
  const id = await save(asA, { ...detailFields, specs: specList(20) });
  assert.equal((await row(id)).specs.length, 20);
  await rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, json({ ...detailFields, specs: specList(21) })], /invalid_details/);
  await rejects(c, asA, `select seller_save_item(null::uuid, $1::jsonb)`, [json({ ...detailFields, specs: specList(21) })], /invalid_details/);
  assert.equal((await row(id)).specs.length, 20);
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 1);
  await assert.rejects(sql(c, `update items set specs = $2::jsonb where id = $1`, [id, json(specList(21))]), /items_specs_shape/);
});

test("the save function writes, keeps and clears the details and rejects bad ones", async () => {
  await sql(c, `delete from items`);
  const id = await save(asA, {
    ...detailFields,
    brand: "  Acme ",
    short_description: "Light and quick",
    highlights: [{ title: "Speed", text: "Fast charging" }, { text: "Two year warranty" }],
    specs: [spec(1), spec(2, { group: "Measurements" })],
    includes: ["Charger", " Cable "],
    terms: "Returns within 7 days",
    pack_size: "Box of 2",
  });
  let r = await row(id);
  assert.equal(r.brand, "Acme");
  assert.deepEqual(r.highlights, [{ title: "Speed", text: "Fast charging" }, { text: "Two year warranty" }]);
  assert.deepEqual(r.includes, ["Charger", "Cable"]);
  assert.equal(r.pack_size, "Box of 2");

  await save(asA, { ...detailFields, name: "Renamed" }, id);
  r = await row(id);
  assert.equal(r.name, "Renamed");
  assert.equal(r.brand, "Acme");
  assert.equal(r.specs.length, 2);
  assert.deepEqual(r.includes, ["Charger", "Cable"]);
  assert.equal(r.terms, "Returns within 7 days");

  await save(asA, { ...detailFields, brand: "", short_description: null, highlights: null, specs: [], includes: null, terms: " ", pack_size: null }, id);
  r = await row(id);
  assert.deepEqual([r.brand, r.short_description, r.terms, r.pack_size], [null, null, null, null]);
  assert.deepEqual([r.highlights, r.specs, r.includes], [[], [], []]);

  for (const bad of [
    { brand: "x".repeat(61) },
    { short_description: "x".repeat(141) },
    { terms: "x".repeat(501) },
    { pack_size: "x".repeat(41) },
    { brand: { a: 1 } },
    { highlights: [{ text: "x".repeat(201) }] },
    { highlights: "not a list" },
    { specs: [spec(1, { group: "Elsewhere" })] },
    { includes: [1, 2] },
    { includes: Array.from({ length: 11 }, (_, i) => `Part ${i}`) },
    { includes: ["ok", " "] },
  ]) {
    await rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, json({ ...detailFields, ...bad })], /invalid_details/);
    await rejects(c, asA, `select seller_save_item(null::uuid, $1::jsonb)`, [json({ ...detailFields, ...bad })], /invalid_details/);
  }
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 1);
});

test("the save function drops empty highlight titles instead of refusing them", async () => {
  await sql(c, `delete from items`);
  const id = await save(asA, {
    ...detailFields,
    highlights: [{ title: null, text: "One" }, { title: "  ", text: "Two" }, { title: "", text: "Three" }, { title: "Kept", text: "Four" }, { text: "Five" }],
  });
  assert.deepEqual((await row(id)).highlights, [{ text: "One" }, { text: "Two" }, { text: "Three" }, { title: "Kept", text: "Four" }, { text: "Five" }]);
  await save(asA, { ...detailFields, specs: [{ label: "Weight", value: "2 kg" }, { group: null, label: "Colour", value: "Red" }, spec(3, { group: "Measurements" })] }, id);
  assert.deepEqual((await row(id)).specs.map((s) => s.group), ["Features & Specs", "Features & Specs", "Measurements"]);
  await rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, json({ ...detailFields, specs: [spec(1, { group: "Elsewhere" })] })], /invalid_details/);
  await rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, json({ ...detailFields, highlights: [{ title: 5, text: "Bad" }] })], /invalid_details/);
  await rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, json({ ...detailFields, highlights: [{ title: null }] })], /invalid_details/);
});

test("changes to the details are written to the item history", async () => {
  await sql(c, `delete from items`);
  const id = await save(asA, detailFields);
  const history = () => sql(c, `select field, old_value, new_value, actor_role from item_history where item_id = $1 order by id`, [id]);
  assert.deepEqual(await history(), []);
  await save(asA, {
    ...detailFields,
    brand: "Acme",
    short_description: "Light",
    highlights: [{ text: "Fast" }],
    specs: [spec(1)],
    includes: ["Charger"],
    terms: "Seven days",
    pack_size: "Single",
  }, id);
  const by = Object.fromEntries((await history()).map((h) => [h.field, h]));
  assert.deepEqual(Object.keys(by).sort(), ["brand", "highlights", "includes", "pack_size", "short_description", "specs", "terms"]);
  assert.equal(by.brand.old_value, null);
  assert.equal(by.brand.new_value, "Acme");
  assert.equal(by.brand.actor_role, "seller");
  assert.deepEqual(JSON.parse(by.highlights.old_value), []);
  assert.deepEqual(JSON.parse(by.highlights.new_value), [{ text: "Fast" }]);
  assert.deepEqual(JSON.parse(by.includes.new_value), ["Charger"]);
  const before = (await history()).length;
  await save(asA, { ...detailFields, brand: "Acme", highlights: [{ text: "Fast" }] }, id);
  assert.equal((await history()).length, before);
  await save(asA, { ...detailFields, brand: "Acme Two" }, id);
  const last = (await history()).at(-1);
  assert.deepEqual([last.field, last.old_value, last.new_value], ["brand", "Acme", "Acme Two"]);
});

test("the store product count only counts items customers can see", async () => {
  await sql(c, `delete from items`);
  const counts = () => tx(c, { role: "anon" }, (k) => sql(k, `select slug, product_count from public_businesses order by slug`)).then((r) => Object.fromEntries(r.map((x) => [x.slug, x.product_count])));
  assert.deepEqual(await counts(), { "shop-a": 0, "shop-b": 0 });
  await item(ids.bizA, "Shown");
  await item(ids.bizA, "Low", { availability: "limited_stock" });
  await item(ids.bizA, "By appointment", { availability: "by_appointment" });
  await item(ids.bizA, "Hidden", { visible: false });
  await item(ids.bizA, "Draft", { draft: true });
  await item(ids.bizA, "Hidden draft", { draft: true, visible: false });
  await item(ids.bizA, "Admin hidden", { hidden_by_admin: true, admin_hide_reason: "x" });
  await item(ids.bizA, "Admin removed", { removed_by_admin: true });
  await item(ids.bizA, "Sold out", { availability: "out_of_stock" });
  await item(ids.bizA, "Unavailable", { availability: "unavailable" });
  await item(ids.bizB, "Other shop");
  assert.deepEqual(await counts(), { "shop-a": 3, "shop-b": 1 });
  const viaView = await tx(c, { role: "anon" }, (k) => sql(k, `select b.slug, (select count(*)::int from public_items i where i.business_id = b.id) as n, b.product_count from public_businesses b`));
  assert.ok(viaView.every((x) => x.n === x.product_count));
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizB]);
  assert.deepEqual(await counts(), { "shop-a": 3 });
  await sql(c, `update businesses set status = 'live' where id = $1`, [ids.bizB]);
});

test("duplicating an item copies the details", async () => {
  await sql(c, `delete from items`);
  const a = await item(ids.bizA, "With details", {
    brand: "Acme",
    short_description: "Light and quick",
    highlights: json([{ title: "Speed", text: "Fast" }, { text: "Warranty" }]),
    specs: json([spec(1), spec(2, { group: "Item details" })]),
    includes: ["Charger", "Cable"],
    terms: "Seven days",
    pack_size: "Box of 2",
  });
  const copy = await row((await as(asA, `select seller_duplicate_item($1) as id`, [a]))[0].id);
  const src = await row(a);
  for (const f of ["brand", "short_description", "highlights", "specs", "includes", "terms", "pack_size"]) assert.deepEqual(copy[f], src[f], f);
  assert.equal(copy.draft, true);
  const plain = await item(ids.bizA, "Without details");
  const plainCopy = await row((await as(asA, `select seller_duplicate_item($1) as id`, [plain]))[0].id);
  assert.deepEqual([plainCopy.brand, plainCopy.short_description, plainCopy.terms, plainCopy.pack_size], [null, null, null, null]);
  assert.deepEqual([plainCopy.highlights, plainCopy.specs, plainCopy.includes], [[], [], []]);
});

test("items and stores without details select exactly as before", async () => {
  await sql(c, `delete from items`);
  const id = await item(ids.bizA, "Old style", { price: 80 });
  const r = await row(id);
  assert.deepEqual([r.brand, r.short_description, r.terms, r.pack_size], [null, null, null, null]);
  assert.deepEqual([r.highlights, r.specs, r.includes], [[], [], []]);
  const pub = (await tx(c, { role: "anon" }, (k) => sql(k, `select * from public_items where id = $1`, [id])))[0];
  assert.equal(pub.name, "Old style");
  assert.equal(Number(pub.price), 80);
  assert.deepEqual([pub.highlights, pub.specs, pub.includes], [[], [], []]);
  assert.equal(pub.brand, null);
  const cols = (view) => sql(c, `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [view]).then((x) => x.map((y) => y.column_name));
  const items = await cols("public_items");
  assert.deepEqual(items.slice(0, 15), ["id", "business_id", "name", "description", "section", "price", "price_max", "price_type", "unit", "availability", "sort", "created_at", "image_paths", "video_paths", "stock_left"]);
  assert.deepEqual(items.slice(15), ["brand", "short_description", "highlights", "specs", "includes", "terms", "pack_size"]);
  const stores = await cols("public_businesses");
  assert.deepEqual(stores.slice(-2), ["exceptions", "product_count"]);
  const grants = await sql(c, `select grantee from information_schema.role_table_grants where table_schema = 'public' and table_name in ('public_items', 'public_businesses') and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated', 'service_role')`);
  assert.equal(grants.length, 6);
  const barrier = await sql(c, `select relname from pg_class where relname in ('public_items', 'public_businesses') and 'security_barrier=true' = any (reloptions) order by relname`);
  assert.deepEqual(barrier.map((x) => x.relname), ["public_businesses", "public_items"]);
  const catalog = (await as(asA, `select seller_catalog_items() as r`))[0].r;
  assert.deepEqual(catalog.items.map((i) => i.highlights), [[]]);
});

test("import stores the optional details and leaves rows without them as before", async () => {
  await sql(c, `delete from items`);
  const rows = json([
    { name: "Cake", price_type: "fixed", price: 900, brand: " Acme ", short_description: "Fresh daily", pack_size: "Box of 6", terms: "Order a day ahead", includes: ["Candles", " Knife ", ""] },
    { name: "Plain", price_type: "fixed", price: 10 },
    { name: "Blanks", price_type: "fixed", price: 10, brand: "", short_description: null, includes: null },
  ]);
  assert.deepEqual((await as(asB, `select seller_import_items($1::jsonb) as r`, [rows]))[0].r, { created: 3 });
  const made = Object.fromEntries((await sql(c, `select * from items where business_id = $1`, [ids.bizB])).map((m) => [m.name, m]));
  assert.deepEqual([made.Cake.brand, made.Cake.short_description, made.Cake.pack_size, made.Cake.terms], ["Acme", "Fresh daily", "Box of 6", "Order a day ahead"]);
  assert.deepEqual(made.Cake.includes, ["Candles", "Knife"]);
  for (const name of ["Plain", "Blanks"]) {
    assert.deepEqual([made[name].brand, made[name].short_description, made[name].pack_size, made[name].terms], [null, null, null, null], name);
    assert.deepEqual([made[name].highlights, made[name].specs, made[name].includes], [[], [], []], name);
  }
  assert.ok(Object.values(made).every((m) => m.draft && !m.visible));
});

test("a bad detail stops the whole import", async () => {
  await sql(c, `delete from items`);
  const ok = { name: "Fine row", price_type: "fixed", price: 5 };
  const longer = (n) => "x".repeat(n);
  for (const [bad, pattern] of [
    [{ brand: longer(61) }, /invalid_details/],
    [{ short_description: longer(141) }, /invalid_details/],
    [{ pack_size: longer(41) }, /invalid_details/],
    [{ terms: longer(501) }, /invalid_details/],
    [{ brand: 5 }, /invalid_details/],
    [{ includes: "Cable" }, /invalid_details/],
    [{ includes: [1] }, /invalid_details/],
    [{ includes: Array.from({ length: 11 }, (_, i) => `Part ${i}`) }, /invalid_details/],
    [{ includes: [longer(81)] }, /invalid_details/],
    [{ brand: "=cmd" }, /formula_rejected/],
    [{ terms: "@SUM(A1)" }, /formula_rejected/],
    [{ includes: ["Cable", "+1+1"] }, /formula_rejected/],
  ]) {
    await rejects(c, asB, `select seller_import_items($1::jsonb)`, [json([ok, { name: "Bad row", price_type: "fixed", price: 5, ...bad }])], pattern);
  }
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 0);
});

test("the seller catalog carries the details only when an item has them", async () => {
  await sql(c, `delete from items`);
  await item(ids.bizA, "Bare");
  await item(ids.bizA, "Full", { brand: "Acme", specs: json([spec(1, { group: "Measurements" })]), includes: ["Charger"] });
  const items = (await as(asA, `select seller_catalog_items() as r`))[0].r.items;
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.deepEqual([by.Bare.brand, by.Bare.highlights, by.Bare.specs, by.Bare.includes], [null, [], [], []]);
  assert.equal(by.Full.specs[0].group, "Measurements");
  assert.deepEqual(by.Full.includes, ["Charger"]);
  const worst = await item(ids.bizA, "Worst", {
    brand: "b".repeat(60), short_description: "s".repeat(140), terms: "t".repeat(500), pack_size: "p".repeat(40),
    highlights: json(Array.from({ length: 8 }, () => ({ title: "t".repeat(40), text: "h".repeat(200) }))),
    specs: json(Array.from({ length: 20 }, () => ({ group: "Features & Specs", label: "l".repeat(40), value: "v".repeat(120) }))),
    includes: Array.from({ length: 10 }, () => "i".repeat(80)),
  });
  const bytes = (await sql(c, `select length(to_jsonb(i)::text) - length((to_jsonb(i) - 'brand' - 'short_description' - 'highlights' - 'specs' - 'includes' - 'terms' - 'pack_size')::text) as n from items i where id = $1`, [worst]))[0].n;
  assert.ok(bytes < 9000, `the largest item adds ${bytes} bytes`);
});
