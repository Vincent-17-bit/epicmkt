// Migration 0117: reading quantity tiers back. Buyers see them only for public items; sellers only their own.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_tier_reads" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 20 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const T = [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }];
const T3 = [{ minQty: 1, maxQty: 49, unitPrice: 40 }, { minQty: 50, maxQty: null, unitPrice: 30 }];
const axes = [{ key: "paper", label: "Paper", display: "button", values: [{ id: "a4", label: "A4" }, { id: "a3", label: "A3" }] }];
const save = (fields) => tx(c, asA, (k) => sql(k, `select seller_save_item(null::uuid, $1::jsonb) as id`, [JSON.stringify(fields)]), { commit: true }).then((r) => r[0].id);
const read = (who, fn, id) => tx(c, who, (k) => sql(k, `select ${fn}($1) as r`, [id]))
  .then((r) => r[0].r);
const make = async (extra = {}) => {
  const id = await save({ name: "Printing", description: "", section: "Print", price_type: "from", price: 10, unit: "page", availability: "available", priceTiers: T, priceTierMode: "graduated",
    options: { axes, variants: [{ choice: { paper: "a4" }, price: 10 }, { choice: { paper: "a3" }, price: 40, priceTiers: T3 }] }, ...extra });
  await sql(c, `update items set visible = true, draft = false where id = $1`, [id]);
  return id;
};

test("the owner reads the item's tiers, mode and the tiers of the variants that have their own", async () => {
  const id = await make();
  const r = await read(asA, "seller_item_tiers", id);
  assert.deepEqual(r.tiers, T);
  assert.equal(r.mode, "graduated");
  assert.deepEqual(r.variants, [{ choice: { paper: "a3" }, tiers: T3 }]);
});

test("an item without tiers reads as null tiers and no variants", async () => {
  const id = await make({ priceTiers: null, options: undefined });
  assert.deepEqual(await read(asA, "seller_item_tiers", id), { tiers: null, mode: "graduated", variants: [] });
});

test("another shop cannot read them", async () => {
  const id = await make();
  await rejects(c, asB, `select seller_item_tiers($1)`, [id], /item_not_found/);
});

test("buyers read the tiers of a public item and nothing for a hidden one", async () => {
  const id = await make();
  const pub = await tx(c, { role: "anon" }, (k) => sql(k, `select public_item_tiers($1) as r`, [id]));
  assert.deepEqual(pub[0].r.tiers, T);
  assert.equal(pub[0].r.variants.length, 1);
  await sql(c, `update items set visible = false where id = $1`, [id]);
  assert.equal((await tx(c, { role: "anon" }, (k) => sql(k, `select public_item_tiers($1) as r`, [id])))[0].r, null);
});

test("the internal helper is not callable by buyers or sellers", async () => {
  const id = await make();
  await rejects(c, { role: "anon" }, `select item_tiers_json($1)`, [id], /permission denied/);
  await rejects(c, asA, `select item_tiers_json($1)`, [id], /permission denied/);
});
