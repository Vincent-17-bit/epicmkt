// Migration 0161: prices are whole shillings, and a change to a size's price goes to the item's History.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_whole_prices" }));
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
const history = (id) => sql(c, `select field, old_value, new_value, actor_role from item_history where item_id = $1 and field like 'option\\_%' order by id`, [id]);

const axes = () => [
  { key: "flavour", label: "Flavour", display: "button", values: [{ id: "beef", label: "Beef" }, { id: "chicken", label: "Chicken" }] },
  { key: "size", label: "Size", display: "button", values: [{ id: "cubes", label: "3 Cubes" }, { id: "jar", label: "Whole Jar (48 x 4g)" }] },
];
const v = (flavour, size, extra = {}) => ({ choice: { flavour, size }, ...extra });
const withOptions = (variants, extra = {}) => base({ options: { axes: axes(), variants }, ...extra });
const grid = (jar = 160) => [v("beef", "cubes", { price: 10 }), v("beef", "jar", { price: jar }), v("chicken", "cubes", { price: 10 }), v("chicken", "jar", { price: jar })];

test("a price with cents is refused on an item, its range top, its sale price and on a size", async () => {
  const id = await newItem();
  await saveFails(id, base({ price: "10.50" }), /invalid_price/);
  await saveFails(id, base({ price_type: "range", price: 10, price_max: "20.5" }), /invalid_price/);
  await saveFails(id, base({ price: 100, sale_price: "99.99" }), /invalid_price/);
  await saveFails(id, withOptions([v("beef", "cubes", { price: "10.50" })]), /invalid_price/);
  await saveFails(id, withOptions([v("beef", "cubes", { price: 100, salePrice: "80.25" })]), /invalid_price/);
  assert.equal((await sql(c, `select price from items where id = $1`, [id]))[0].price, "10.00", "nothing was written");
  await save(id, base({ price: "10", sale_price: "8" }));
  assert.equal((await sql(c, `select price, sale_price from items where id = $1`, [id]))[0].sale_price, "8.00");
});

test("a direct write with cents is refused too, whichever function or tool did it", async () => {
  const id = await newItem();
  await assert.rejects(sql(c, `update items set price = 10.5 where id = $1`, [id]), /invalid_price/);
  await save(id, withOptions(grid()));
  await assert.rejects(sql(c, `update item_variants set price = 99.5 where item_id = $1`, [id]), /invalid_price/);
  await assert.rejects(newItem({ price: 1.25 }), /invalid_price/);
});

test("the clean-up in the migration rounds half up, keeps a sale below its price, and leaves whole prices alone", async () => {
  const text = readFileSync(new URL("../migrations/0161_whole_prices_option_history.sql", import.meta.url), "utf8");
  const cleanup = text.slice(text.indexOf("update public.items set"), text.indexOf("-- 2. Refuse cents"));
  const a = await newItem({ price: 10 });                                  // 10.60 with a 10.50 sale: both round to 11, so the sale steps down to 10
  const b = await newItem({ price: 10 });                                  // 99.50 with a 79.40 sale: 100 and 79
  const d = await newItem({ price: 10 });                                  // already whole: untouched
  const e = await newItem({ price: 10 });                                  // 0.40 rounds to 0 and a sale cannot be below 1: no sale
  await sql(c, `alter table items disable trigger t_items_whole_price`);
  await sql(c, `update items set price = 10.60, sale_price = 10.50 where id = $1`, [a]);
  await sql(c, `update items set price = 99.50, sale_price = 79.40, price_type = 'range', price_max = 150.50 where id = $1`, [b]);
  await sql(c, `update items set price = 250, sale_price = 200 where id = $1`, [d]);
  await sql(c, `update items set price = 0.40, sale_price = 0.20 where id = $1`, [e]);
  await sql(c, `alter table items enable trigger t_items_whole_price`);
  const vid = await newItem();
  await save(vid, withOptions(grid()));
  await sql(c, `alter table item_variants disable trigger t_item_variants_whole_price`);
  await sql(c, `update item_variants set price = 160.50, sale_price = 160.20 where item_id = $1 and combo_key like '%jar'`, [vid]);
  await sql(c, `alter table item_variants enable trigger t_item_variants_whole_price`);

  await sql(c, cleanup);

  const row = async (id) => (await sql(c, `select price::float as price, sale_price::float as sale, price_max::float as max from items where id = $1`, [id]))[0];
  assert.deepEqual(await row(a), { price: 11, sale: 10, max: null });
  assert.deepEqual(await row(b), { price: 100, sale: 79, max: 151 });
  assert.deepEqual(await row(d), { price: 250, sale: 200, max: null });
  assert.deepEqual(await row(e), { price: 0, sale: null, max: null });
  const jars = await sql(c, `select price::float as price, sale_price::float as sale from item_variants where item_id = $1 and combo_key like '%jar'`, [vid]);
  assert.deepEqual(jars, [{ price: 161, sale: 160 }, { price: 161, sale: 160 }]);
  const cubes = await sql(c, `select price::float as price from item_variants where item_id = $1 and combo_key like '%cubes'`, [vid]);
  assert.deepEqual(cubes.map((r) => r.price), [10, 10]);
});

test("changing a size's price is logged with a readable name, and so is a sale price, a status and a unit", async () => {
  const id = await newItem();
  await save(id, withOptions(grid(160)));
  assert.deepEqual(await history(id), [], "creating the sizes with the item is not a change");

  await save(id, withOptions([v("beef", "cubes", { price: 10 }), v("beef", "jar", { price: 170, salePrice: 150 }), v("chicken", "cubes", { price: 10 }), v("chicken", "jar", { price: 160, status: "out_of_stock", unit: "per jar of 48" })]));
  const rows = await history(id);
  const by = Object.fromEntries(rows.map((r) => [r.field, r]));
  assert.equal(by["option_price:Beef / Whole Jar (48 x 4g)"].old_value, "160.00");
  assert.equal(by["option_price:Beef / Whole Jar (48 x 4g)"].new_value, "170.00");
  assert.equal(by["option_sale_price:Beef / Whole Jar (48 x 4g)"].new_value, "150.00");
  assert.equal(by["option_status:Chicken / Whole Jar (48 x 4g)"].new_value, "out_of_stock");
  assert.equal(by["option_unit:Chicken / Whole Jar (48 x 4g)"].new_value, "per jar of 48");
  assert.equal(rows.length, 4);
  assert.equal(rows[0].actor_role, "seller");
});

test("saving again without a change adds no history, and the seller's own history list returns the new rows", async () => {
  const id = await newItem();
  const same = withOptions(grid(160));
  await save(id, same);
  await save(id, same);
  await save(id, same);
  assert.deepEqual(await history(id), []);

  await save(id, withOptions(grid(175)));
  assert.equal((await history(id)).length, 2, "two jar sizes changed");
  const list = (await as(asA, `select seller_item_history($1) as r`, [id]))[0].r;
  assert.ok(list.entries.some((e) => e.field === "option_price:Beef / Whole Jar (48 x 4g)" && e.new_value === "175.00"));
});

test("adding a size to an item that already exists is logged; deleting the item still works", async () => {
  const id = await newItem();
  await save(id, withOptions([v("beef", "cubes", { price: 10 }), v("beef", "jar", { price: 160 })]));
  await save(id, withOptions([v("beef", "cubes", { price: 10 }), v("beef", "jar", { price: 160 }), v("chicken", "cubes", { price: 12 })]));
  const rows = await history(id);
  assert.deepEqual(rows.map((r) => [r.field, r.old_value, r.new_value]), [["option_price:Chicken / 3 Cubes", null, "12.00"]]);
  await sql(c, `delete from items where id = $1`, [id]);
  assert.equal((await sql(c, `select count(*)::int as n from item_variants where item_id = $1`, [id]))[0].n, 0);
});
