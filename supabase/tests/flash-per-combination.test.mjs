import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { validateFlashVariants } from "../../shared/src/flash/validateFlashVariants.js";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA } from "./db.mjs";

let c;
const anon = { role: "anon" };
const PAID = "now() + interval '30 days'";

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_flash_combo" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 20 where category_id = 'barber'`);
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from audit_log; delete from items`);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = ${PAID}`);
});

const axes = [
  { key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "grey", label: "Grey" }] },
  { key: "storage", label: "Storage", display: "button", values: [{ id: "64", label: "64 GB" }, { id: "128", label: "128 GB" }] }
];
const BLACK_64 = "colour=black|storage=64";
const BLACK_128 = "colour=black|storage=128";
const GREY_64 = "colour=grey|storage=64";
const GREY_128 = "colour=grey|storage=128";
const combos = [BLACK_64, BLACK_128, GREY_64, GREY_128];

const save = (id, fields) => tx(c, asA, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]), { commit: true }).then((r) => r[0].id);

const phone = async (variants) => {
  const id = await save(null, {
    name: "Phone", description: "", section: "Phones", price_type: "from", price: 24000, price_max: null, sale_price: null, unit: null, availability: "available",
    options: {
      axes,
      variants: variants ?? [
        { choice: { colour: "black", storage: "64" }, price: 25000 },
        { choice: { colour: "black", storage: "128" }, price: 26000 },
        { choice: { colour: "grey", storage: "64" }, price: 24000 },
        { choice: { colour: "grey", storage: "128" }, price: 25000 }
      ]
    }
  });
  await sql(c, `update items set visible = true, draft = false where id = $1`, [id]);
  return id;
};

const plain = async (price = 1000) => {
  const id = await save(null, { name: "Fade", description: "", section: "Cuts", price_type: "fixed", price, price_max: null, sale_price: null, unit: null, availability: "available" });
  await sql(c, `update items set visible = true, draft = false where id = $1`, [id]);
  return id;
};

const make = (itemId, o = {}, who = asA, biz = ids.bizA) =>
  tx(c, who, async (k) => (await sql(k,
    `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value, variant_target, variant_overrides)
     values ($1, $2, now(), now() + interval '6 hours', $3, $4, $5, $6::jsonb) returning *`,
    [biz, itemId, o.type ?? "percent", o.value ?? 20, o.target ?? "all", JSON.stringify(o.overrides ?? [])]))[0], { commit: true });

const fails = async (itemId, o, pattern) => {
  await assert.rejects(make(itemId, o), pattern);
};
const pub = async (id) => (await tx(c, anon, (k) => sql(k, `select * from public_flash_sales where item_id = $1`, [id])))[0];
const options = async (id) => (await tx(c, anon, (k) => sql(k, `select public_item_options($1) as r`, [id])))[0].r;
const byCombo = (rows) => Object.fromEntries(rows.map((r) => [r.combo, Number(r.salePrice)]));
const ov = (combo, type, value) => ({ combo, type, value });

test("a flash sale on Black only: Black combinations are discounted, Grey is not", async () => {
  const id = await phone();
  await make(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 20), ov(BLACK_128, "percent", 20)] });
  const p = await pub(id);
  assert.equal(p.variant_target, "chosen");
  assert.deepEqual(byCombo(p.variant_flash), { [BLACK_64]: 20000, [BLACK_128]: 20800 });
  assert.equal(Number(p.regular_price), 24000);
  assert.equal(Number(p.sale_price), 20000, "the lowest price a buyer can pay");
  const o = await options(id);
  const flashOf = Object.fromEntries(o.optionVariants.map((v) => [v.choice.colour + "/" + v.choice.storage, v.flash]));
  assert.equal(Number(flashOf["black/64"].salePrice), 20000);
  assert.equal(Number(flashOf["black/64"].regularPrice), 25000);
  assert.equal(flashOf["black/64"].type, "percent");
  assert.equal(flashOf["grey/64"], null);
  assert.equal(flashOf["grey/128"], null);
});

test("a flash sale on all combinations discounts each from its own price", async () => {
  const id = await phone();
  await make(id, { target: "all", type: "percent", value: 10 });
  const p = await pub(id);
  assert.equal(p.variant_target, "all");
  assert.deepEqual(byCombo(p.variant_flash), { [BLACK_64]: 22500, [BLACK_128]: 23400, [GREY_64]: 21600, [GREY_128]: 22500 });
  assert.equal(Number(p.sale_price), 21600);
  const o = await options(id);
  assert.ok(o.optionVariants.every((v) => v.flash && Number(v.flash.salePrice) < Number(v.flash.regularPrice)));
});

test("each combination can have its own kind of discount", async () => {
  const id = await phone();
  await make(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 10), ov(BLACK_128, "amount_off", 3000), ov(GREY_64, "sale_price", 20000)] });
  assert.deepEqual(byCombo((await pub(id)).variant_flash), { [BLACK_64]: 22500, [BLACK_128]: 23000, [GREY_64]: 20000 });
});

test("with target all an override replaces the discount for that combination", async () => {
  const id = await phone();
  await make(id, { target: "all", type: "percent", value: 10, overrides: [ov(BLACK_64, "sale_price", 15000)] });
  const got = byCombo((await pub(id)).variant_flash);
  assert.equal(got[BLACK_64], 15000);
  assert.equal(got[GREY_64], 21600);
  assert.equal(Number((await pub(id)).sale_price), 15000);
});

test("a target that is not a sold combination is refused", async () => {
  const id = await phone();
  await fails(id, { target: "chosen", overrides: [ov("colour=red|storage=64", "percent", 10)] }, /invalid_flash_target/);
  await fails(id, { target: "chosen", overrides: [ov("colour=black", "percent", 10)] }, /invalid_flash_target/);
  await sql(c, `update item_variants set status = 'unavailable' where item_id = $1 and combo_key = $2`, [id, GREY_128]);
  await fails(id, { target: "chosen", overrides: [ov(GREY_128, "percent", 10)] }, /invalid_flash_target/);
  await fails(await phone(), { target: "all", overrides: [ov("size=xl", "percent", 10)] }, /invalid_flash_target/);
  assert.equal((await sql(c, `select count(*)::int as n from flash_sales`))[0].n, 0);
});

test("a combination with no price of its own is not sold, so it cannot be targeted", async () => {
  const id = await phone([{ choice: { colour: "black", storage: "64" }, price: 25000 }, { choice: { colour: "black", storage: "128" } }, { choice: { colour: "grey", storage: "64" }, price: 24000 }, { choice: { colour: "grey", storage: "128" }, price: 25000 }]);
  await fails(id, { target: "chosen", overrides: [ov(BLACK_128, "percent", 10)] }, /invalid_flash_target/);
  await make(id, { target: "all", type: "percent", value: 10 });
  assert.deepEqual(byCombo((await pub(id)).variant_flash), { [BLACK_64]: 22500, [GREY_64]: 21600, [GREY_128]: 22500 });
});

test("chosen needs combinations and an item that has options", async () => {
  const id = await phone();
  await fails(id, { target: "chosen", overrides: [] }, /flash_needs_combinations/);
  await fails(await plain(), { target: "chosen", overrides: [ov(BLACK_64, "percent", 10)] }, /flash_needs_combinations/);
});

test("a discount that is too large or not lower is refused for a combination", async () => {
  const id = await phone();
  await fails(id, { target: "chosen", overrides: [ov(BLACK_64, "amount_off", 25000)] }, /discount_too_large/);
  await fails(id, { target: "chosen", overrides: [ov(BLACK_64, "sale_price", 25000)] }, /sale_price_not_lower/);
  await fails(id, { target: "chosen", overrides: [ov(GREY_64, "sale_price", 24500)] }, /sale_price_not_lower/);
});

test("bad override shapes and targets are refused", async () => {
  const id = await phone();
  await fails(id, { target: "chosen", overrides: [{ combo: BLACK_64, type: "percent" }] }, /invalid_flash_overrides/);
  await fails(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 100)] }, /invalid_flash_overrides/);
  await fails(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 10), ov(BLACK_64, "percent", 20)] }, /invalid_flash_overrides/);
  await fails(id, { target: "chosen", overrides: [{ ...ov(BLACK_64, "percent", 10), extra: 1 }] }, /invalid_flash_overrides/);
  await fails(id, { target: "some" }, /flash_sales_variant_target_ck/);
});

test("a legacy single price flash still works, on an item without options and on one with", async () => {
  const id = await plain(1000);
  await make(id, { type: "amount_off", value: 200 });
  const p = await pub(id);
  assert.equal(Number(p.sale_price), 800);
  assert.equal(p.variant_target, "all");
  assert.equal(p.variant_flash, null);
  assert.deepEqual(p.variant_overrides, []);
  assert.equal((await options(id)).optionVariants.length, 0);

  await sql(c, `delete from flash_sales`);
  const withOptions = await phone();
  await make(withOptions, { type: "percent", value: 20 });
  assert.equal(Number((await pub(withOptions)).sale_price), 19200);
});

test("an older [{variantId, salePrice}] override is accepted and ignored", async () => {
  const id = await plain(1000);
  const s = await make(id, { overrides: [{ variantId: "medium", salePrice: 2000 }] });
  assert.deepEqual(s.variant_overrides, [{ variantId: "medium", salePrice: 2000 }]);
  assert.equal(Number((await pub(id)).sale_price), 800);
});

test("an item without a live sale reads back its options exactly as before", async () => {
  const id = await phone();
  const o = await options(id);
  assert.ok(o.optionVariants.every((v) => !("flash" in v)));
  await make(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 20)] });
  await sql(c, `update flash_sales set status = 'cancelled', ended_at = now(), ended_reason = 'seller'`);
  assert.ok((await options(id)).optionVariants.every((v) => !("flash" in v)));
});

test("a sale that has not started shows no per-combination prices", async () => {
  const id = await phone();
  await tx(c, asA, (k) => sql(k, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value, variant_target, variant_overrides)
    values ($1, $2, now() + interval '2 hours', now() + interval '5 hours', 'percent', 20, 'chosen', $3::jsonb)`, [ids.bizA, id, JSON.stringify([ov(BLACK_64, "percent", 20)])]), { commit: true });
  assert.equal(await pub(id), undefined);
  assert.ok((await options(id)).optionVariants.every((v) => !("flash" in v)));
});

test("the target and the combinations cannot change once the sale has started", async () => {
  const id = await phone();
  const s = await make(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 20)] });
  const update = (set) => tx(c, asA, (k) => sql(k, `update flash_sales set ${set} where id = $1`, [s.id]), { commit: true });
  await assert.rejects(update(`variant_target = 'all'`), /flash_locked/);
  await assert.rejects(update(`variant_overrides = '[]'::jsonb`), /flash_locked/);
  await update(`headline = 'Black Friday'`);
});

test("the target can be changed before a sale starts, and is checked again", async () => {
  const id = await phone();
  const s = (await tx(c, asA, (k) => sql(k, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value, variant_target, variant_overrides)
    values ($1, $2, now() + interval '2 hours', now() + interval '5 hours', 'percent', 20, 'chosen', $3::jsonb) returning id`, [ids.bizA, id, JSON.stringify([ov(BLACK_64, "percent", 20)])]), { commit: true }))[0];
  await tx(c, asA, (k) => sql(k, `update flash_sales set variant_overrides = $2::jsonb where id = $1`, [s.id, JSON.stringify([ov(GREY_64, "percent", 5)])]), { commit: true });
  await assert.rejects(tx(c, asA, (k) => sql(k, `update flash_sales set variant_overrides = $2::jsonb where id = $1`, [s.id, JSON.stringify([ov("colour=red|storage=64", "percent", 5)])]), { commit: true }), /invalid_flash_target/);
});

test("the expiry job and other status changes are not blocked by the new checks", async () => {
  const id = await phone();
  const s = await make(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 20)] });
  await sql(c, `update item_variants set status = 'unavailable' where item_id = $1 and combo_key = $2`, [id, BLACK_64]);
  await tx(c, null, async (k) => {
    await k.query(`set local session_replication_role = replica`);
    await k.query(`update flash_sales set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 minute' where id = $1`, [s.id]);
  }, { commit: true });
  await sql(c, `select flash_sales_sweep()`);
  assert.equal((await sql(c, `select status from flash_sales where id = $1`, [s.id]))[0].status, "ended");
});

const detailOf = async (id) => {
  const rows = await sql(c, `select v.combo_key as combo, v.price, v.status from item_variants v where v.item_id = $1 order by v.sort`, [id]);
  const item = (await sql(c, `select price from items where id = $1`, [id]))[0];
  return { regularPrice: Number(item.price), optionVariants: rows.map((r) => ({ combo: r.combo, price: r.price === null ? null : Number(r.price), status: r.status })) };
};

test("validateFlashVariants and the database agree on every case", async () => {
  const id = await phone();
  await sql(c, `update item_variants set status = 'unavailable' where item_id = $1 and combo_key = $2`, [id, GREY_128]);
  const item = await detailOf(id);
  const cases = [
    { target: "all", overrides: [] },
    { target: "all", type: "amount_off", value: 500, overrides: [] },
    { target: "all", overrides: [ov(BLACK_64, "sale_price", 15000)] },
    { target: "all", overrides: [ov(GREY_128, "percent", 10)] },
    { target: "all", overrides: [ov("size=xl", "percent", 10)] },
    { target: "chosen", overrides: [] },
    { target: "chosen", overrides: [ov(BLACK_64, "percent", 20), ov(GREY_64, "amount_off", 1000)] },
    { target: "chosen", overrides: [ov(BLACK_64, "percent", 20), ov("colour=red|storage=64", "percent", 20)] },
    { target: "chosen", overrides: [ov(GREY_128, "percent", 20)] },
    { target: "chosen", overrides: [ov(BLACK_64, "amount_off", 25000)] },
    { target: "chosen", overrides: [ov(GREY_64, "sale_price", 24000)] },
    { target: "chosen", overrides: [ov(GREY_64, "sale_price", 30000)] },
    { target: "chosen", overrides: [{ combo: BLACK_64, type: "percent" }] },
    { target: "chosen", overrides: [ov(BLACK_64, "percent", 100)] },
    { target: "chosen", overrides: [ov(BLACK_64, "percent", 10), ov(BLACK_64, "percent", 20)] }
  ];
  for (const o of cases) {
    const js = validateFlashVariants({ discountType: o.type ?? "percent", discountValue: o.value ?? 20, variantTarget: o.target, variantOverrides: o.overrides }, item);
    let code = null;
    try {
      await make(id, o);
    } catch (e) {
      code = /(invalid_flash_overrides|flash_needs_combinations|invalid_flash_target|discount_too_large|sale_price_not_lower|sale_price_not_lower)/.exec(e.message)?.[1] ?? e.message;
    }
    assert.equal(code, js.ok ? null : js.errors[0].code, JSON.stringify(o));
    await sql(c, `delete from flash_sales`);
  }
});

test("validateFlashVariants lists the same prices the database serves", async () => {
  const id = await phone();
  const o = { target: "all", type: "percent", value: 15, overrides: [ov(BLACK_64, "amount_off", 2000)] };
  await make(id, o);
  const js = validateFlashVariants({ discountType: o.type, discountValue: o.value, variantTarget: o.target, variantOverrides: o.overrides }, await detailOf(id));
  const db = byCombo((await pub(id)).variant_flash);
  assert.deepEqual(Object.fromEntries(js.targets.map((t) => [t.combo, t.salePrice])), db);
});

test("another shop cannot flash my combinations", async () => {
  const id = await phone();
  await assert.rejects(make(id, { target: "chosen", overrides: [ov(BLACK_64, "percent", 10)] }, { sub: ids.userB }, ids.bizB), /item_not_found|row-level security/);
});
