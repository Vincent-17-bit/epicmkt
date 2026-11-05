// Migration 0088: dependsOn, the seller's default variant, per-variant specs, the database cap on variants, seller_check_item.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { publicOptions } from "../../shared/src/seller/options.js";
import { dependentValues, reconcileSelection, variantForChoice, findDefaultVariant, generateCombinations } from "../../shared/src/options/index.js";
import { sandisk, phone } from "../../shared/src/options/fixtures.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items; delete from size_charts`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const anon = { role: "anon" };
const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const newItem = async (biz = ids.bizA, extra = {}) => {
  const f = { name: "Card", price: 1000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [biz, ...Object.values(f)]))[0].id;
};
const base = (o = {}) => ({ name: "Card", description: "", section: "Shoes", price_type: "fixed", price: 1000, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const save = (who, id, fields) => as(who, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const saveFails = (who, id, fields, pattern) => rejects(c, who, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const check = (who, id, fields) => as(who, `select seller_check_item($1::uuid, $2::jsonb) as r`, [id, JSON.stringify(fields)]).then((r) => r[0].r);
const sellerRead = (id, who = asA) => as(who, `select seller_item_options($1) as r`, [id]).then((r) => r[0].r);
const publicRead = (id) => as(anon, `select public_item_options($1) as r`, [id]).then((r) => r[0].r);
const variantRows = (id) => sql(c, `select * from item_variants where item_id = $1 order by sort`, [id]);
const itemRow = (id) => sql(c, `select * from items where id = $1`, [id]).then((r) => r[0]);

// A fixture as a save's `options`.
const asOptions = (f, defaultChoice) => ({
  axes: f.options,
  variants: f.optionVariants.map(({ choice, price, salePrice, status, specs, stock }) => ({ choice, price, salePrice, status, specs, stock })),
  ...(defaultChoice !== undefined && { defaultChoice }),
});
const sizeAxes = () => [
  { key: "style", label: "Style", display: "text-card", values: [{ id: "old", label: "Old" }, { id: "new", label: "New" }] },
  { key: "cap", label: "Capacity", display: "text-card", dependsOn: "style", values: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] },
];
const small = (extra = {}) => ({
  axes: sizeAxes(),
  variants: [{ choice: { style: "old", cap: "a" }, price: 10 }, { choice: { style: "old", cap: "b" }, price: 20 }, { choice: { style: "new", cap: "b" }, price: 30 }, { choice: { style: "new", cap: "c" }, price: 40 }],
  ...extra,
});

// ---- SanDisk end to end ----

test("SanDisk: saved through seller_save_item, read back publicly, and the shared helpers agree with the database payload", async () => {
  const f = sandisk();
  const id = await newItem();
  await save(asA, id, base({ options: asOptions(f, { style: "old", capacity: "128gb" }) }));
  const pub = await publicRead(id);
  assert.equal(pub.options[1].dependsOn, "style");
  assert.equal("dependsOn" in pub.options[0], false);
  assert.equal(pub.optionVariants.length, 11);
  const rows = await variantRows(id);
  assert.equal(pub.defaultVariantId, rows.find((r) => r.combo_key === "style=old|capacity=128gb").id);

  // Old Version lists five capacities, New Version six; 128 GB is kept across the switch.
  assert.deepEqual(dependentValues(pub.options, pub.optionVariants, "capacity", { style: "old" }).map((x) => x.id), ["32gb", "128gb", "256gb", "512gb", "1024gb"]);
  assert.deepEqual(dependentValues(pub.options, pub.optionVariants, "capacity", { style: "new" }).map((x) => x.id), ["64gb", "128gb", "256gb", "512gb", "1024gb", "2048gb"]);
  assert.deepEqual(reconcileSelection(pub.options, pub.optionVariants, { style: "new", capacity: "128gb" }, pub.defaultVariantId), { style: "new", capacity: "128gb" });
  assert.deepEqual(reconcileSelection(pub.options, pub.optionVariants, { style: "new", capacity: "32gb" }, pub.defaultVariantId), { style: "new", capacity: "64gb" }, "the seller's default (Old / 128 GB) is not in this list, so the cheapest in stock of what is left is chosen");

  // Prices, struck-through earlier price, and spec overrides.
  const old32 = variantForChoice(pub.options, pub.optionVariants, { style: "old", capacity: "32gb" });
  assert.deepEqual([old32.price, old32.salePrice], [3765, 3582]);
  const new256 = variantForChoice(pub.options, pub.optionVariants, { style: "new", capacity: "256gb" });
  assert.deepEqual([new256.price, new256.salePrice], [16883, 12078]);
  assert.equal(new256.specs[0].value, "Camera");
  assert.match(old32.specs[0].value, /home theatre/);

  // The JS mirror builds the same payload the database returns.
  const mirror = publicOptions({
    axes: (await sellerRead(id)).axes,
    variants: rows.map((r) => ({ id: r.id, choice: r.choice, price: Number(r.price), salePrice: r.sale_price === null ? null : Number(r.sale_price), status: r.status, stock: r.stock_count, sku: r.sku, mediaIds: [], specs: r.specs })),
    item: { price: 1000, salePrice: null, showStockCount: false },
    defaultVariantId: pub.defaultVariantId,
  });
  assert.deepEqual(mirror.options, pub.options);
  assert.deepEqual(mirror.optionVariants.map(({ id: i, choice, price, salePrice, status, specs }) => ({ id: i, choice, price, salePrice, status, specs })),
    pub.optionVariants.map(({ id: i, choice, price, salePrice, status, specs }) => ({ id: i, choice, price, salePrice, status, specs })));
  assert.equal(mirror.defaultVariantId, pub.defaultVariantId);
});

// ---- dependsOn ----

test("dependsOn must name an earlier axis; self, later and unknown references fail and write nothing", async () => {
  const id = await newItem();
  const withDep = (fn) => { const o = small(); fn(o.axes); return base({ options: o }); };
  await saveFails(asA, id, withDep((a) => { a[0].dependsOn = "style"; }), /invalid_options/);
  await saveFails(asA, id, withDep((a) => { a[0].dependsOn = "cap"; delete a[1].dependsOn; }), /invalid_options/);
  await saveFails(asA, id, withDep((a) => { a[1].dependsOn = "nope"; }), /invalid_options/);
  await saveFails(asA, id, withDep((a) => { a[1].dependsOn = 7; }), /invalid_options/);
  await saveFails(asA, id, withDep((a) => { a[1].dependsOn = "Style"; }), /invalid_options/);
  assert.deepEqual((await itemRow(id)).option_axes, []);
  assert.equal((await variantRows(id)).length, 0);
  await save(asA, id, base({ options: small() }));
  assert.equal((await itemRow(id)).option_axes[1].dependsOn, "style");
  const withNull = withDep((a) => { a[1].dependsOn = null; });
  await save(asA, id, withNull);
  assert.equal("dependsOn" in (await itemRow(id)).option_axes[1], false, "a null dependsOn is dropped");
});

test("the table constraint rejects a stored axis list with a bad dependsOn even if the function is bypassed", async () => {
  const id = await newItem();
  const bad = small().axes; bad[0].dependsOn = "cap";
  await assert.rejects(sql(c, `update items set option_axes = $2::jsonb where id = $1`, [id, JSON.stringify(bad)]), /items_option_axes_shape/);
});

// ---- default variant ----

test("defaultChoice sets the default; it survives a save that does not mention it, and clears with null", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small({ defaultChoice: { style: "new", cap: "b" } }) }));
  let rows = await variantRows(id);
  const target = rows.find((r) => r.combo_key === "style=new|cap=b");
  assert.equal((await itemRow(id)).default_variant_id, target.id);
  assert.equal((await sellerRead(id)).defaultVariantId, target.id);
  assert.equal((await publicRead(id)).defaultVariantId, target.id);

  // Re-save without defaultChoice (a price change): rows keep ids, the default stays.
  const again = small(); again.variants[2].price = 35;
  await save(asA, id, base({ options: again }));
  assert.equal((await itemRow(id)).default_variant_id, target.id);

  // A save that moves it, then one that clears it.
  await save(asA, id, base({ options: small({ defaultChoice: { style: "old", cap: "a" } }) }));
  rows = await variantRows(id);
  assert.equal((await itemRow(id)).default_variant_id, rows.find((r) => r.combo_key === "style=old|cap=a").id);
  await save(asA, id, base({ options: small({ defaultChoice: null }) }));
  assert.equal((await itemRow(id)).default_variant_id, null);
  assert.equal((await publicRead(id)).defaultVariantId, null);
});

test("removing the default variant clears the default; the item and its other variants are fine", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small({ defaultChoice: { style: "new", cap: "c" } }) }));
  const dropped = small(); dropped.variants.pop();
  await save(asA, id, base({ options: dropped }));
  const row = await itemRow(id);
  assert.equal(row.default_variant_id, null);
  assert.equal((await variantRows(id)).length, 3);
});

test("an invalid default fails with invalid_default and changes nothing: not saved, partial, wrong type, or with no options", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small({ defaultChoice: { style: "old", cap: "a" } }) }));
  const keep = (await itemRow(id)).default_variant_id;
  await saveFails(asA, id, base({ options: small({ defaultChoice: { style: "old", cap: "c" } }) }), /invalid_default/); // not a combination being saved
  await saveFails(asA, id, base({ options: small({ defaultChoice: { style: "old" } }) }), /invalid_default/);
  await saveFails(asA, id, base({ options: small({ defaultChoice: "x" }) }), /invalid_default/);
  await saveFails(asA, id, base({ options: small({ defaultChoice: { style: "old", cap: "a", extra: "z" } }) }), /invalid_default/);
  const empty = await newItem();
  await saveFails(asA, empty, base({ options: { axes: [], variants: [], defaultChoice: { a: "b" } } }), /invalid_default/);
  assert.equal((await itemRow(id)).default_variant_id, keep);
  assert.equal((await variantRows(id)).length, 4);
});

test("a default must belong to the same item, enforced by the foreign key", async () => {
  const a = await newItem();
  const b = await newItem();
  await save(asA, a, base({ options: small() }));
  const foreign = (await variantRows(a))[0].id;
  await assert.rejects(sql(c, `update items set default_variant_id = $2 where id = $1`, [b, foreign]), /items_default_variant_fk/);
});

test("deleting an item that has a default variant works", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small({ defaultChoice: { style: "old", cap: "a" } }) }));
  await sql(c, `delete from items where id = $1`, [id]);
  assert.equal((await sql(c, `select count(*)::int as n from item_variants where item_id = $1`, [id]))[0].n, 0);
});

// ---- specs ----

test("variant specs are trimmed, stored, read back, and validated like item specs", async () => {
  const id = await newItem();
  const o = small(); o.variants[0].specs = [{ group: "Features & Specs", label: "  Compatible devices ", value: " Camera " }];
  await save(asA, id, base({ options: o }));
  const rows = await variantRows(id);
  assert.deepEqual(rows[0].specs, [{ group: "Features & Specs", label: "Compatible devices", value: "Camera" }]);
  assert.deepEqual(rows[1].specs, []);
  const mine = await sellerRead(id);
  assert.deepEqual(mine.variants[0].specs, rows[0].specs);
  assert.deepEqual(mine.variants[1].specs, []);
  const bad = (specs) => { const x = small(); x.variants[0].specs = specs; return base({ options: x }); };
  await saveFails(asA, id, bad([{ group: "Nope", label: "a", value: "b" }]), /invalid_variant/);
  await saveFails(asA, id, bad([{ group: "Measurements", label: "  ", value: "b" }]), /invalid_variant/);
  await saveFails(asA, id, bad([{ group: "Measurements", label: "a", value: "x".repeat(121) }]), /invalid_variant/);
  await saveFails(asA, id, bad([{ group: "Measurements", label: "a", value: "b", extra: 1 }]), /invalid_variant/);
  await saveFails(asA, id, bad("nope"), /invalid_variant/);
  await saveFails(asA, id, bad(Array.from({ length: 21 }, (_, i) => ({ group: "Measurements", label: `l${i}`, value: "v" }))), /invalid_variant/);
  assert.deepEqual((await variantRows(id))[0].specs, rows[0].specs, "failed saves leave the stored specs alone");
  await save(asA, id, base({ options: small() }));
  assert.deepEqual((await variantRows(id))[0].specs, [], "a save with no specs clears them (the variant set is replaced as a whole)");
});

// ---- limits ----

test("limits: 40 values per axis is fine, the 41st is refused; a fourth axis is refused", async () => {
  const id = await newItem();
  const axis = (n, key = "size") => ({ key, label: "Size", display: "button", values: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `S${i}` })) });
  await save(asA, id, base({ options: { axes: [axis(40)], variants: [{ choice: { size: "s39" }, price: 1 }] } }));
  await saveFails(asA, id, base({ options: { axes: [axis(41)], variants: [] } }), /invalid_options/);
  await saveFails(asA, id, base({ options: { axes: [axis(2, "a"), axis(2, "b"), axis(2, "c"), axis(2, "d")], variants: [] } }), /invalid_options/);
  await assert.rejects(sql(c, `update items set option_axes = $2::jsonb where id = $1`, [id, JSON.stringify([axis(41)])]), /items_option_axes_shape/);
  assert.equal((await itemRow(id)).option_axes[0].values.length, 40);
});

test("limits: 200 variants are stored (and can be re-saved), the 201st is refused by the save and by the database", async () => {
  const id = await newItem();
  const six = (key) => ({ key, label: key.toUpperCase(), display: "button", values: Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, label: `V${i}` })) });
  const axes3 = [six("a"), six("b"), six("c")];
  const combos = generateCombinations(axes3, 300); // 216
  const rows = (n) => combos.slice(0, n).map((choice, i) => ({ choice, price: 100 + i }));
  await save(asA, id, base({ options: { axes: axes3, variants: rows(200) } }));
  assert.equal((await variantRows(id)).length, 200);
  await save(asA, id, base({ options: { axes: axes3, variants: rows(200).map((r) => ({ ...r, price: r.price + 1 })) } }));
  assert.equal((await variantRows(id)).length, 200, "re-saving all 200 (every row an update) is not refused by the cap");
  await saveFails(asA, id, base({ options: { axes: axes3, variants: rows(201) } }), /too_many_variants/);
  assert.equal((await variantRows(id)).length, 200);

  // The database itself: a raw insert of a 201st row is refused, an update of an existing one is not.
  await assert.rejects(sql(c, `insert into item_variants (item_id, business_id, combo_key, choice) values ($1, $2, 'z=1', '{}')`, [id, ids.bizA]), /too_many_variants/);
  await sql(c, `insert into item_variants (item_id, business_id, combo_key, choice, price) select item_id, business_id, combo_key, choice, 5 from item_variants where item_id = $1 limit 1
                on conflict (item_id, combo_key) do update set price = excluded.price`, [id]);
  assert.equal((await variantRows(id)).length, 200);
});

test("limits: one statement inserting 201 rows is refused as a whole", async () => {
  const id = await newItem();
  await assert.rejects(sql(c, `insert into item_variants (item_id, business_id, combo_key, choice) select $1, $2, 'k=' || g, '{}' from generate_series(1, 201) g`, [id, ids.bizA]), /too_many_variants/);
  assert.equal((await variantRows(id)).length, 0);
  await sql(c, `insert into item_variants (item_id, business_id, combo_key, choice) select $1, $2, 'k=' || g, '{}' from generate_series(1, 200) g`, [id, ids.bizA]);
  assert.equal((await variantRows(id)).length, 200);
});

test("the cap is per item: a second item still takes its own 200", async () => {
  const one = await newItem();
  const two = await newItem();
  await sql(c, `insert into item_variants (item_id, business_id, combo_key, choice) select $1, $2, 'k=' || g, '{}' from generate_series(1, 200) g`, [one, ids.bizA]);
  await sql(c, `insert into item_variants (item_id, business_id, combo_key, choice) select $1, $2, 'k=' || g, '{}' from generate_series(1, 200) g`, [two, ids.bizA]);
  assert.equal((await variantRows(two)).length, 200);
});

// ---- RLS ----

test("RLS: only the shop's own seller can write; another shop and the public cannot", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small() }));
  await saveFails(asB, id, base({ options: small({ defaultChoice: { style: "old", cap: "a" } }) }), /item_not_found/);
  await rejects(c, anon, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(base())], /./);
  assert.equal((await itemRow(id)).default_variant_id, null);
  // No direct table writes for anyone but the service role.
  await rejects(c, asA, `update item_variants set price = 1 where item_id = $1`, [id], /permission denied/);
  await rejects(c, asA, `insert into item_variants (item_id, business_id, combo_key, choice) values ($1, $2, 'x=1', '{}')`, [id, ids.bizA], /permission denied/);
  await rejects(c, asA, `delete from item_variants where item_id = $1`, [id], /permission denied/);
  await rejects(c, anon, `select * from item_variants`, [], /permission denied/);
  assert.equal((await variantRows(id)).length, 4);
});

test("RLS: a seller reads only their own variants; the public reads through the function", async () => {
  const a = await newItem(ids.bizA);
  const b = await newItem(ids.bizB, { name: "Other" });
  await save(asA, a, base({ options: small() }));
  await save(asB, b, base({ options: small() }));
  assert.equal((await as(asA, `select count(*)::int as n from item_variants`))[0].n, 4);
  assert.equal((await as(asB, `select count(*)::int as n from item_variants where item_id = $1`, [a]))[0].n, 0);
  await rejects(c, asB, `select seller_item_options($1)`, [a], /item_not_found/);
  assert.equal((await publicRead(a)).optionVariants.length, 4);
});

test("RLS: the public cannot read a hidden item's options, and the public payload has no seller-only fields", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small({ defaultChoice: { style: "old", cap: "a" } }) }));
  const pub = await publicRead(id);
  assert.ok(pub.defaultVariantId);
  assert.ok(pub.optionVariants.every((x) => !("stock" in x) && !("combo_key" in x)));
  await sql(c, `update items set visible = false where id = $1`, [id]);
  assert.equal(await publicRead(id), null);
});

// ---- seller_check_item ----

test("seller_check_item: a good item is ok and nothing is written, for an existing item and a new one", async () => {
  const id = await newItem();
  const before = await itemRow(id);
  const r = await check(asA, id, base({ name: "Renamed", price: 2222, options: small({ defaultChoice: { style: "new", cap: "c" } }) }));
  assert.deepEqual(r, { ok: true, issues: [] });
  const after = await itemRow(id);
  assert.equal(after.name, before.name);
  assert.deepEqual(after.option_axes, []);
  assert.equal(after.default_variant_id, null);
  assert.equal((await variantRows(id)).length, 0);

  const count = (await sql(c, `select count(*)::int as n from items`))[0].n;
  const fresh = await check(asA, null, base({ name: "Brand new", options: small() }));
  assert.deepEqual(fresh, { ok: true, issues: [] });
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, count, "a new item is not created by a check");
});

test("seller_check_item: returns the save's own error name for each kind of problem, and writes nothing", async () => {
  const id = await newItem();
  const issues = async (fields, who = asA, item = id) => (await check(who, item, fields)).issues.map((x) => x.code);
  assert.deepEqual(await issues(base({ name: "x" })), ["invalid_name"]);
  assert.deepEqual(await issues(base({ options: small({ defaultChoice: { style: "old", cap: "c" } }) })), ["invalid_default"]);
  const bad = small(); bad.axes[1].dependsOn = "nope";
  assert.deepEqual(await issues(base({ options: bad })), ["invalid_options"]);
  const dup = small(); dup.variants.push({ choice: { style: "old", cap: "a" }, price: 1 });
  assert.deepEqual(await issues(base({ options: dup })), ["duplicate_variant"]);
  const sale = small(); sale.variants[0].salePrice = 99;
  assert.deepEqual(await issues(base({ options: sale })), ["invalid_variant"]);
  assert.deepEqual(await issues(base({ options: small() }), asB), ["item_not_found"], "another shop's item");
  assert.equal((await check(asA, id, base({ name: "x" }))).ok, false);
  assert.equal((await variantRows(id)).length, 0);
  assert.equal((await itemRow(id)).name, "Card");
});

test("seller_check_item: 201 variants and 41 values are reported, not saved", async () => {
  const id = await newItem();
  const six = (key) => ({ key, label: key.toUpperCase(), display: "button", values: Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, label: `V${i}` })) });
  const axes3 = [six("a"), six("b"), six("c")];
  const combos = generateCombinations(axes3, 300);
  assert.deepEqual((await check(asA, id, base({ options: { axes: axes3, variants: combos.slice(0, 201).map((choice) => ({ choice, price: 1 })) } }))).issues, [{ code: "too_many_variants" }]);
  const wide = { key: "size", label: "Size", display: "button", values: Array.from({ length: 41 }, (_, i) => ({ id: `s${i}`, label: `S${i}` })) };
  assert.deepEqual((await check(asA, id, base({ options: { axes: [wide], variants: [] } }))).issues, [{ code: "invalid_options" }]);
  assert.equal((await variantRows(id)).length, 0);
});

test("seller_check_item: the public and a non-seller cannot call it", async () => {
  await rejects(c, anon, `select seller_check_item(null, '{}'::jsonb)`, [], /./);
  await rejects(c, { role: "authenticated", sub: "00000000-0000-4000-8000-0000000000ff" }, `select seller_check_item(null, '{}'::jsonb)`, [], /not_a_seller|not_authenticated|permission/);
});

test("seller_check_item leaves an item in a live flash sale alone and reports the guard", async () => {
  const id = await newItem();
  await save(asA, id, base({ options: small() }));
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20)`, [ids.bizA, id]);
  const changed = small(); changed.variants[0].price = 11;
  assert.deepEqual((await check(asA, id, base({ options: changed }))).issues, [{ code: "item_in_flash_sale" }]);
  assert.equal(Number((await variantRows(id))[0].price), 10);
});

// ---- legacy and duplicate ----

test("a legacy item (no options) reads and saves exactly as before; the new keys are empty", async () => {
  const id = await newItem();
  await save(asA, id, base({ price: 1500 }));
  const row = await itemRow(id);
  assert.equal(row.default_variant_id, null);
  assert.deepEqual(row.option_axes, []);
  const pub = await publicRead(id);
  assert.deepEqual(pub.options, []);
  assert.deepEqual(pub.optionVariants, []);
  assert.equal(pub.defaultVariantId, null);
  assert.equal((await check(asA, id, base({ price: 1500 }))).ok, true);
  // The old single-list variants still read as one axis, with no default and no specs.
  const old = await newItem(ids.bizA, { variants: JSON.stringify([{ id: "a", label: "A", price: 100 }, { id: "b", label: "B", price: 200 }]) });
  const p = await publicRead(old);
  assert.equal(p.options.length, 1);
  assert.equal(p.defaultVariantId, null);
  assert.deepEqual(p.optionVariants.map((x) => x.specs), [[], []]);
});

test("duplicating an item keeps the default combination and the variant specs", async () => {
  const id = await newItem();
  const o = small({ defaultChoice: { style: "new", cap: "c" } });
  o.variants[3].specs = [{ group: "Measurements", label: "Weight", value: "1 kg" }];
  await save(asA, id, base({ options: o }));
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [id]))[0].id;
  const rows = await variantRows(copy);
  assert.equal(rows.length, 4);
  const row = await itemRow(copy);
  assert.equal(row.default_variant_id, rows.find((r) => r.combo_key === "style=new|cap=c").id);
  assert.notEqual(row.default_variant_id, (await itemRow(id)).default_variant_id);
  assert.deepEqual(rows.find((r) => r.combo_key === "style=new|cap=c").specs, [{ group: "Measurements", label: "Weight", value: "1 kg" }]);
  assert.equal((await itemRow(id)).default_variant_id !== null, true, "the original is untouched");
  // A copy of an item without a default has none.
  const plain = await newItem();
  await save(asA, plain, base({ options: small() }));
  const plainCopy = (await as(asA, `select seller_duplicate_item($1) as id`, [plain]))[0].id;
  assert.equal((await itemRow(plainCopy)).default_variant_id, null);
});

test("the phone fixture saves and the default is the cheapest in stock when the seller chose none", async () => {
  const f = phone();
  const id = await newItem();
  await save(asA, id, base({ options: asOptions(f) }));
  const pub = await publicRead(id);
  assert.equal(pub.defaultVariantId, null);
  assert.equal(findDefaultVariant(pub.optionVariants, pub.defaultVariantId).choice.color, "grey");
  assert.equal(findDefaultVariant(pub.optionVariants, pub.defaultVariantId).choice.storage, "128");
});
