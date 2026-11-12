import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priceBounds } from "../../shared/src/pricing.js";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA } from "./db.mjs";

let c;
const anon = { role: "anon" };

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_price_range" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = now() + interval '30 days'`);
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from audit_log; delete from items`);
});

const axes = [
  { key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "grey", label: "Grey" }] },
  { key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }, { id: "l", label: "L" }] }
];
const BLACK_S = "colour=black|size=s";
const BLACK_L = "colour=black|size=l";
const GREY_S = "colour=grey|size=s";
const GREY_L = "colour=grey|size=l";

const save = (id, fields) => tx(c, asA, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]), { commit: true }).then((r) => r[0].id);
const base = (o = {}) => ({ name: "Thing", description: "", section: "S", price_type: "fixed", price: 100, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const optioned = (variants, o = {}) => base({ price_type: "from", price: 20, options: { axes, variants }, ...o });
const live = (id) => sql(c, `update items set visible = true, draft = false where id = $1`, [id]);
const row = async (id) => {
  const r = (await sql(c, `select price_min, price_high, has_options, department_id, product_type_id, has_3d from items where id = $1`, [id]))[0];
  return { ...r, price_min: r.price_min === null ? null : Number(r.price_min), price_high: r.price_high === null ? null : Number(r.price_high) };
};
const range = async (id) => {
  const r = await row(id);
  return [r.price_min, r.price_high];
};
const four = (prices = [20, 30, 40, 50]) => [BLACK_S, BLACK_L, GREY_S, GREY_L].map((k, i) => ({ choice: Object.fromEntries(k.split("|").map((p) => p.split("="))), price: prices[i] }));
const flash = async (id, o = {}) => {
  await live(id);
  await tx(c, asA, (k) => sql(k, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value, variant_target, variant_overrides)
    values ($1, $2, now(), now() + interval '6 hours', $3, $4, $5, $6::jsonb)`, [ids.bizA, id, o.type ?? "percent", o.value ?? 20, o.target ?? "all", JSON.stringify(o.overrides ?? [])]), { commit: true });
};
const shift = (set) => tx(c, null, async (k) => {
  await k.query(`set local session_replication_role = replica`);
  await k.query(`update flash_sales set ${set}`);
}, { commit: true });
const T = [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }];

test("an item with no options: price_min = price_max = price", async () => {
  const id = await save(null, base({ price: 80 }));
  assert.deepEqual(await row(id), { price_min: 80, price_high: 80, has_options: false, department_id: null, product_type_id: null, has_3d: false });
  await save(id, base({ price: 95 }));
  assert.deepEqual(await range(id), [95, 95]);
});

test("a range price runs from the price to its top; a price on request has none", async () => {
  assert.deepEqual(await range(await save(null, base({ price_type: "range", price: 50, price_max: 90 }))), [50, 90]);
  assert.deepEqual(await range(await save(null, base({ price_type: "from", price: 50 }))), [50, 50]);
  const quote = (await sql(c, `insert into items (business_id, name, price_type, price) values ($1, 'On request', 'contact', null) returning id`, [ids.bizA]))[0].id;
  assert.deepEqual(await range(quote), [null, null]);
});

test("an item's own sale price is what a buyer can pay", async () => {
  const id = await save(null, base({ price: 100, sale_price: 70 }));
  assert.deepEqual(await range(id), [70, 70]);
});

test("an option item runs from its cheapest to its dearest combination", async () => {
  const id = await save(null, optioned(four()));
  assert.deepEqual(await row(id), { price_min: 20, price_high: 50, has_options: true, department_id: null, product_type_id: null, has_3d: false });
  await save(id, optioned(four([25, 30, 40, 60])));
  assert.deepEqual(await range(id), [25, 60]);
});

test("combinations that cannot be bought do not count, and the range follows status changes", async () => {
  const id = await save(null, optioned(four()));
  await sql(c, `update item_variants set status = 'out_of_stock' where item_id = $1 and combo_key = $2`, [id, BLACK_S]);
  assert.deepEqual(await range(id), [30, 50]);
  await sql(c, `update item_variants set status = 'unavailable' where item_id = $1 and combo_key = $2`, [id, GREY_L]);
  assert.deepEqual(await range(id), [30, 40]);
  await sql(c, `update item_variants set status = 'available' where item_id = $1`, [id]);
  assert.deepEqual(await range(id), [20, 50]);
  await sql(c, `delete from item_variants where item_id = $1 and combo_key = $2`, [id, BLACK_S]);
  assert.deepEqual(await range(id), [30, 50]);
});

test("a combination with no price of its own is not sold, so it does not count", async () => {
  const id = await save(null, optioned([{ choice: { colour: "black", size: "s" } }, { choice: { colour: "black", size: "l" }, price: 35 }], { price: 20 }));
  assert.deepEqual(await range(id), [35, 35]);
  const none = await save(null, optioned([{ choice: { colour: "black", size: "s" } }], { price: 20 }));
  assert.deepEqual(await range(none), [null, null]);
});

test("when every sold combination is out of stock the range still covers them", async () => {
  const id = await save(null, optioned(four()));
  await sql(c, `update item_variants set status = 'out_of_stock' where item_id = $1`, [id]);
  assert.deepEqual(await range(id), [20, 50]);
  await sql(c, `update item_variants set status = 'limited_stock' where item_id = $1 and combo_key = $2`, [id, GREY_L]);
  assert.deepEqual(await range(id), [50, 50]);
});

test("quantity tiers: a buyer of one pays the first tier price", async () => {
  const id = await save(null, base({ price_type: "from", price: 10, priceTiers: T }));
  assert.deepEqual(await range(id), [10, 10]);
  await save(id, base({ price_type: "from", price: 10, priceTiers: null }));
  assert.deepEqual(await range(id), [10, 10]);
});

test("a combination's own tiers count for that combination", async () => {
  const t2 = [{ minQty: 1, maxQty: 49, unitPrice: 40 }, { minQty: 50, maxQty: null, unitPrice: 30 }];
  const id = await save(null, optioned([{ choice: { colour: "black", size: "s" }, price: 20 }, { choice: { colour: "black", size: "l" }, price: 40, priceTiers: t2 }]));
  assert.deepEqual(await range(id), [20, 40]);
});

test("a live flash sale lowers the price, and ending it restores it", async () => {
  const id = await save(null, base({ price: 100 }));
  await flash(id, { type: "percent", value: 25 });
  assert.deepEqual(await range(id), [75, 75]);
  await sql(c, `update flash_sales set status = 'cancelled', ended_at = now(), ended_reason = 'seller'`);
  assert.deepEqual(await range(id), [100, 100]);
});

test("a flash sale on Black only changes price_min when Black is the cheapest to pay", async () => {
  const id = await save(null, optioned(four([40, 50, 30, 45])));
  await flash(id, { target: "chosen", overrides: [{ combo: BLACK_S, type: "percent", value: 50 }, { combo: BLACK_L, type: "percent", value: 10 }] });
  assert.deepEqual(await range(id), [20, 45]);
  await sql(c, `delete from flash_sales`);
  assert.deepEqual(await range(id), [30, 50]);
  await flash(id, { target: "chosen", overrides: [{ combo: BLACK_L, type: "percent", value: 10 }] });
  assert.deepEqual(await range(id), [30, 45], "45 is not below the cheapest 30");
});

test("a flash sale on all combinations lowers the price_min of an option item", async () => {
  const id = await save(null, optioned(four()));
  await flash(id, { type: "percent", value: 10 });
  assert.deepEqual(await range(id), [18, 45]);
});

test("a flash sale on a tiered item lowers the first tier price", async () => {
  const id = await save(null, base({ price_type: "from", price: 10, priceTiers: T }));
  await flash(id, { type: "percent", value: 20 });
  assert.deepEqual(await range(id), [8, 8]);
});

test("a scheduled sale changes nothing until the sweep makes it live", async () => {
  const id = await save(null, base({ price: 100 }));
  await live(id);
  await tx(c, asA, (k) => sql(k, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now() + interval '2 hours', now() + interval '5 hours', 'percent', 50)`, [ids.bizA, id]), { commit: true });
  assert.deepEqual(await range(id), [100, 100]);
  await shift(`starts_at = now() - interval '1 minute'`);
  await sql(c, `select flash_sales_sweep()`);
  assert.deepEqual(await range(id), [50, 50]);
  await shift(`ends_at = now() - interval '1 second'`);
  await sql(c, `select flash_sales_sweep()`);
  assert.deepEqual(await range(id), [100, 100]);
});

test("bulk price changes keep the range right", async () => {
  const id = await save(null, base({ price: 100 }));
  await sql(c, `update items set price = 120 where id = $1`, [id]);
  assert.deepEqual(await range(id), [120, 120]);
});

test("a seller cannot write the range columns directly", async () => {
  const id = await save(null, base({ price: 100 }));
  await tx(c, asA, (k) => sql(k, `update items set price_min = 1, price_high = 2, has_options = true, department_id = 'clothing' where id = $1`, [id]), { commit: true });
  assert.deepEqual(await row(id), { price_min: 100, price_high: 100, has_options: false, department_id: null, product_type_id: null, has_3d: false });
});

test("department follows the product type, and a department change reaches its items", async () => {
  const [t] = await sql(c, `select id, department_id from product_types where active and department_id is not null and restricted_to = '{}' limit 1`);
  const id = await save(null, base({ productTypeId: t.id }));
  assert.equal((await row(id)).product_type_id, t.id);
  assert.equal((await row(id)).department_id, t.department_id);
  const other = (await sql(c, `select id from departments where id <> $1 limit 1`, [t.department_id]))[0].id;
  await sql(c, `update product_types set department_id = $2 where id = $1`, [t.id, other]);
  assert.equal((await row(id)).department_id, other);
  await sql(c, `update product_types set department_id = $2 where id = $1`, [t.id, t.department_id]);
  await save(id, base({ productTypeId: null }));
  assert.equal((await row(id)).department_id, null);
});

test("has_options is true for the older variants list too", async () => {
  const id = await save(null, base());
  await sql(c, `update items set variants = '[{"id":"m","label":"Medium","price":120}]'::jsonb where id = $1`, [id]);
  assert.equal((await row(id)).has_options, true);
});

test("backfill sets price_min = price_max = price on existing items and runs twice with the same result", async () => {
  const a = await save(null, base({ price: 80 }));
  const b = await save(null, optioned(four()));
  const src = readFileSync(new URL("../migrations/0096_price_range_columns.sql", import.meta.url), "utf8");
  const block = /do \$\$\r?\ndeclare\r?\n  it public\.items;[\s\S]*?end \$\$;/.exec(src)[0];
  await sql(c, `alter table items disable trigger t_items_denorm`);
  await sql(c, `update items set price_min = null, price_high = null, has_options = false, department_id = null`);
  assert.deepEqual(await range(a), [null, null]);
  await sql(c, block);
  assert.deepEqual(await range(a), [80, 80]);
  assert.deepEqual(await range(b), [20, 50]);
  await sql(c, block);
  assert.deepEqual(await range(a), [80, 80]);
  await sql(c, `alter table items enable trigger t_items_denorm`);
});

const snapshot = async () => (await tx(c, anon, (k) => sql(k, `select products_snapshot(100) as s`)))[0].s;

test("the list payload carries the range fields, and an item without options looks as before", async () => {
  const plainId = await save(null, base({ name: "Plain", price: 80 }));
  const optId = await save(null, optioned(four(), { name: "Opt" }));
  await live(plainId);
  await live(optId);
  const s = await snapshot();
  const plain = s.items.find((i) => i.id === plainId);
  const opt = s.items.find((i) => i.id === optId);
  assert.deepEqual([Number(plain.price_min), Number(plain.price_max), plain.has_price_range, plain.has_options, plain.department_id, plain.product_type_id, plain.has_3d], [80, 80, false, false, null, null, false]);
  assert.deepEqual([Number(opt.price_min), Number(opt.price_max), opt.has_price_range, opt.has_options], [20, 50, true, true]);
  for (const key of ["id", "business_id", "name", "description", "section", "price", "price_type", "unit", "availability", "stock_left", "video_paths", "created_at", "image_path", "brand", "sale_id", "sale_price"]) assert.ok(key in plain, key);
});

test("the list payload shows the flash price in price_min", async () => {
  const id = await save(null, optioned(four()));
  await flash(id, { type: "percent", value: 50 });
  const item = (await snapshot()).items.find((i) => i.id === id);
  assert.equal(Number(item.price_min), 10);
  assert.equal(Number(item.price_max), 25);
});

const search = async (args) => {
  const keys = Object.keys(args);
  return (await tx(c, anon, (k) => sql(k, `select search_businesses(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as r`, keys.map((key) => args[key]))))[0].r;
};
const bizPrices = async () => {
  const { items } = await search({ p_sort: "price_asc" });
  return items.map((b) => [b.id, Number(b.from_price)]);
};

test("search filters and sorts on price_min, what a buyer can actually pay", async () => {
  await sql(c, `update businesses set status = 'live' where id in ('${ids.bizA}', '${ids.bizB}')`);
  const a = await save(null, optioned(four([200, 300, 400, 500])));
  await live(a);
  await sql(c, `insert into items (business_id, name, price, price_type) values ($1, 'Plain', 150, 'fixed')`, [ids.bizB]);
  assert.deepEqual(await bizPrices(), [[ids.bizB, 150], [ids.bizA, 200]]);
  await flash(a, { type: "percent", value: 50 });
  assert.deepEqual(await bizPrices(), [[ids.bizA, 100], [ids.bizB, 150]]);
  assert.deepEqual((await search({ p_max_price: 120 })).items.map((b) => b.id), [ids.bizA]);
  assert.deepEqual((await search({ p_min_price: 120, p_max_price: 160 })).items.map((b) => b.id), [ids.bizB]);
  assert.deepEqual((await search({ p_sort: "price_desc" })).items.map((b) => b.id), [ids.bizB, ids.bizA]);
});

test("search without options still uses the item price", async () => {
  await sql(c, `insert into items (business_id, name, price, price_type) values ($1, 'Plain', 150, 'fixed'), ($2, 'Other', 90, 'from')`, [ids.bizA, ids.bizB]);
  assert.deepEqual(await bizPrices(), [[ids.bizB, 90], [ids.bizA, 150]]);
});

const shape = async (id) => {
  const it = (await sql(c, `select price, sale_price, price_tiers, price_tier_mode, availability, option_axes from items where id = $1`, [id]))[0];
  const vs = await sql(c, `select id, combo_key, choice, price, sale_price, price_tiers, status from item_variants where item_id = $1`, [id]);
  const f = (await sql(c, `select discount_type, discount_value, starts_at, ends_at, variant_target, variant_overrides from flash_sales where item_id = $1 and status = 'live'`, [id]))[0];
  return {
    regularPrice: Number(it.price),
    salePrice: it.sale_price === null ? null : Number(it.sale_price),
    priceTiers: it.price_tiers,
    priceTierMode: it.price_tier_mode,
    availability: it.availability,
    options: it.option_axes ?? [],
    optionVariants: vs.map((v) => ({ id: v.id, choice: v.choice, price: v.price === null ? null : Number(v.price), salePrice: v.sale_price === null ? null : Number(v.sale_price), priceTiers: v.price_tiers, status: v.status })),
    flash: f ? { discount: { type: f.discount_type, value: Number(f.discount_value) }, startsAt: new Date(f.starts_at).toISOString(), endsAt: new Date(f.ends_at).toISOString(), variantTarget: f.variant_target, variantOverrides: f.variant_overrides } : null
  };
};

test("the stored range equals priceBounds of the same item across scenarios", async () => {
  const scenarios = [
    async () => save(null, base({ price: 100, sale_price: 70 })),
    async () => save(null, base({ price_type: "from", price: 10, priceTiers: T })),
    async () => save(null, optioned(four([40, 50, 30, 45]))),
    async () => save(null, optioned([{ choice: { colour: "black", size: "s" } }, { choice: { colour: "black", size: "l" }, price: 35 }])),
    async () => {
      const id = await save(null, optioned(four()));
      await sql(c, `update item_variants set status = 'out_of_stock' where item_id = $1 and combo_key = $2`, [id, BLACK_S]);
      return id;
    },
    async () => {
      const id = await save(null, base({ price: 100 }));
      await flash(id, { type: "percent", value: 25 });
      return id;
    },
    async () => {
      const id = await save(null, optioned(four([40, 50, 30, 45])));
      await flash(id, { target: "chosen", overrides: [{ combo: BLACK_S, type: "percent", value: 50 }, { combo: BLACK_L, type: "percent", value: 10 }] });
      return id;
    },
    async () => {
      const id = await save(null, optioned(four()));
      await flash(id, { type: "percent", value: 10 });
      return id;
    },
    async () => {
      const id = await save(null, base({ price_type: "from", price: 10, priceTiers: T }));
      await flash(id, { type: "percent", value: 20 });
      return id;
    }
  ];
  for (const [n, make] of scenarios.entries()) {
    await sql(c, `delete from flash_sales`);
    const id = await make();
    const b = priceBounds(await shape(id), Date.now());
    const [min, max] = await range(id);
    assert.deepEqual([b.min, b.max], [min, max], `scenario ${n}`);
  }
});

test("a flash sale with the older id entries hits only the listed combinations, as the pricing core does", async () => {
  const id = await save(null, optioned(four([40, 50, 30, 45])));
  const [grey] = await sql(c, `select id from item_variants where item_id = $1 and combo_key = $2`, [id, GREY_S]);
  await flash(id, { type: "percent", value: 50, overrides: [{ variantId: grey.id }] });
  assert.deepEqual(await range(id), [15, 50]);
  const b = priceBounds(await shape(id), Date.now());
  assert.deepEqual([b.min, b.max], [15, 50]);
  const opts = await tx(c, { role: "anon" }, (k) => sql(k, `select public_item_options($1) as r`, [id]));
  const flashed = opts[0].r.optionVariants.filter((v) => v.flash).map((v) => v.flash.salePrice);
  assert.deepEqual(flashed, [15]);
});
