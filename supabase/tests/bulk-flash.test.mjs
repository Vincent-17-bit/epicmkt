import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const item = async (name, extra = {}) => {
  const f = { price: 1000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, name, ${keys.join(",")}) values ($1, $2, ${keys.map((_, i) => `$${i + 3}`).join(",")}) returning id`, [ids.bizA, name, ...Object.values(f)]))[0].id;
};
const flash = (itemId) => sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20) returning id`, [ids.bizA, itemId]).then((r) => r[0].id);
const bulk = (list, args) => tx(c, asA, (k) => sql(k, `select seller_bulk_items('price_percent', $1::uuid[], $2::jsonb) as r`, [list, JSON.stringify(args)]), { commit: true }).then((r) => r[0].r);
const price = async (id) => Number((await sql(c, `select price from items where id = $1`, [id]))[0].price);
const catalog = async () => (await tx(c, asA, (k) => sql(k, `select seller_catalog_items() as r`)))[0].r.items;

test("a percentage change skips items in a live flash sale and counts them as skipped", async () => {
  const a = await item("Fade");
  const b = await item("Beard");
  await flash(a);
  const r = await bulk([a, b], { percent: 10 });
  assert.deepEqual(r, { affected: 1, skipped: 1 });
  assert.equal(await price(a), 1000);
  assert.equal(await price(b), 1100);
});

test("a scheduled sale also protects the price", async () => {
  const a = await item("Fade");
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '1 day', now() + interval '2 days', 'percent', 20)`, [ids.bizA, a]);
  assert.deepEqual(await bulk([a], { percent: -10 }), { affected: 0, skipped: 1 });
  assert.equal(await price(a), 1000);
});

test("once the sale has ended the price can change again", async () => {
  const a = await item("Fade");
  const f = await flash(a);
  await tx(c, asA, (k) => sql(k, `select seller_end_flash_sale($1::uuid)`, [f]), { commit: true });
  assert.deepEqual(await bulk([a], { percent: 10 }), { affected: 1, skipped: 0 });
  assert.equal(await price(a), 1100);
});

test("a protected item cannot trigger price_too_large for the rest of the batch", async () => {
  const big = await item("Huge", { price: 9999999999 });
  const ok = await item("Small");
  await flash(big);
  assert.deepEqual(await bulk([big, ok], { percent: 10 }), { affected: 1, skipped: 1 });
});

test("other bulk actions still work on items in a flash sale", async () => {
  const a = await item("Fade");
  await flash(a);
  const r = await tx(c, asA, (k) => sql(k, `select seller_bulk_items('set_availability', $1::uuid[], '{"availability":"limited_stock"}'::jsonb) as r`, [[a]]), { commit: true });
  assert.equal(r[0].r.affected, 1);
});

test("the catalog tells the app which items are in a flash sale", async () => {
  const a = await item("Fade");
  const b = await item("Beard");
  await flash(a);
  const by = Object.fromEntries((await catalog()).map((i) => [i.id, i.in_flash_sale]));
  assert.deepEqual(by, { [a]: true, [b]: false });
});
