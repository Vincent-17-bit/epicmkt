// Migration 0109: an option axis can name a scale and a value can carry its stored scale value; they survive save, read, duplicate and a
// deleted photo; and products_snapshot carries `size_values` for the buyer's size filters.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase("option_scales"));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const anon = { role: "anon" };
const newItem = async (biz = ids.bizA, extra = {}) => {
  const f = { name: "Loafer", price: 3000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [biz, ...Object.values(f)]))[0].id;
};
const base = (o = {}) => ({ name: "Loafer", description: "", section: "Shoes", price_type: "fixed", price: 3000, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const save = (who, id, fields) => as(who, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const saveFails = (who, id, fields, pattern) => rejects(c, who, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const sellerRead = (id) => as(asA, `select seller_item_options($1) as r`, [id]).then((r) => r[0].r);
const publicRead = (id) => as(anon, `select public_item_options($1) as r`, [id]).then((r) => r[0].r);
const stored = (id) => sql(c, `select option_axes from items where id = $1`, [id]).then((r) => r[0].option_axes);

const eu = (n, extra = {}) => ({ id: `eu-${String(n).replace(".", "-")}`, label: `EU ${n}`, stored: { scale: "shoe", system: "eu", value: n, ...extra } });
const shoeAxes = (values = [eu(41), eu(42), eu(43)]) => [
  { key: "size", label: "Shoe size", display: "button", scale: "shoe", values },
  { key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "tan", label: "Tan" }] },
];
const variants = (axes) => axes[0].values.flatMap((s) => axes[1].values.map((k) => ({ choice: { size: s.id, colour: k.id } })));
const withShoes = (axes = shoeAxes()) => base({ options: { axes, variants: variants(axes) } });

test("an axis's scale and a value's stored are stored, and seller and buyer reads show them", async () => {
  const id = await newItem();
  await save(asA, id, withShoes());
  const row = await stored(id);
  assert.equal(row[0].scale, "shoe");
  assert.deepEqual(row[0].values[1], eu(42));
  assert.equal("scale" in row[1], false, "an axis without a scale stays without");
  assert.equal("stored" in row[1].values[0], false);
  const mine = await sellerRead(id);
  assert.equal(mine.axes[0].scale, "shoe");
  assert.deepEqual(mine.axes[0].values[2].stored, { scale: "shoe", system: "eu", value: 43 });
  const pub = await publicRead(id);
  assert.equal(pub.options[0].scale, "shoe");
  assert.deepEqual(pub.options[0].values[0].stored, { scale: "shoe", system: "eu", value: 41 });
  assert.equal("scale" in pub.options[1], false);
});

test("text is trimmed, the scale id is lower-cased, nulls are dropped, and widths and units are kept", async () => {
  const id = await newItem();
  const axes = shoeAxes([{ id: "eu-42-w", label: "EU 42 wide", stored: { scale: " shoe ", system: " eu ", value: 42, width: "wide", unit: null } }]);
  axes[0].scale = " SHOE ";
  await save(asA, id, withShoes(axes));
  const row = await stored(id);
  assert.equal(row[0].scale, "shoe");
  assert.deepEqual(row[0].values[0].stored, { scale: "shoe", system: "eu", value: 42, width: "wide" });
});

test("an axis can be saved without any scale and reads exactly as before", async () => {
  const id = await newItem();
  const axes = [{ key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "tan", label: "Tan" }] }];
  await save(asA, id, base({ options: { axes, variants: [{ choice: { colour: "black" } }, { choice: { colour: "tan" } }] } }));
  assert.deepEqual(await stored(id), axes);
});

test("a bad scale or stored is refused with invalid_options and nothing is written", async () => {
  const id = await newItem();
  const bad = [
    ["a stored with a key that is not ours", () => shoeAxes([eu(42, { evil: "x" })])],
    ["a stored for a different scale than the axis", () => shoeAxes([{ id: "x", label: "X", stored: { scale: "volume", value: 20, unit: "l" } }])],
    ["a stored on an axis with no scale", () => { const a = shoeAxes(); delete a[0].scale; return a; }],
    ["a scale id with spaces or capitals inside", () => { const a = shoeAxes(); a[0].scale = "Shoe Size"; return a; }],
    ["a width that is not narrow, regular or wide", () => shoeAxes([eu(42, { width: "huge" })])],
    ["a shape that is not rectangular or round", () => shoeAxes([eu(42, { shape: "oval" })])],
    ["a value that is not a number or text", () => shoeAxes([{ id: "x", label: "X", stored: { scale: "shoe", value: { a: 1 } } }])],
    ["a text value with markup", () => shoeAxes([{ id: "x", label: "X", stored: { scale: "shoe", value: "<b>42</b>" } }])],
    ["an absurd number", () => shoeAxes([eu(1e12)])],
    ["a stored that is a list", () => shoeAxes([{ id: "x", label: "X", stored: [1, 2] }])],
    ["a stored with no value", () => shoeAxes([{ id: "x", label: "X", stored: { scale: "shoe" } }])],
  ];
  for (const [why, build] of bad) {
    const axes = build();
    await saveFails(asA, id, withShoes(axes), /invalid_options/);
    assert.deepEqual(await stored(id), [], `nothing written for: ${why}`);
  }
});

test("another seller cannot touch the item (unchanged rule)", async () => {
  const id = await newItem();
  await saveFails(asB, id, withShoes(), /item_not_found/);
});

test("Duplicate keeps the scale and every stored", async () => {
  const src = await newItem();
  await save(asA, src, withShoes());
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [src]))[0].id;
  assert.deepEqual(await stored(copy), await stored(src));
});

test("deleting a photo keeps dependsOn, scale and stored (it used to drop dependsOn)", async () => {
  const id = await newItem();
  const m = (await sql(c, `select attach_item_media($1, 'image', $2, 'image/jpeg', 100, 100, null, 1000) as id`, [id, `${ids.bizA}/${id}-0.jpg`]))[0].id;
  const axes = [
    { key: "style", label: "Style", display: "button", values: [{ id: "a", label: "A", mediaId: m }, { id: "b", label: "B" }] },
    { key: "size", label: "Shoe size", display: "button", dependsOn: "style", scale: "shoe", values: [eu(41), eu(42)] },
  ];
  await save(asA, id, base({ options: { axes, variants: axes[0].values.flatMap((s) => axes[1].values.map((k) => ({ choice: { style: s.id, size: k.id } }))) } }));
  assert.equal((await stored(id))[0].values[0].mediaId, m);
  await sql(c, `delete from item_media where id = $1`, [m]);
  const after = await stored(id);
  assert.equal("mediaId" in after[0].values[0], false, "the photo is gone from the value");
  assert.equal(after[1].dependsOn, "style");
  assert.equal(after[1].scale, "shoe");
  assert.deepEqual(after[1].values[1], eu(42));
});

test("item_size_values_public lists each distinct scale value of a live item once, and null for an item with none", async () => {
  const id = await newItem();
  await save(asA, id, withShoes(shoeAxes([eu(41), eu(42), eu(42, { width: "wide" })].map((v, i) => ({ ...v, id: `v${i}` })))));
  const out = (await as(anon, `select item_size_values_public($1) as s`, [id]))[0].s;
  assert.equal(out.length, 3);
  assert.ok(out.every((s) => s.scale === "shoe"));
  const plain = await newItem(ids.bizA, { name: "Mug" });
  assert.equal((await as(anon, `select item_size_values_public($1) as s`, [plain]))[0].s, null);
});

test("item_size_values_public answers nothing for an item that is not public (hidden or an unpaid shop)", async () => {
  const hidden = await newItem(ids.bizA, { visible: false });
  await sql(c, `update items set option_axes = $2::jsonb where id = $1`, [hidden, JSON.stringify(shoeAxes())]);
  assert.equal((await as(anon, `select item_size_values_public($1) as s`, [hidden]))[0].s, null);
  const shown = await newItem();
  await save(asA, shown, withShoes());
  assert.notEqual((await as(anon, `select item_size_values_public($1) as s`, [shown]))[0].s, null);
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  assert.equal((await as(anon, `select item_size_values_public($1) as s`, [shown]))[0].s, null);
});

test("products_snapshot carries sizes for the item that has them, and the older columns are still there", async () => {
  const shoes = await newItem();
  await save(asA, shoes, withShoes());
  const mug = await newItem(ids.bizA, { name: "Mug" });
  const snap = (await as(anon, `select products_snapshot(100) as s`))[0].s;
  const row = (id) => snap.items.find((i) => i.id === id);
  assert.equal(row(shoes).size_values.length, 3);
  assert.deepEqual(row(shoes).size_values[0], { scale: "shoe", system: "eu", value: 41 });
  assert.equal(row(mug).size_values, null);
  for (const k of ["brand", "video_paths", "stock_left", "image_path", "sale_price"]) assert.ok(k in row(shoes), `${k} still in the snapshot`);
});

test("the migration can run twice without changing the snapshot function", async () => {
  const before = (await sql(c, `select pg_get_functiondef('public.products_snapshot(integer)'::regprocedure) as d`))[0].d;
  const { readFileSync, readdirSync } = await import("node:fs");
  // Found by name, not by number, so the file can be renumbered (scripts/renumber-migration.mjs) without touching this test.
  const file = readdirSync(new URL("../migrations/", import.meta.url)).find((f) => f.endsWith("_option_scales_sizes.sql"));
  assert.ok(file, "the option scales migration exists");
  await sql(c, readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  assert.equal((await sql(c, `select pg_get_functiondef('public.products_snapshot(integer)'::regprocedure) as d`))[0].d, before);
});

test("the payload the seller editor builds (storage sizes with scale data) is accepted by the database, and reads back unchanged", async () => {
  const { emptyOptionsForm, addAxis, addValue, optionsPayload, optionsFromServer, scales } = await import("../../shared/src/index.js");
  const typed = (options, axisKey, scaleId, raw) => { const read = scales.parse(scaleId, raw, {}); return addValue(options, axisKey, scales.format(read.value), { stored: read.value }).options; };
  let o = addAxis(emptyOptionsForm(), { label: "Colour", display: "button" });
  o = addValue(o, "colour", "Black").options;
  o = addAxis(o, { label: "Storage", display: "button", scale: "storage" });
  o = typed(o, "storage", "storage", "128gb");
  o = typed(o, "storage", "storage", "1024 GB");
  o.rows[0].price = "20000.50";
  o.rows[0].stock = "4";
  const payload = optionsPayload(o, true);
  assert.equal(payload.axes[1].scale, "storage");

  const id = await newItem();
  await save(asA, id, base({ options: payload }));
  const mine = await sellerRead(id);
  assert.equal(mine.axes[1].scale, "storage");
  assert.deepEqual(mine.axes[1].values.map((v) => v.stored), [{ scale: "storage", value: 128, unit: "GB" }, { scale: "storage", value: 1024, unit: "GB" }]);
  assert.equal("scale" in mine.axes[0], false);
  assert.equal(mine.variants.length, 2);
  assert.deepEqual([mine.variants[0].price, mine.variants[0].stock], [20000.5, 4]);

  // the editor reads it back and a save without changes sends the same axes
  const again = optionsPayload(optionsFromServer(mine), true);
  assert.deepEqual(again.axes, payload.axes);
  await save(asA, id, base({ options: again }));
  assert.deepEqual((await sellerRead(id)).axes, mine.axes);
  assert.equal((await publicRead(id)).options[1].scale, "storage");

  // and the buyer's product list carries those sizes
  const snap = (await as(anon, `select products_snapshot(100) as s`))[0].s;
  assert.deepEqual(snap.items.find((i) => i.id === id).size_values, [{ scale: "storage", value: 128, unit: "GB" }, { scale: "storage", value: 1024, unit: "GB" }]);
});

test("an older seller save with no scale data still works, and an item with the old flat options converts through the editor's own functions", async () => {
  const { optionsPayload, optionsFromServer } = await import("../../shared/src/index.js");
  const id = await newItem();
  await sql(c, `update items set variants = $2::jsonb where id = $1`, [id, JSON.stringify([{ id: "small", label: "Small", price: 1000, stock: 3 }, { id: "large", label: "Large", price: 1500 }])]);

  const read = await sellerRead(id);
  assert.equal(read.fromLegacy, true);
  assert.equal(read.axes[0].key, "option");
  const form = optionsFromServer(read);
  form.rows.find((r) => r.choice.option === "large").price = "1600";
  const payload = optionsPayload(form, true);
  assert.ok(payload.axes.every((a) => !("scale" in a)), "an axis with no scale sends none");
  await save(asA, id, base({ options: payload }));

  const after = await sellerRead(id);
  assert.equal(after.fromLegacy, false);
  assert.deepEqual(after.variants.map((v) => [v.choice.option, v.price, v.stock]), [["small", 1000, 3], ["large", 1600, null]]);
  assert.deepEqual((await sql(c, `select variants from items where id = $1`, [id]))[0].variants, [], "the old flat list is emptied");
});

test("public_item_size_values lists every live item that has sizes, matches the snapshot, and hides items that are not public", async () => {
  const shoes = await newItem();
  await save(asA, shoes, withShoes());
  const mug = await newItem(ids.bizA, { name: "Mug" });
  const hidden = await newItem(ids.bizA, { name: "Hidden shoes", visible: false });
  await sql(c, `update items set option_axes = $2::jsonb where id = $1`, [hidden, JSON.stringify(shoeAxes())]);

  const all = (await as(anon, `select public_item_size_values() as s`))[0].s;
  assert.deepEqual(Object.keys(all), [shoes], "only the live item with sizes");
  assert.equal(all[mug], undefined);
  assert.equal(all[hidden], undefined);

  const snap = (await as(anon, `select products_snapshot(100) as s`))[0].s;
  assert.deepEqual(snap.items.find((i) => i.id === shoes).size_values, all[shoes], "the same answer as the snapshot");

  assert.deepEqual((await as(anon, `select public_item_size_values(0) as s`))[0].s, all, "a silly limit is clamped to at least one item");
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  assert.deepEqual((await as(anon, `select public_item_size_values() as s`))[0].s, {}, "a shop that is not live shows nothing");
});

test("item_size_values_from_axes ignores axes without a scale and malformed input, and caps at 60 values", async () => {
  const one = async (axes) => (await sql(c, `select item_size_values_from_axes($1::jsonb) as s`, [JSON.stringify(axes)]))[0].s;
  assert.equal(await one([]), null);
  assert.equal(await one(null), null);
  assert.equal(await one({ not: "an array" }), null);
  assert.equal(await one([{ key: "c", label: "C", display: "button", values: [{ id: "a", label: "A" }] }]), null);
  assert.equal(await one([{ key: "s", scale: "shoe", values: "nope" }]), null);
  const many = Array.from({ length: 70 }, (_, i) => ({ id: `v${i}`, label: `v${i}`, stored: { scale: "count", value: i + 1 } }));
  assert.equal((await one([{ key: "n", scale: "count", values: many }])).length, 60);
});
