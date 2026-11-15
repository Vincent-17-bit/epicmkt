// Migration 0119 (B21): bulk set-type for items without a type.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_set_item_types" }));
  await seedFixtures(c);
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('cyber', 'Cyber cafe', 'Services', 'A', 2)`);
  await sql(c, `update businesses set category_id = 'cyber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const add = async (biz, name, { live = false, type = null, price = 1500, stock = 7 } = {}) => {
  const id = (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft, track_stock, stock_count, product_type_id) values ($1, $2, $3, 'fixed', false, true, true, $4, $5) returning id`, [biz, name, price, stock, type]))[0].id;
  if (live) {
    await sql(c, `alter table items disable trigger items_spec_gate`);
    await sql(c, `update items set draft = false, visible = true, spec_gate_exempt = true where id = $1`, [id]);
    await sql(c, `alter table items enable trigger items_spec_gate`);
  }
  return id;
};
const run = (who, list, type) => tx(c, who, (k) => sql(k, `select seller_set_item_types($1::uuid[], $2) as r`, [list, type]), { commit: true }).then((r) => r[0].r);
const row = (id) => sql(c, `select product_type_id, price, stock_count, visible, draft from items where id = $1`, [id]).then((r) => r[0]);

test("drafts take the type and price and stock stay exactly as they were", async () => {
  const a = await add(ids.bizA, "Draft one"), b = await add(ids.bizA, "Draft two", { price: 99, stock: 2 });
  const out = await run(asA, [a, b], "phone");
  assert.equal(out.updated, 2);
  assert.deepEqual(out.skipped, []);
  const one = await row(a);
  assert.equal(one.product_type_id, "phone");
  assert.equal(Number(one.price), 1500);
  assert.equal(one.stock_count, 7);
  assert.equal(Number((await row(b)).price), 99);
});

test("an item that already has a type is left alone", async () => {
  const a = await add(ids.bizA, "Has type", { type: "table" });
  const out = await run(asA, [a], "phone");
  assert.equal(out.updated, 0);
  assert.deepEqual(out.skipped, [{ id: a, reason: "has_type" }]);
  assert.equal((await row(a)).product_type_id, "table");
});

test("another shop's item is not found, never changed", async () => {
  const b = await add(ids.bizB, "Theirs");
  const out = await run(asA, [b], "phone");
  assert.deepEqual(out.skipped, [{ id: b, reason: "not_found" }]);
  assert.equal((await row(b)).product_type_id, null);
});

test("a live item that would break the publish gate is skipped and stays live", async () => {
  const types = await sql(c, `select id from product_types where active and jsonb_array_length(coalesce(spec_rows, '[]'::jsonb)) > 0 and exists (select 1 from jsonb_array_elements(spec_rows) r where r ->> 'level' = 'required') limit 1`);
  assert.ok(types.length, "the seed has a type with a required row");
  const live = await add(ids.bizA, "Live item", { live: true });
  const draft = await add(ids.bizA, "Draft item");
  const out = await run(asA, [live, draft], types[0].id);
  assert.equal(out.updated, 1);
  assert.deepEqual(out.skipped, [{ id: live, reason: "needs_details" }]);
  const after = await row(live);
  assert.equal(after.product_type_id, null);
  assert.equal(after.visible, true);
  assert.equal((await row(draft)).product_type_id, types[0].id);
});

test("it checks the type and the list", async () => {
  const a = await add(ids.bizA, "Draft");
  await rejects(c, asA, `select seller_set_item_types($1::uuid[], 'no-such-type')`, [[a]], /unknown_product_type/);
  await rejects(c, asA, `select seller_set_item_types('{}'::uuid[], 'phone')`, [], /no_items/);
  await rejects(c, { role: "anon" }, `select seller_set_item_types($1::uuid[], 'phone')`, [[a]], /permission denied|not_a_seller|jwt/i);
});
