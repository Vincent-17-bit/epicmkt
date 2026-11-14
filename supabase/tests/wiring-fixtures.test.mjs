// Prompt 11.1 / migration 0113: the hooks the groups left, joined. The phone, SanDisk, bread and printing fixtures are saved through
// seller_save_item and read back with prices, tiers, media and spec issues.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { storedOptions } from "../../shared/src/seller/options.js";
import { phone } from "../../shared/src/contracts/fixtures/phone.js";
import { memoryCard } from "../../shared/src/contracts/fixtures/memoryCard.js";
import { bread } from "../../shared/src/contracts/fixtures/bread.js";
import { printing } from "../../shared/src/contracts/fixtures/printing.js";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA } from "./db.mjs";

let c;
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_wiring" })); await seedFixtures(c); await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items; delete from product_relations`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const as = (text, params) => tx(c, asA, (k) => sql(k, text, params), { commit: true });
const call = (fn, id, f) => as(`select ${fn}($1::uuid, $2::jsonb) as r`, [id, JSON.stringify(f)]).then((r) => r[0].r);
const stored = (spec) => {
  const r = storedOptions({ axes: spec.axes.map((a) => (a.dependsOn ? { ...a, dependsOn: a.dependsOn.axis } : a)),
    variants: spec.variants.map(({ key, id, dimensions, weightGrams, priceTiers, ...v }) => v) });
  assert.ok(r.ok, JSON.stringify(r));
  const tiers = new Map(spec.variants.filter((v) => v.priceTiers).map((v) => [JSON.stringify(v.choice), v.priceTiers]));
  return { axes: r.value.axes, variants: r.value.variants.map(({ key, ...v }) => (tiers.has(JSON.stringify(v.choice)) ? { ...v, priceTiers: tiers.get(JSON.stringify(v.choice)) } : v)) };
};
const fromSpec = (spec, extra = {}) => ({
  name: spec.name, description: spec.description ?? "", section: spec.section ?? "Shop", price_type: spec.priceTiers ? "from" : "fixed", price: spec.variants?.[0]?.price ?? 100,
  price_max: null, sale_price: null, unit: spec.unit ?? null, availability: "available", track_stock: false, stock_count: null, low_stock_threshold: 3, show_stock_count: false,
  brand: spec.brand ?? null, productTypeId: spec.productType,
  options: stored(spec),
  ...(spec.priceTiers ? { priceTiers: spec.priceTiers, priceTierMode: "whole" } : {}), ...extra
});
const item = async (id) => (await sql(c, `select price_min, price_high, has_options, product_type_id, department_id, price_tiers, option_axes from items where id = $1`, [id]))[0];
const variantsOf = (id) => sql(c, `select choice, price, price_tiers from item_variants where item_id = $1 order by sort`, [id]);

test("phone: Black 25,000 and Grey 24,000 are stored, and the list columns follow", async () => {
  const id = await call("seller_save_item", null, fromSpec(phone()));
  const v = await variantsOf(id);
  assert.equal(Number(v.find((x) => x.choice.colour === "grey" && x.choice.storage === "128-gb").price), 24000);
  assert.equal(Number(v.find((x) => x.choice.colour === "black" && x.choice.storage === "128-gb").price), 25000);
  const row = await item(id);
  assert.equal(Number(row.price_min), 24000);
  assert.equal(row.has_options, true);
  assert.equal(row.product_type_id, "phone");
  assert.ok(row.department_id, "the department column follows the type");
});

test("SanDisk: the dependent capacity lists are stored per style", async () => {
  const id = await call("seller_save_item", null, fromSpec(memoryCard()));
  const row = await item(id);
  const cap = row.option_axes.find((a) => a.key === "capacity");
  assert.equal(cap.dependsOn, "style");
  const v = await variantsOf(id);
  const usb = v.filter((x) => x.choice.style === "usb");
  const ssd = v.filter((x) => x.choice.style === "ssd");
  assert.ok(usb.length && ssd.length);
  assert.ok(!usb.some((x) => x.choice.capacity === "2-tb") && ssd.some((x) => x.choice.capacity === "2-tb"));
});

test("bread: weight and kind, and the lowest price is the list price", async () => {
  const id = await call("seller_save_item", null, fromSpec(bread()));
  const row = await item(id);
  assert.equal(Number(row.price_min), Math.min(...(await variantsOf(id)).map((x) => Number(x.price))));
  assert.equal(row.product_type_id, "bread");
});

test("printing: item tiers and the A3 tiers of one combination are both stored", async () => {
  const id = await call("seller_save_item", null, fromSpec(printing()));
  const row = await item(id);
  assert.equal(row.price_tiers.length, 3);
  const a3 = (await variantsOf(id)).find((x) => x.choice.paper === "a3");
  assert.equal(a3.price_tiers.length, 3);
  assert.equal(Number(a3.price_tiers[0].unitPrice), 40);
});

test("publish check: the spec issues come back for a typed item, and an untyped one is untouched", async () => {
  const typed = await call("seller_check_item", null, { ...fromSpec(phone()), publish: true });
  assert.ok(typed.spec, "a typed item carries the spec result");
  assert.ok(Array.isArray(typed.issues));
  const legacy = await call("seller_check_item", null, { name: "Plain", description: "", section: "S", price_type: "fixed", price: 50, availability: "available", track_stock: false, publish: true });
  assert.equal(legacy.ok, true);
  assert.ok(!legacy.issues.some((i) => String(i.code).startsWith("media3d_")));
});

test("seller_check_item reports a 3D view with no poster, as a warning that does not block", async () => {
  const id = await call("seller_save_item", null, fromSpec(phone()));
  await sql(c, `insert into item_media (item_id, business_id, kind, role, path, mime) values ($1, $2, 'model', 'model-glb', $3, 'model/gltf-binary')`, [id, ids.bizA, `${ids.bizA}/${id}/m.glb`]);
  const r = await call("seller_check_item", id, { ...fromSpec(phone()), publish: true });
  const w = r.issues.find((i) => i.code === "media3d_view3d_missing_poster");
  assert.ok(w, JSON.stringify(r.issues));
  assert.equal(w.level, "warning");
});

test("an option value's media must be a photo or video, not a 3D row", async () => {
  const id = await call("seller_save_item", null, fromSpec(phone()));
  const [m] = await sql(c, `insert into item_media (item_id, business_id, kind, role, path, mime) values ($1, $2, 'poster', 'poster', $3, 'image/jpeg') returning id`, [id, ids.bizA, `${ids.bizA}/${id}/p.jpg`]);
  const f = fromSpec(phone());
  f.options.axes[0].values[0].mediaId = m.id;
  await assert.rejects(() => call("seller_save_item", id, f));
});

test("media option ids follow the item: a removed value is dropped from its photos", async () => {
  const id = await call("seller_save_item", null, fromSpec(phone()));
  await sql(c, `insert into item_media (item_id, business_id, kind, role, path, mime, option_ids) values ($1, $2, 'image', 'image', $3, 'image/jpeg', '{grey,black}')`, [id, ids.bizA, `${ids.bizA}/${id}/a.jpg`]);
  const f = fromSpec(phone());
  f.options.axes[0].values = f.options.axes[0].values.filter((v) => v.id !== "grey");
  f.options.variants = f.options.variants.filter((v) => v.choice.colour !== "grey");
  await call("seller_save_item", id, f);
  assert.deepEqual((await sql(c, `select option_ids from item_media where item_id = $1`, [id]))[0].option_ids, ["black"]);
});

test("relations: a missing target is refused, and removing a type removes its relations", async () => {
  await assert.rejects(() => sql(c, `insert into product_relations (from_kind, from_id, to_kind, to_id) values ('type', 'phone', 'type', 'no-such-type')`), /relation_target_missing/);
  await sql(c, `insert into product_types (id, slug, name) values ('tmp-type', 'tmp-type', 'Tmp')`);
  await sql(c, `insert into product_relations (from_kind, from_id, to_kind, to_id) values ('type', 'phone', 'type', 'tmp-type')`);
  await sql(c, `delete from product_types where id = 'tmp-type'`);
  assert.equal((await sql(c, `select count(*)::int as n from product_relations`))[0].n, 0);
});

test("a legacy item (no type, no options) saves and reads exactly as before", async () => {
  const id = await call("seller_save_item", null, { name: "Plain", description: "", section: "S", price_type: "fixed", price: 50, price_max: null, sale_price: null, unit: null, availability: "available", track_stock: false, stock_count: null, low_stock_threshold: 3, show_stock_count: false });
  const row = await item(id);
  assert.equal(row.has_options, false); assert.equal(row.product_type_id, null);
});
