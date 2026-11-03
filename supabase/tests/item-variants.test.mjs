import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_variants" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 20 where category_id = 'barber'`);
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const full = (o = {}) => ({ name: "Fade cut", description: "", section: "Cuts", price_type: "fixed", price: 500, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const save = (id, fields) => tx(c, asA, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]), { commit: true }).then((r) => r[0].id);
const saveFails = (id, fields, pattern) => rejects(c, asA, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const stored = async (id) => (await sql(c, `select variants from items where id = $1`, [id]))[0].variants;
const publish = (id) => sql(c, `update items set visible = true, draft = false where id = $1`, [id]);
const publicVariants = async (id) => (await sql(c, `select variants from public_items where id = $1`, [id]))[0]?.variants;

const S = { id: "s", label: "Small", price: 500, stock: 4 };
const L = { id: "l", label: "Large", price: 800, stock: null };

test("variants are saved in order with their price and stock", async () => {
  const id = await save(null, full({ variants: [S, L] }));
  assert.deepEqual(await stored(id), [S, L]);
});

test("labels are trimmed and an item saved without the key keeps its variants", async () => {
  const id = await save(null, full({ variants: [{ ...S, label: "  Small  " }] }));
  assert.equal((await stored(id))[0].label, "Small");
  await save(id, full({ name: "Fade cut 2" }));
  assert.deepEqual(await stored(id), [S]);
});

test("sending an empty list or null clears them", async () => {
  const id = await save(null, full({ variants: [S] }));
  await save(id, full({ variants: [] }));
  assert.deepEqual(await stored(id), []);
  await save(id, full({ variants: [L] }));
  await save(id, full({ variants: null }));
  assert.deepEqual(await stored(id), []);
});

test("bad variants are refused", async () => {
  const bad = [
    "x",
    [{ ...S, id: "BAD ID" }],
    [{ ...S, label: "" }],
    [{ ...S, label: "x".repeat(41) }],
    [{ ...S, price: -1 }],
    [{ ...S, price: "5" }],
    [{ ...S, price: 1.234 }],
    [{ ...S, stock: 1.5 }],
    [{ ...S, stock: -2 }],
    [{ ...S, extra: 1 }],
    [S, { ...L, id: "s" }],
    [S, { ...L, label: "SMALL" }],
    Array.from({ length: 11 }, (_, i) => ({ id: `v${i}`, label: `L${i}`, price: 5, stock: null }))
  ];
  for (const variants of bad) await saveFails(null, full({ variants }), /invalid_variants|invalid_details/);
});

test("options need a fixed or a starting price", async () => {
  await save(null, full({ price_type: "from", variants: [S] }));
  for (const price_type of ["range", "free", "contact"]) await saveFails(null, full({ price_type, price: price_type === "range" ? 100 : null, price_max: price_type === "range" ? 200 : null, variants: [S] }), /invalid_variants/);
});

test("an item in a flash sale cannot have its options changed", async () => {
  const id = await save(null, full({ variants: [S] }));
  await publish(id);
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20)`, [ids.bizA, id]);
  await saveFails(id, full({ variants: [S, L] }), /item_in_flash_sale/);
  assert.equal(await save(id, full({ variants: [S] })), id);
});

test("customers see id, label and price, never stock, and a sold-out option is left out", async () => {
  const id = await save(null, full({ variants: [S, L, { id: "x", label: "Gone", price: 900, stock: 0 }] }));
  await publish(id);
  assert.deepEqual(await publicVariants(id), [
    { id: "s", label: "Small", price: 500 },
    { id: "l", label: "Large", price: 800 }
  ]);
});

test("an item without options shows an empty list, even when the column held an object", async () => {
  const id = await save(null, full());
  await publish(id);
  await sql(c, `update items set variants = '{}'::jsonb where id = $1`, [id]);
  assert.deepEqual(await publicVariants(id), []);
  assert.deepEqual((await save(id, full({ name: "Renamed" }))) && (await stored(id)), []);
});

test("another seller cannot touch the options", async () => {
  const id = await save(null, full({ variants: [S] }));
  await rejects(c, { sub: ids.userB }, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(full({ variants: [L] }))], /item_not_found/);
});
