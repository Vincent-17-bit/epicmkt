import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { validateTiers } from "../../shared/src/pricing/tiers.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_price_tiers" }));
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

const base = (o = {}) => ({ name: "Printing", description: "", section: "Print", price_type: "from", price: 10, price_max: null, sale_price: null, unit: "page", availability: "available", ...o });
const save = (id, fields, who = asA) => tx(c, who, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]), { commit: true }).then((r) => r[0].id);
const saveFails = (id, fields, pattern, who = asA) => rejects(c, who, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const row = async (id) => (await sql(c, `select price_tiers, price_tier_mode, price_type from items where id = $1`, [id]))[0];
const variants = (id) => sql(c, `select choice, price_tiers from item_variants where item_id = $1 order by sort`, [id]);
const flash = async (itemId) => {
  await sql(c, `update items set visible = true, draft = false where id = $1`, [itemId]);
  return sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20)`, [ids.bizA, itemId]);
};

const T = [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }];
const T2 = [{ minQty: 1, maxQty: 49, unitPrice: 40 }, { minQty: 50, maxQty: null, unitPrice: 30 }];
const axes = [{ key: "paper", label: "Paper", display: "button", values: [{ id: "a4", label: "A4" }, { id: "a3", label: "A3" }] }];
const withOptions = (variants, extra = {}) => base({ options: { axes, variants }, ...extra });

const CASES = [
  T,
  [{ minQty: 1, maxQty: null, unitPrice: 12 }],
  [{ minQty: 1, maxQty: null, unitPrice: 0.5 }],
  [{ minQty: 1, maxQty: 10, unitPrice: 7 }, { minQty: 11, maxQty: null, unitPrice: 7 }],
  [],
  null,
  "x",
  {},
  [{ minQty: 2, maxQty: null, unitPrice: 5 }],
  [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 12, maxQty: null, unitPrice: 7 }],
  [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 10, maxQty: null, unitPrice: 7 }],
  [{ minQty: 1, maxQty: 10, unitPrice: 5 }, { minQty: 11, maxQty: null, unitPrice: 7 }],
  [{ minQty: 1, maxQty: 10, unitPrice: 10 }],
  [{ minQty: 1, maxQty: null, unitPrice: 10 }, { minQty: 11, maxQty: null, unitPrice: 7 }],
  [{ minQty: 1, maxQty: null, unitPrice: 0 }],
  [{ minQty: 1, maxQty: null, unitPrice: -3 }],
  [{ minQty: 1, maxQty: null, unitPrice: 1.005 }],
  [{ minQty: 1.5, maxQty: null, unitPrice: 5 }],
  [{ minQty: 1, unitPrice: 5 }],
  [{ minQty: 1, maxQty: null, unitPrice: 5, note: "x" }],
  [{ minQty: 1, maxQty: null, unitPrice: "5" }],
  [{ minQty: "1", maxQty: null, unitPrice: 5 }],
  [{ minQty: 1, maxQty: "9", unitPrice: 5 }],
  [{ minQty: 1, maxQty: 0, unitPrice: 5 }],
  [{ minQty: 1, maxQty: 1000001, unitPrice: 5 }, { minQty: 1000002, maxQty: null, unitPrice: 4 }],
  [{ minQty: 1, maxQty: null, unitPrice: 10000000000 }],
  [{ minQty: 1, maxQty: null, unitPrice: 9999999999.99 }],
  [1, 2],
  Array.from({ length: 10 }, (_, i) => ({ minQty: i + 1, maxQty: i === 9 ? null : i + 1, unitPrice: 20 - i })),
  Array.from({ length: 11 }, (_, i) => ({ minQty: i + 1, maxQty: i === 10 ? null : i + 1, unitPrice: 20 - i }))
];

test("price_tiers_valid agrees with validateTiers on every case", async () => {
  for (const tiers of CASES) {
    const [{ ok }] = await sql(c, `select price_tiers_valid($1::jsonb) as ok`, [JSON.stringify(tiers)]);
    assert.equal(ok, validateTiers(tiers).ok, JSON.stringify(tiers));
  }
});

test("an item without tiers saves as before", async () => {
  const id = await save(null, base({ price_type: "fixed" }));
  assert.deepEqual(await row(id), { price_tiers: null, price_tier_mode: "whole", price_type: "fixed" });
  await save(id, base({ price_type: "fixed", price: 12 }));
  assert.equal((await row(id)).price_tiers, null);
});

test("item tiers and mode are stored; a save without the keys leaves them alone", async () => {
  const id = await save(null, base({ priceTiers: T, priceTierMode: "graduated" }));
  assert.deepEqual(await row(id), { price_tiers: T, price_tier_mode: "graduated", price_type: "from" });
  await save(id, base({ price: 11 }));
  assert.deepEqual(await row(id), { price_tiers: T, price_tier_mode: "graduated", price_type: "from" });
  await save(id, base({ priceTierMode: "whole" }));
  assert.equal((await row(id)).price_tier_mode, "whole");
  await save(id, base({ priceTiers: null }));
  assert.equal((await row(id)).price_tiers, null);
});

test("invalid tiers and modes are refused and nothing is saved", async () => {
  await saveFails(null, base({ priceTiers: [{ minQty: 2, maxQty: null, unitPrice: 5 }] }), /invalid_price_tiers/);
  await saveFails(null, base({ priceTiers: [] }), /invalid_price_tiers/);
  await saveFails(null, base({ priceTiers: "x" }), /invalid_price_tiers/);
  await saveFails(null, base({ priceTierMode: "stepped" }), /invalid_price_tiers/);
  await saveFails(null, base({ priceTierMode: null }), /invalid_price_tiers/);
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 0);
  const id = await save(null, base({ priceTiers: T }));
  await saveFails(id, base({ priceTiers: [{ minQty: 1, maxQty: null, unitPrice: -1 }] }), /invalid_price_tiers/);
  assert.deepEqual((await row(id)).price_tiers, T);
});

test("the database refuses bad tiers written any other way", async () => {
  const id = await save(null, base());
  await assert.rejects(sql(c, `update items set price_tiers = '[]'::jsonb where id = $1`, [id]), /items_price_tiers_ck/);
  await assert.rejects(sql(c, `update items set price_tier_mode = 'x' where id = $1`, [id]), /items_price_tier_mode_ck/);
});

test("an item with tiers must be priced from", async () => {
  await saveFails(null, base({ price_type: "fixed", priceTiers: T }), /tiers_need_from_price/);
  const id = await save(null, base({ priceTiers: T }));
  await saveFails(id, base({ price_type: "fixed" }), /tiers_need_from_price/);
  assert.equal((await row(id)).price_type, "from");
});

test("variant tiers are stored by combination; absent leaves them, null clears", async () => {
  const id = await save(null, withOptions([{ choice: { paper: "a4" }, price: 10 }, { choice: { paper: "a3" }, price: 40, priceTiers: T2 }], { priceTiers: T }));
  assert.deepEqual((await variants(id)).map((r) => r.price_tiers), [null, T2]);
  assert.deepEqual((await row(id)).price_tiers, T);
  await save(id, withOptions([{ choice: { paper: "a4" }, price: 10, priceTiers: T }, { choice: { paper: "a3" }, price: 40 }]));
  assert.deepEqual((await variants(id)).map((r) => r.price_tiers), [T, T2]);
  await save(id, withOptions([{ choice: { paper: "a4" }, price: 10 }, { choice: { paper: "a3" }, price: 40, priceTiers: null }]));
  assert.deepEqual((await variants(id)).map((r) => r.price_tiers), [T, null]);
});

test("a variant with bad tiers is refused", async () => {
  await saveFails(null, withOptions([{ choice: { paper: "a4" }, price: 10, priceTiers: [{ minQty: 1, maxQty: 5, unitPrice: 4 }] }]), /invalid_price_tiers/);
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 0);
});

test("variant tiers on an item priced fixed are refused", async () => {
  await saveFails(null, withOptions([{ choice: { paper: "a4" }, price: 10, priceTiers: T }], { price_type: "fixed" }), /tiers_need_from_price/);
});

test("tiers cannot change during a scheduled or live flash sale, other edits can", async () => {
  const id = await save(null, base({ priceTiers: T, priceTierMode: "whole" }));
  await flash(id);
  await saveFails(id, base({ priceTiers: T2 }), /item_in_flash_sale/);
  await saveFails(id, base({ priceTierMode: "graduated" }), /item_in_flash_sale/);
  await saveFails(id, base({ priceTiers: null }), /item_in_flash_sale/);
  assert.deepEqual((await row(id)).price_tiers, T);
  await save(id, base({ priceTiers: T, priceTierMode: "whole", description: "new" }));
  assert.equal((await sql(c, `select description from items where id = $1`, [id]))[0].description, "new");
});

test("variant tiers cannot change during a flash sale", async () => {
  const id = await save(null, withOptions([{ choice: { paper: "a4" }, price: 10 }, { choice: { paper: "a3" }, price: 40, priceTiers: T2 }]));
  await flash(id);
  await saveFails(id, withOptions([{ choice: { paper: "a4" }, price: 10 }, { choice: { paper: "a3" }, price: 40, priceTiers: T }]), /item_in_flash_sale/);
  assert.deepEqual((await variants(id)).map((r) => r.price_tiers), [null, T2]);
  await save(id, withOptions([{ choice: { paper: "a4" }, price: 10 }, { choice: { paper: "a3" }, price: 40, priceTiers: T2 }]));
});

test("another shop cannot save tiers onto my item", async () => {
  const id = await save(null, base({ priceTiers: T }));
  await saveFails(id, base({ priceTiers: T2 }), /item_not_found/, asB);
  assert.deepEqual((await row(id)).price_tiers, T);
});
