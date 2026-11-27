// Migration 0159: each option combination can carry its own unit ("per jar of 48"). Saved by seller_save_item, read back by the
// seller's and the buyer's reads, copied by seller_duplicate_item. null means "use the item's unit".
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_variant_unit" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const newItem = async (extra = {}) => {
  const f = { name: "Royco cubes", price: 10, price_type: "fixed", unit: "per 3 cubes", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [ids.bizA, ...Object.values(f)]))[0].id;
};
const base = (o = {}) => ({ name: "Royco cubes", description: "", section: "Pantry", price_type: "fixed", price: 10, price_max: null, sale_price: null, unit: "per 3 cubes", availability: "available", ...o });
const save = (id, fields) => as(asA, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const saveFails = (id, fields, pattern) => rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const sellerRead = (id) => as(asA, `select seller_item_options($1) as r`, [id]).then((r) => r[0].r);
const publicRead = (id) => as({ role: "anon" }, `select public_item_options($1) as r`, [id]).then((r) => r[0].r);
const unitsOf = (id) => sql(c, `select combo_key, unit from item_variants where item_id = $1 order by sort`, [id]).then((rows) => Object.fromEntries(rows.map((r) => [r.combo_key, r.unit])));

const axes = () => [{ key: "size", label: "Size", display: "button", values: [{ id: "cubes", label: "3 Cubes" }, { id: "pack", label: "Whole Pack" }, { id: "jar", label: "Whole Jar" }] }];
const v = (size, extra = {}) => ({ choice: { size }, ...extra });
const withOptions = (variants) => base({ options: { axes: axes(), variants } });

test("a unit is saved per combination and read back by the seller and the buyer; no unit reads as null", async () => {
  const id = await newItem();
  await save(id, withOptions([v("cubes", { price: 10 }), v("pack", { price: 130, unit: "  per pack of 40 " }), v("jar", { price: 160, unit: "per jar of 48" })]));
  assert.deepEqual(await unitsOf(id), { "size=cubes": null, "size=pack": "per pack of 40", "size=jar": "per jar of 48" });

  const mine = await sellerRead(id);
  assert.deepEqual(mine.variants.map((x) => x.unit), [null, "per pack of 40", "per jar of 48"]);

  const pub = await publicRead(id);
  assert.deepEqual(pub.optionVariants.map((x) => [x.choice.size, x.price, x.unit]), [["cubes", 10, null], ["pack", 130, "per pack of 40"], ["jar", 160, "per jar of 48"]]);
});

test("a save without the unit key leaves units alone; null or blank clears one", async () => {
  const id = await newItem();
  await save(id, withOptions([v("cubes", { price: 10, unit: "per 3 cubes" }), v("jar", { price: 160, unit: "per jar of 48" })]));
  await save(id, withOptions([v("cubes", { price: 11 }), v("jar", { price: 161 })]));
  assert.deepEqual(await unitsOf(id), { "size=cubes": "per 3 cubes", "size=jar": "per jar of 48" }, "a client that does not send unit changes nothing");

  await save(id, withOptions([v("cubes", { price: 11, unit: null }), v("jar", { price: 161, unit: "   " })]));
  assert.deepEqual(await unitsOf(id), { "size=cubes": null, "size=jar": null });
});

test("a unit that is not text, or is longer than 30 characters, is refused and nothing is written", async () => {
  const id = await newItem();
  await save(id, withOptions([v("cubes", { price: 10, unit: "per 3 cubes" })]));
  for (const unit of [5, true, ["x"], { a: 1 }, "x".repeat(31)]) {
    await saveFails(id, withOptions([v("cubes", { price: 99, unit })]), /invalid_variant/);
  }
  assert.deepEqual(await unitsOf(id), { "size=cubes": "per 3 cubes" });
  assert.equal((await sql(c, `select price from item_variants where item_id = $1`, [id]))[0].price, "10.00", "the failed saves changed no price either");
  await save(id, withOptions([v("cubes", { price: 10, unit: "x".repeat(30) })]));
});

test("the table itself refuses an untrimmed or empty unit", async () => {
  const id = await newItem();
  await save(id, withOptions([v("cubes", { price: 10 })]));
  for (const bad of [" per jar", "", "x".repeat(31)]) {
    await assert.rejects(sql(c, `update item_variants set unit = $2 where item_id = $1`, [id, bad]), /item_variants_unit_ck/);
  }
});

test("removing a combination removes its unit, and a duplicate keeps the units", async () => {
  const id = await newItem();
  await save(id, withOptions([v("cubes", { price: 10, unit: "per 3 cubes" }), v("jar", { price: 160, unit: "per jar of 48" })]));
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [id]))[0].id;
  assert.deepEqual(await unitsOf(copy), { "size=cubes": "per 3 cubes", "size=jar": "per jar of 48" });
  assert.deepEqual(await unitsOf(id), { "size=cubes": "per 3 cubes", "size=jar": "per jar of 48" }, "the original is untouched");

  await save(id, withOptions([v("cubes", { price: 10 })]));
  assert.deepEqual(await unitsOf(id), { "size=cubes": "per 3 cubes" });
});

test("an item without options, and an item on the old variants list, read exactly as before", async () => {
  const plain = await newItem();
  assert.deepEqual((await publicRead(plain)).optionVariants, []);
  assert.deepEqual((await sellerRead(plain)).variants, []);
});
