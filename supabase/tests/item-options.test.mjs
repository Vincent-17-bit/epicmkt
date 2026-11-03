import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { publicOptions, legacyVariantsToOptions, storedOptions, emptyOptions } from "../../shared/src/seller/options.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

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

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const newItem = async (biz = ids.bizA, extra = {}) => {
  const f = { name: "Sneaker", price: 1000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [biz, ...Object.values(f)]))[0].id;
};
const media = async (item, biz = ids.bizA, n = 1) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push((await sql(c, `select attach_item_media($1, 'image', $2, 'image/jpeg', 100, 100, null, 1000) as id`, [item, `${biz}/${item}-${i}.jpg`]))[0].id);
  return out;
};
const base = (o = {}) => ({ name: "Sneaker", description: "", section: "Shoes", price_type: "fixed", price: 1000, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const save = (who, id, fields) => as(who, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const saveFails = (who, id, fields, pattern) => rejects(c, who, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const sellerRead = (id, who = asA) => as(who, `select seller_item_options($1) as r`, [id]).then((r) => r[0].r);
const publicRead = (id) => as({ role: "anon" }, `select public_item_options($1) as r`, [id]).then((r) => r[0].r);
const variantRows = (id) => sql(c, `select * from item_variants where item_id = $1 order by sort`, [id]);

const axes = () => [
  { key: "color", label: "Color", display: "swatch", values: [{ id: "red", label: "Red", color: "#FF0000" }, { id: "blue", label: "Blue", color: "#0000ff" }] },
  { key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }, { id: "m", label: "M" }, { id: "l", label: "L" }] },
];
const v = (color, size, extra = {}) => ({ choice: { color, size }, ...extra });
const withOptions = (variants, a = axes()) => base({ options: { axes: a, variants } });

test("an item without options reads back empty arrays and an empty matrix; saving without the key leaves things alone", async () => {
  const id = await newItem();
  assert.deepEqual(await publicRead(id), emptyOptions());
  const mine = await sellerRead(id);
  assert.deepEqual(mine.axes, []);
  assert.deepEqual(mine.variants, []);
  assert.equal(mine.sizeChartId, null);
  await save(asA, id, base({ price: 1500 }));
  assert.deepEqual(await publicRead(id), emptyOptions());
  assert.deepEqual((await sql(c, `select option_axes, size_chart_id, size_chart_override from items where id = $1`, [id]))[0], { option_axes: [], size_chart_id: null, size_chart_override: null });
});

test("save stores axes and variants; seller and public reads show them; an absent combination is unavailable", async () => {
  const id = await newItem();
  const [m1] = await media(id);
  await save(asA, id, withOptions([
    v("red", "s", { price: 1500, salePrice: 1200, stock: 4, status: "limited_stock", sku: "R-S", mediaIds: [m1] }),
    v("red", "m", { stock: 0 }),
    v("blue", "m", { price: "1800.50" }),
  ]));
  const mine = await sellerRead(id);
  assert.equal(mine.axes.length, 2);
  assert.equal(mine.axes[0].values[0].color, "#ff0000");
  assert.deepEqual(mine.variants.map((x) => [x.choice.color, x.choice.size, x.price, x.salePrice, x.stock, x.status, x.sku]), [
    ["red", "s", 1500, 1200, 4, "limited_stock", "R-S"],
    ["red", "m", null, null, 0, "out_of_stock", null],
    ["blue", "m", 1800.5, null, null, "available", null],
  ]);
  assert.deepEqual(mine.variants[0].mediaIds, [m1]);

  const pub = await publicRead(id);
  assert.equal(pub.optionAvailability.missing, "unavailable");
  assert.deepEqual(pub.optionAvailability.axes, ["color", "size"]);
  assert.equal(pub.optionAvailability.cells.length, 3);
  assert.ok(!pub.optionAvailability.cells.some((x) => x.key === "color=blue|size=s"), "blue/s has no row and so no cell");
  assert.deepEqual(pub.optionAvailability.values.color, { red: "limited_stock", blue: "available" });
  assert.deepEqual(pub.optionAvailability.values.size, { s: "limited_stock", m: "available", l: "unavailable" });
  assert.equal(pub.variants[1].price, 1000, "no variant price: the item's price");
  assert.equal(pub.variants[0].stockLeft, null, "stock counts stay hidden unless the item shows them");
  assert.equal(pub.sizeChart, null);
});

test("a re-save replaces the set: rows keep their id when the combination stays, others are removed", async () => {
  const id = await newItem();
  await save(asA, id, withOptions([v("red", "s", { sku: "A" }), v("red", "m", { sku: "B" })]));
  const before = await variantRows(id);
  await save(asA, id, withOptions([v("red", "m", { sku: "A", price: 900 }), v("blue", "l", { sku: "B" })]));
  const after = await variantRows(id);
  assert.deepEqual(after.map((x) => x.combo_key), ["color=red|size=m", "color=blue|size=l"]);
  assert.equal(after[0].id, before[1].id);
  assert.equal(after[0].sku, "A", "a SKU can move between combinations in one save");
  assert.equal(Number(after[0].price), 900);
});

test("options: null clears axes and variants; axes alone keep every combination unavailable", async () => {
  const id = await newItem();
  await save(asA, id, withOptions([v("red", "s")]));
  await save(asA, id, base({ options: { axes: axes(), variants: [] } }));
  assert.equal((await variantRows(id)).length, 0);
  assert.equal((await sellerRead(id)).axes.length, 2);
  const none = (await publicRead(id)).optionAvailability;
  assert.equal(none.cells.length, 0);
  assert.equal(none.values.color.red, "unavailable");
  await save(asA, id, withOptions([v("red", "s")]));
  await save(asA, id, base({ options: null }));
  assert.deepEqual((await publicRead(id)), emptyOptions());
});

test("limits and malformed input fail with named errors, and a failed save writes nothing", async () => {
  const id = await newItem();
  await save(asA, id, withOptions([v("red", "s")]));
  const four = Array.from({ length: 4 }, (_, i) => ({ key: `a${i}`, label: `A${i}`, display: "button", values: [{ id: "x", label: "X" }] }));
  await saveFails(asA, id, base({ options: { axes: four, variants: [] } }), /invalid_options/);
  const forty1 = [{ key: "a", label: "A", display: "button", values: Array.from({ length: 41 }, (_, i) => ({ id: `v${i}`, label: `V${i}` })) }];
  await saveFails(asA, id, base({ options: { axes: forty1, variants: [] } }), /invalid_options/);
  await saveFails(asA, id, base({ options: { axes: [{ ...axes()[0], display: "grid" }], variants: [] } }), /invalid_options/);
  await saveFails(asA, id, base({ options: { axes: [{ ...axes()[0], values: [{ id: "a", label: "A", color: "red" }] }], variants: [] } }), /invalid_options/);
  await saveFails(asA, id, base({ options: { axes: [], variants: [{ choice: {} }] } }), /invalid_options/);
  await saveFails(asA, id, base({ options: "nope" }), /invalid_options/);
  await saveFails(asA, id, withOptions([v("green", "s")]), /invalid_variant/);
  await saveFails(asA, id, withOptions([{ choice: { color: "red" } }]), /invalid_variant/);
  await saveFails(asA, id, withOptions([v("red", "s", { price: "12,5" })]), /invalid_variant/);
  await saveFails(asA, id, withOptions([v("red", "s", { price: 100, salePrice: 100 })]), /invalid_variant/);
  await saveFails(asA, id, withOptions([v("red", "s", { stock: -3 })]), /invalid_variant/);
  await saveFails(asA, id, withOptions([v("red", "s", { status: "sold" })]), /invalid_variant/);
  await saveFails(asA, id, withOptions([v("red", "s", { mediaIds: ["00000000-0000-4000-8000-000000000000"] })]), /invalid_variant/);
  await saveFails(asA, id, withOptions([v("red", "s"), v("red", "s")]), /duplicate_variant/);
  await saveFails(asA, id, withOptions([v("red", "s", { sku: "X" }), v("red", "m", { sku: "x" })]), /duplicate_sku/);
  assert.equal((await variantRows(id)).length, 1, "the earlier good save is untouched");
});

test("200 variants save; 201 fail with too_many_variants", async () => {
  const id = await newItem();
  const big = [{ key: "a", label: "A", display: "dropdown", values: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, label: `A${i}` })) },
    { key: "b", label: "B", display: "dropdown", values: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, label: `B${i}` })) }];
  const combos = [];
  for (const x of big[0].values) for (const y of big[1].values) combos.push({ choice: { a: x.id, b: y.id } });
  await save(asA, id, base({ options: { axes: big, variants: combos.slice(0, 200) } }));
  assert.equal((await variantRows(id)).length, 200);
  assert.equal((await publicRead(id)).optionAvailability.cells.length, 200);
  await saveFails(asA, id, base({ options: { axes: big, variants: combos.slice(0, 201) } }), /too_many_variants/);
  assert.equal((await variantRows(id)).length, 200);
});

test("variant media must belong to the item; deleting a photo removes it from variants and option values", async () => {
  const a = await newItem();
  const b = await newItem();
  const [mine] = await media(a);
  const [other] = await media(b);
  await saveFails(asA, a, withOptions([v("red", "s", { mediaIds: [other] })]), /invalid_variant/);
  const ax = axes();
  ax[0].values[0].mediaId = mine;
  await saveFails(asA, a, base({ options: { axes: [{ ...ax[0], values: [{ ...ax[0].values[0], mediaId: other }] }], variants: [] } }), /invalid_options/);
  await save(asA, a, withOptions([v("red", "s", { mediaIds: [mine] })], ax));
  assert.equal((await sellerRead(a)).axes[0].values[0].mediaId, mine);
  await sql(c, `delete from item_media where id = $1`, [mine]);
  const r = await sellerRead(a);
  assert.deepEqual(r.variants[0].mediaIds, []);
  assert.equal(r.axes[0].values[0].mediaId, undefined);
});

test("another seller cannot save, read or see variants; the tables are closed to anon", async () => {
  const id = await newItem();
  await save(asA, id, withOptions([v("red", "s")]));
  await saveFails(asB, id, withOptions([v("red", "s")]), /item_not_found/);
  await rejects(c, asB, `select seller_item_options('${id}')`, [], /item_not_found/);
  assert.equal((await as(asB, `select count(*)::int as n from item_variants`))[0].n, 0, "RLS hides the rows");
  assert.equal((await as(asA, `select count(*)::int as n from item_variants`))[0].n, 1);
  await rejects(c, { role: "anon" }, `select * from item_variants`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select * from size_charts`, [], /permission denied/);
  await rejects(c, asA, `insert into item_variants (item_id, business_id, combo_key, choice) values ('${id}', '${ids.bizA}', 'x=y', '{}')`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select seller_item_options('${id}')`, [], /permission denied/);
});

test("the public read is null for items the public cannot see", async () => {
  const id = await newItem();
  await save(asA, id, withOptions([v("red", "s")]));
  await sql(c, `update items set visible = false where id = $1`, [id]);
  assert.equal(await publicRead(id), null);
  await sql(c, `update items set visible = true, availability = 'out_of_stock' where id = $1`, [id]);
  assert.equal(await publicRead(id), null);
  assert.equal(await publicRead("00000000-0000-4000-8000-000000000000"), null);
});

test("stock counts reach buyers only for limited stock on items that show them", async () => {
  const id = await newItem(ids.bizA, { show_stock_count: true });
  await save(asA, id, withOptions([v("red", "s", { stock: 3, status: "limited_stock" }), v("red", "m", { stock: 40 })]));
  const pub = await publicRead(id);
  assert.equal(pub.variants[0].stockLeft, 3);
  assert.equal(pub.variants[1].stockLeft, null);
});

test("the item's flash sale blocks changing variant prices, but not stock or other fields", async () => {
  const id = await newItem();
  await save(asA, id, withOptions([v("red", "s", { price: 1500 })]));
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20)`, [ids.bizA, id]);
  await saveFails(asA, id, withOptions([v("red", "s", { price: 1600 })]), /item_in_flash_sale/);
  await saveFails(asA, id, withOptions([v("red", "s", { price: 1500 }), v("red", "m", { price: 900 })]), /item_in_flash_sale/);
  await save(asA, id, withOptions([v("red", "s", { price: 1500, stock: 7 }), v("red", "m")]));
  assert.equal((await sellerRead(id)).variants[0].stock, 7);
});

test("legacy items.variants becomes one 'option' axis with the same labels and prices", async () => {
  const id = await newItem();
  const legacy = [{ id: "small", label: "Small", price: 3500 }, { id: "medium", label: "Medium", price: 2500 }, { label: "" }, { id: "small", label: "Small again" }];
  await sql(c, `update items set variants = $2::jsonb where id = $1`, [id, JSON.stringify(legacy)]);
  assert.equal((await sql(c, `select item_options_convert_legacy($1) as ok`, [id]))[0].ok, true);
  const r = await sellerRead(id);
  const expected = legacyVariantsToOptions(legacy);
  assert.deepEqual(r.axes, expected.axes, "SQL and JS convert the same way");
  assert.deepEqual(r.variants.map((x) => [x.choice.option, x.price]), expected.variants.map((x) => [x.choice.option, x.price]));
  assert.deepEqual((await sql(c, `select variants from items where id = $1`, [id]))[0].variants, legacy, "the old column is left as it was");
  assert.equal((await sql(c, `select item_options_convert_legacy($1) as ok`, [id]))[0].ok, false, "converting twice does nothing");
  assert.equal((await variantRows(id)).length, 3);
  assert.equal((await publicRead(id)).variants[0].price, 3500);
});

test("empty or unusable legacy variants convert to nothing", async () => {
  const empty = await newItem();
  const junk = await newItem();
  await sql(c, `update items set variants = '[{\"label\":\"\"}, 5]'::jsonb where id = $1`, [junk]);
  assert.equal((await sql(c, `select item_options_convert_legacy($1) as ok`, [empty]))[0].ok, false);
  assert.equal((await sql(c, `select item_options_convert_legacy($1) as ok`, [junk]))[0].ok, false);
  assert.deepEqual((await sql(c, `select option_axes from items where id = $1`, [junk]))[0].option_axes, []);
});

test("duplicate copies axes, variants and the size chart; media ids are parked and remapped once the files are copied", async () => {
  const src = await newItem();
  const [m1, m2] = await media(src, ids.bizA, 2);
  const chart = (await as(asAdmin, `select admin_save_size_chart(null, $1::jsonb) as id`, [JSON.stringify({ name: "Shoes", columns: ["EU", "cm"], rows: [["40", "25"]] })]))[0].id;
  const ax = axes();
  ax[0].values[0].mediaId = m1;
  await save(asA, src, { ...withOptions([v("red", "s", { price: 1500, sku: "R", mediaIds: [m1, m2], stock: 3 }), v("blue", "m")], ax), size_chart_id: chart, size_chart_override: { rows: [["41", "26"]] } });
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [src]))[0].id;

  const rows = await variantRows(copy);
  assert.deepEqual([rows[0].combo_key, Number(rows[0].price), rows[0].sku, rows[0].stock_count], ["color=red|size=s", 1500, "R", 3]);
  assert.deepEqual([rows[1].combo_key, rows[1].price, rows[1].sku, rows[1].stock_count], ["color=blue|size=m", null, null, null]);
  assert.deepEqual(rows[0].media_ids, [], "the new item has no media yet");
  assert.deepEqual(rows[0].copy_media_ids, [m1, m2]);
  const draft = (await sql(c, `select option_axes, size_chart_id, size_chart_override, visible, draft from items where id = $1`, [copy]))[0];
  assert.equal(draft.size_chart_id, chart);
  assert.deepEqual(draft.size_chart_override, { rows: [["41", "26"]] });
  assert.equal(draft.option_axes[0].values[0].copyMediaId, m1);
  assert.equal(draft.option_axes[0].values[0].mediaId, undefined);
  assert.equal((await sellerRead(copy)).axes[0].values[0].mediaId, undefined, "internal keys never leave the database");

  // what seller-item-copy-media does after copying the files
  const [n1, n2] = await media(copy, ids.bizA, 2);
  const map = JSON.stringify({ [m1]: n1, [m2]: n2 });
  assert.equal((await sql(c, `select item_remap_copied_media($1, $2::jsonb) as n`, [copy, map]))[0].n, 1);
  const done = await variantRows(copy);
  assert.deepEqual(done[0].media_ids, [n1, n2]);
  assert.deepEqual(done[0].copy_media_ids, []);
  assert.equal((await sellerRead(copy)).axes[0].values[0].mediaId, n1);
  assert.equal((await sql(c, `select option_axes::text like '%copyMediaId%' as parked from items where id = $1`, [copy]))[0].parked, false);
  assert.equal((await variantRows(src)).length, 2, "the source is untouched");
  assert.deepEqual((await variantRows(src))[0].media_ids, [m1, m2]);
});

test("remapping drops ids that did not copy, and is closed to sellers", async () => {
  const src = await newItem();
  const [m1, m2] = await media(src, ids.bizA, 2);
  await save(asA, src, withOptions([v("red", "s", { mediaIds: [m1, m2] })]));
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [src]))[0].id;
  const [n1] = await media(copy);
  await sql(c, `select item_remap_copied_media($1, $2::jsonb)`, [copy, JSON.stringify({ [m1]: n1 })]);
  assert.deepEqual((await variantRows(copy))[0].media_ids, [n1]);
  await rejects(c, asA, `select item_remap_copied_media('${copy}', '{}')`, [], /permission denied/);
  await rejects(c, undefined, `select item_remap_copied_media('${copy}', '[]')`, [], /invalid_map/);
});

test("duplicating an item without options changes nothing", async () => {
  const src = await newItem();
  const copy = (await as(asA, `select seller_duplicate_item($1) as id`, [src]))[0].id;
  assert.equal((await variantRows(copy)).length, 0);
  assert.deepEqual((await publicRead(src)), emptyOptions());
  assert.deepEqual((await sql(c, `select option_axes from items where id = $1`, [copy]))[0].option_axes, []);
});

test("bulk price change scales variant prices too, skipping items in a flash sale", async () => {
  const a = await newItem();
  const b = await newItem();
  const plain = await newItem();
  await save(asA, a, withOptions([v("red", "s", { price: 2000, salePrice: 1500 }), v("red", "m")]));
  await save(asA, b, withOptions([v("red", "s", { price: 2000 })]));
  await sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20)`, [ids.bizA, b]);
  const r = (await as(asA, `select seller_bulk_items('price_percent', $1::uuid[], '{"percent":10}') as r`, [[a, b, plain]]))[0].r;
  assert.equal(r.affected, 2);
  const va = (await variantRows(a));
  assert.equal(Number(va[0].price), 2200);
  assert.equal(Number(va[0].sale_price), 1650);
  assert.equal(va[1].price, null, "inheriting variants stay inheriting");
  assert.equal(Number((await variantRows(b))[0].price), 2000, "flash sale items are skipped, variants included");
  assert.equal(Number((await sql(c, `select price from items where id = $1`, [a]))[0].price), 1100);
});

test("bulk price change refuses a variant price that would overflow", async () => {
  const a = await newItem();
  await save(asA, a, withOptions([v("red", "s", { price: "9999999999" })]));
  await rejects(c, asA, `select seller_bulk_items('price_percent', '{${a}}'::uuid[], '{"percent":10}')`, [], /price_too_large/);
});

test("deleting an item removes its variants", async () => {
  const id = await newItem();
  await media(id);
  await save(asA, id, withOptions([v("red", "s")]));
  await sql(c, `delete from items where id = $1`, [id]);
  assert.equal((await sql(c, `select count(*)::int as n from item_variants`))[0].n, 0);
});

// ---- size charts ----

const chartFields = (o = {}) => ({ name: "Shoes EU", category: "barber", unit: "cm", columns: ["EU", "Foot length"], rows: [["40", "25"], ["41", "25.5"]], ...o });
const saveChart = (who, id, f) => as(who, `select admin_save_size_chart($1, $2::jsonb) as id`, [id, JSON.stringify(f)]).then((r) => r[0].id);

test("admin creates, lists, edits and deletes size charts; sellers cannot", async () => {
  const id = await saveChart(asAdmin, null, chartFields());
  const list = (await as(asAdmin, `select admin_size_charts_list() as r`))[0].r;
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].name, list[0].category, list[0].unit, list[0].items_using], ["Shoes EU", "barber", "cm", 0]);
  await saveChart(asAdmin, id, chartFields({ name: "Shoes EU v2", rows: [["40", "25"]] }));
  assert.equal((await sql(c, `select name, jsonb_array_length(rows) as n from size_charts where id = $1`, [id]))[0].n, 1);
  assert.ok((await sql(c, `select 1 from audit_log where action = 'size_chart.create' and target_id = $1`, [id])).length === 1);
  await rejects(c, asA, `select admin_save_size_chart(null, '${JSON.stringify(chartFields())}')`, [], /forbidden/);
  await rejects(c, asA, `select admin_size_charts_list()`, [], /forbidden/);
  await rejects(c, asA, `select admin_delete_size_chart('${id}')`, [], /forbidden/);
  await as(asAdmin, `select admin_delete_size_chart($1)`, [id]);
  assert.equal((await sql(c, `select count(*)::int as n from size_charts`))[0].n, 0);
});

test("chart validation: name, unit, category, columns and rectangular rows", async () => {
  const bad = (f, p) => rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields(f))], p);
  await bad({ name: "x" }, /invalid_name/);
  await bad({ unit: "yd" }, /invalid_unit/);
  await bad({ category: "nope" }, /invalid_category/);
  await bad({ columns: [] }, /invalid_chart/);
  await bad({ columns: ["A", "a"] }, /invalid_chart/);
  await bad({ rows: [["40"]] }, /invalid_chart/);
  await bad({ rows: [] }, /invalid_chart/);
  await bad({ rows: [["40", "x".repeat(21)]] }, /invalid_chart/);
  await bad({ rows: Array(61).fill(["1", "2"]) }, /invalid_chart/);
  await saveChart(asAdmin, null, chartFields());
  await bad({ name: " shoes eu " }, /duplicate_chart/);
});

test("a seller points an item at one chart and may override its rows; the public read shows what applies", async () => {
  const chart = await saveChart(asAdmin, null, chartFields());
  const id = await newItem();
  await save(asA, id, { ...base(), size_chart_id: chart });
  let pub = (await publicRead(id)).sizeChart;
  assert.deepEqual([pub.name, pub.unit, pub.overridden], ["Shoes EU", "cm", false]);
  assert.deepEqual(pub.rows, [["40", "25"], ["41", "25.5"]]);

  await save(asA, id, { ...base(), size_chart_override: { rows: [["42", "26"]] } });
  pub = (await publicRead(id)).sizeChart;
  assert.equal(pub.overridden, true);
  assert.deepEqual(pub.rows, [["42", "26"]]);
  assert.deepEqual((await sellerRead(id)).sizeChartOverride, { rows: [["42", "26"]] });

  await saveFails(asA, id, { ...base(), size_chart_override: { rows: [["42"]] } }, /invalid_size_chart/);
  await saveFails(asA, id, { ...base(), size_chart_override: { rows: [["42", "26"]], extra: 1 } }, /invalid_size_chart/);
  await saveFails(asA, id, { ...base(), size_chart_id: "00000000-0000-4000-8000-000000000000" }, /invalid_size_chart/);
  await saveFails(asA, id, { ...base(), size_chart_id: "nope" }, /invalid_size_chart/);

  await save(asA, id, { ...base(), size_chart_override: null });
  assert.equal((await publicRead(id)).sizeChart.overridden, false);
  await save(asA, id, { ...base(), size_chart_override: { rows: [["42", "26"]] } });
  await save(asA, id, { ...base(), size_chart_id: null });
  assert.equal((await publicRead(id)).sizeChart, null);
  assert.equal((await sellerRead(id)).sizeChartOverride, null, "clearing the chart clears the override");
  await saveFails(asA, id, { ...base(), size_chart_override: { rows: [["42", "26"]] } }, /invalid_size_chart/);
});

test("changing chart clears the override; a retired chart is hidden from buyers and cannot be newly picked; a chart in use cannot be deleted", async () => {
  const one = await saveChart(asAdmin, null, chartFields());
  const two = await saveChart(asAdmin, null, chartFields({ name: "Shoes UK" }));
  const id = await newItem();
  await save(asA, id, { ...base(), size_chart_id: one });
  await save(asA, id, { ...base(), size_chart_override: { rows: [["42", "26"]] } });
  await save(asA, id, { ...base(), size_chart_id: two });
  assert.equal((await sellerRead(id)).sizeChartOverride, null);
  await save(asA, id, { ...base(), size_chart_id: two });   // same chart again
  await rejects(c, asAdmin, `select admin_delete_size_chart('${two}')`, [], /size_chart_in_use/);
  await saveChart(asAdmin, two, chartFields({ name: "Shoes UK", active: false }));
  assert.equal((await publicRead(id)).sizeChart, null);
  await save(asA, id, { ...base(), size_chart_id: two });   // keeping a retired chart is allowed
  const other = await newItem();
  await saveFails(asA, other, { ...base(), size_chart_id: two }, /invalid_size_chart/);
  assert.equal((await sql(c, `select count(*)::int as n from public_size_charts`))[0].n, 1);
  assert.equal((await as({ role: "anon" }, `select count(*)::int as n from public_size_charts`))[0].n, 1);
});

test("an override that no longer fits after the admin changes the columns falls back to the chart", async () => {
  const chart = await saveChart(asAdmin, null, chartFields());
  const id = await newItem();
  await save(asA, id, { ...base(), size_chart_id: chart, size_chart_override: { rows: [["42", "26"]] } });
  await saveChart(asAdmin, chart, chartFields({ columns: ["EU", "Foot length", "UK"], rows: [["40", "25", "6"]] }));
  const pub = (await publicRead(id)).sizeChart;
  assert.equal(pub.overridden, false);
  assert.deepEqual(pub.rows, [["40", "25", "6"]]);
});

test("the SQL payload and the shared JS builder agree", async () => {
  const chart = await saveChart(asAdmin, null, chartFields());
  const id = await newItem(ids.bizA, { show_stock_count: true, sale_price: 900 });
  const [m1] = await media(id);
  const ax = axes();
  ax[1].values[1].mediaId = m1;
  const input = [v("red", "s", { price: 1500, salePrice: 1200, stock: 2, status: "limited_stock", sku: "A", mediaIds: [m1] }), v("red", "m", { stock: 0 }), v("blue", "l")];
  const js = storedOptions({ axes: ax, variants: input }, { mediaIds: new Set([m1]) });
  assert.equal(js.ok, true);
  await save(asA, id, { ...withOptions(input, ax), sale_price: 900, size_chart_id: chart });
  const sqlPayload = await publicRead(id);
  const rows = await variantRows(id);
  const stored = rows.map((r, i) => ({ ...js.value.variants[i], id: r.id }));
  const built = publicOptions({
    axes: js.value.axes, variants: stored, item: { price: 1000, salePrice: 900, showStockCount: true },
    chart: { id: chart, name: "Shoes EU", category: "barber", unit: "cm", columns: ["EU", "Foot length"], rows: [["40", "25"], ["41", "25.5"]], active: true }, override: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sqlPayload)), JSON.parse(JSON.stringify(built)));
});
