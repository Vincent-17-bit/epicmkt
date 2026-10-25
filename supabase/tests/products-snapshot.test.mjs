import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { connect, createDatabase, ids, seedFixtures } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_products_snapshot" }));
  await seedFixtures(c);
  await c.query("update public.businesses set paid_until = now() + interval '30 days'");
  await c.query(`
    insert into public.items (id, business_id, name, description, price, price_type, availability, created_at) values
      ('20000000-0000-0000-0000-000000000001', '${ids.bizA}', 'Old loaf', 'old', 100, 'fixed', 'available', '2026-01-01T00:00:00Z'),
      ('20000000-0000-0000-0000-000000000002', '${ids.bizA}', 'New loaf', repeat('x', 500), 200, 'fixed', 'available', '2026-02-01T00:00:00Z'),
      ('20000000-0000-0000-0000-000000000003', '${ids.bizB}', 'Hidden', 'h', 50, 'fixed', 'available', '2026-03-01T00:00:00Z');
    update public.items set visible = false where id = '20000000-0000-0000-0000-000000000003';
  `);
});
after(async () => c?.end());

const snapshot = async (limit) => (await c.query("select public.products_snapshot($1) as s", [limit])).rows[0].s;

test("returns public items newest first with slim columns and only their stores", async () => {
  const s = await snapshot(100);
  assert.deepEqual(s.items.map((i) => i.name), ["New loaf", "Old loaf"]);
  assert.equal(s.truncated, false);
  assert.equal(s.items[0].description.length, 160);
  assert.ok(!("image_paths" in s.items[0]) && !("video_paths" in s.items[0]));
  assert.deepEqual(s.businesses.map((b) => b.id), [ids.bizA]);
});

test("caps the list and says when it did", async () => {
  const s = await snapshot(1);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].name, "New loaf");
  assert.equal(s.truncated, true);
});

test("carries a running flash sale already priced by the database", async () => {
  await c.query(`
    insert into public.flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value)
    values ('${ids.bizA}', '20000000-0000-0000-0000-000000000001', now(), now() + interval '1 hour', 'percent', 20)
  `);
  const s = await snapshot(100);
  const sale = s.items.find((i) => i.name === "Old loaf");
  assert.ok(sale.sale_id, "the running sale is attached");
  assert.equal(Number(sale.sale_price), 80);
  assert.equal(s.items.find((i) => i.name === "New loaf").sale_id, null);
});

test("anon can run it and only sees what the public views show", async () => {
  await c.query("set role anon");
  try {
    const s = await snapshot(100);
    assert.equal(s.items.length, 2);
  } finally {
    await c.query("reset role");
  }
});
