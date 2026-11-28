// Migrations 0161 and 0162: prices keep their cents, and a change to a size's price goes to the item's History.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
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

test("a price with cents is kept exactly: 210.99 stays 210.99 on an item, its sale price and a size", async () => {
  const id = await newItem();
  await save(id, base({ price: "210.99", sale_price: "199.50" }));
  const r = (await sql(c, `select price::text as price, sale_price::text as sale, price_min::text as lo from items where id = $1`, [id]))[0];
  assert.deepEqual(r, { price: "210.99", sale: "199.50", lo: "199.50" });
  await save(id, withOptions([v("beef", "cubes", { price: "10.50" }), v("beef", "jar", { price: "210.99", salePrice: "205.25" })]));
  const vs = await sql(c, `select combo_key, price::text as price, sale_price::text as sale from item_variants where item_id = $1 order by sort`, [id]);
  assert.deepEqual(vs.map((x) => [x.price, x.sale]), [["10.50", null], ["210.99", "205.25"]]);
  assert.equal((await sql(c, `select price_min::text as lo, price_high::text as hi from items where id = $1`, [id]))[0].lo, "10.50");
});

test("a flash sale keeps cents: 10% off 210.99 is 189.89, and a fixed sale price of 99.99 stays 99.99", async () => {
  const q = async (t, val, reg) => (await sql(c, `select flash_discounted_price($1, $2::numeric, $3::numeric)::text as p`, [t, val, reg]))[0].p;
  assert.equal(await q("percent", 10, 210.99), "189.89");
  assert.equal(await q("sale_price", 99.99, 210.99), "99.99");
  assert.equal(await q("amount_off", 0.5, 210.99), "210.49");
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

test("a flash sale on one size keeps cents in the price range, and the other sizes are untouched", async () => {
  const id = await newItem();
  await save(id, withOptions([v("beef", "cubes", { price: "210.99" }), v("beef", "jar", { price: "400.50" })]));
  const [lo] = await sql(c, `select price_min::text as lo, price_high::text as hi from items where id = $1`, [id]);
  assert.deepEqual(lo, { lo: "210.99", hi: "400.50" });
});
