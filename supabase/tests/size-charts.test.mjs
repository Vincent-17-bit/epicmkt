import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, asA, asB, asAdmin, ids } from "./db.mjs";
import { SEED_SIZE_CHARTS, cleanShoeConversion, shoeChartFrom, shoeChartRows, convertShoe } from "../../shared/src/sizeCharts.js";
import { SHOE_CHART } from "../../shared/src/scales/shoeChart.js";

let c;
const anon = { role: "anon" };
const asService = { role: "service_role" };
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_size_charts" }));
  await seedFixtures(c);
  // product types the tests attach charts to (A06 seeds the real ones)
  for (const id of ["dress", "shirt", "t-hat", "t-scarf", "t-coat"]) await sql(c, `insert into product_types (id, slug, name) values ($1, $1, $1) on conflict do nothing`, [id]);
});
after(async () => { await c.end(); });

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const chartFields = (o = {}) => ({ name: "T-Chart", unit: "cm", columns: ["Size", "Bust"], rows: [["S", "84"], ["M", "90"]], ...o });
const save = (who, id, f) => as(who, `select admin_save_size_chart($1, $2::jsonb) as id`, [id, JSON.stringify(f)]).then((r) => r[0].id);
const clean = async () => { await sql(c, `update product_types set size_chart_id = null where id like 't-%'`); await sql(c, `delete from size_charts where name like 'T-%'`); };
const typeChart = async (id) => (await sql(c, `select size_chart_id from product_types where id = $1`, [id]))[0].size_chart_id;
const typesOf = async (chartId) => (await sql(c, `select array_agg(id order by id) as ids from product_types where size_chart_id = $1`, [chartId]))[0].ids ?? [];
const shoeRow = (eu, uk, usM, usW, cm) => ({ eu, uk, usM, usW, cm });
const adultRows = () => shoeChartRows().adult;

test("seeds: five charts and the default shoe conversion chart, equal to the shared data", async () => {
  const rows = await sql(c, `select name, category, unit, columns, rows from size_charts where name not like 'T-%' order by name`);
  assert.equal(rows.length, SEED_SIZE_CHARTS.length);
  for (const seed of SEED_SIZE_CHARTS) {
    const got = rows.find((r) => r.name === seed.name);
    assert.ok(got, seed.name);
    assert.deepEqual([got.category, got.unit, got.columns, got.rows], [seed.category, seed.unit, seed.columns, seed.rows], seed.name);
  }
  const shoe = (await sql(c, `select chart, version from shoe_conversion where id = 'default'`))[0];
  assert.deepEqual(shoe.chart, shoeChartRows(SHOE_CHART));
  assert.equal(shoe.version, 1);
  assert.equal(cleanShoeConversion(shoe.chart).ok, true);
});
test("seeds: the dress chart is XS to XL in cm of bust, waist and hip; the collar chart is in inches; shoe charts list EU, UK, US and cm", async () => {
  const byName = Object.fromEntries((await sql(c, `select name, unit, columns, rows from size_charts`)).map((r) => [r.name, r]));
  assert.deepEqual(byName["Dresses and tops (cm)"].rows.map((r) => r[0]), ["XS", "S", "M", "L", "XL"]);
  assert.deepEqual(byName["Dresses and tops (cm)"].columns, ["Size", "Bust", "Waist", "Hip"]);
  assert.equal(byName["Shirt collar"].unit, "in");
  assert.deepEqual(byName["Men's shoes"].columns, ["EU", "UK", "US men", "Foot length (cm)"]);
  assert.deepEqual(byName["Women's shoes"].columns, ["EU", "UK", "US women", "Foot length (cm)"]);
  assert.deepEqual(byName["Kids clothes (age)"].columns, ["Age", "Height", "Chest", "Waist"]);
  assert.deepEqual(byName["Men's shoes"].rows.find((r) => r[0] === "42"), ["42", "8", "9", "26.7"]);
  assert.deepEqual(byName["Women's shoes"].rows.find((r) => r[0] === "42"), ["42", "8", "10", "26.7"]);
});
test("attach_default_size_charts: points dress and shirt at their charts when they have none; repeating changes nothing; service role only", async () => {
  assert.equal((await sql(c, `select count(*)::int as n from product_types where size_chart_id is not null and id in ('dress', 'shirt')`))[0].n, 0, "the migration ran before the types existed");
  assert.equal((await as(asService, `select attach_default_size_charts() as n`))[0].n, 2);
  assert.equal((await as(asService, `select attach_default_size_charts() as n`))[0].n, 0);
  const view = Object.fromEntries((await as(anon, `select name, product_type_ids from public_size_charts`)).map((r) => [r.name, r.product_type_ids]));
  for (const seed of SEED_SIZE_CHARTS) assert.deepEqual(view[seed.name], seed.productTypeIds, seed.name);
  await sql(c, `update product_types set size_chart_id = null where id = 'dress'`);
  await sql(c, `update product_types set size_chart_id = (select id from size_charts where name = 'Men''s shoes') where id = 'shirt'`);
  assert.equal((await as(asService, `select attach_default_size_charts() as n`))[0].n, 1, "a type that already has a chart keeps it");
  assert.equal((await sql(c, `select name from size_charts where id = (select size_chart_id from product_types where id = 'shirt')`))[0].name, "Men's shoes");
  await sql(c, `update product_types set size_chart_id = (select id from size_charts where name = 'Shirt collar') where id = 'shirt'`);
  await rejects(c, asAdmin, `select attach_default_size_charts()`, [], /permission denied/);
  await rejects(c, anon, `select attach_default_size_charts()`, [], /permission denied/);
});

test("public read: anyone can read the active charts (with their types), the shoe chart, and charts by type; the tables stay closed", async () => {
  for (const who of [anon, asA, asAdmin]) {
    assert.equal((await as(who, `select count(*)::int as n from public_size_charts`))[0].n, SEED_SIZE_CHARTS.length);
    assert.equal((await as(who, `select version from public_shoe_conversion`))[0].version, 1);
  }
  const dress = (await as(anon, `select size_charts_for_type('dress') as r`))[0].r;
  assert.deepEqual(dress.map((x) => x.name), ["Dresses and tops (cm)"]);
  assert.deepEqual(dress[0].product_type_ids, ["dress"]);
  assert.deepEqual(Object.keys(dress[0]).sort(), ["category", "columns", "id", "name", "product_type_ids", "rows", "unit"]);
  assert.deepEqual((await as(anon, `select size_charts_for_type('shirt') as r`))[0].r.map((x) => x.name), ["Shirt collar"]);
  assert.deepEqual((await as(anon, `select size_charts_for_type('nothing') as r`))[0].r, []);
  assert.deepEqual((await as(anon, `select size_charts_for_type(null, null) as r`))[0].r, []);
  await rejects(c, anon, `select count(*) from size_charts`, [], /permission denied/);
  await rejects(c, anon, `select count(*) from shoe_conversion`, [], /permission denied/);
  assert.equal((await as(asA, `select count(*)::int as n from shoe_conversion`))[0].n, 0);
});
test("public read by type: the type's one chart; otherwise the category's charts that no type uses; switched-off charts are never shown", async () => {
  await clean();
  const general = await save(asAdmin, null, chartFields({ name: "T-Barber general", category: "barber" }));
  await save(asAdmin, null, chartFields({ name: "T-Barber typed", category: "barber", product_type_ids: ["t-coat"] }));
  await save(asAdmin, null, chartFields({ name: "T-Barber hidden", category: "barber", active: false }));
  const hat = await save(asAdmin, null, chartFields({ name: "T-Hat chart", product_type_ids: ["t-hat"] }));
  const names = async (t, cat) => (await as(anon, `select size_charts_for_type($1, $2) as r`, [t, cat]))[0].r.map((x) => x.name);
  assert.deepEqual(await names("t-hat", "barber"), ["T-Hat chart"]);
  assert.deepEqual(await names("t-coat", "barber"), ["T-Barber typed"]);
  assert.deepEqual(await names("t-scarf", "barber"), ["T-Barber general"], "a type with no chart falls back to the category's untyped charts");
  assert.deepEqual(await names("unknown-type", "barber"), ["T-Barber general"]);
  assert.deepEqual(await names("t-scarf", null), []);
  assert.deepEqual(await names("t-scarf", "other"), []);
  await sql(c, `update size_charts set active = false where id = $1`, [hat]);
  assert.deepEqual(await names("t-hat", null), [], "a switched-off chart is not shown");
  assert.deepEqual(await names("t-hat", "barber"), ["T-Barber general"], "and the type falls back to the category");
  assert.deepEqual((await as(anon, `select product_type_ids from public_size_charts where id = $1`, [general]))[0].product_type_ids, []);
  await sql(c, `update product_types set active = false where id = 't-coat'`);
  assert.deepEqual(await names("t-coat", null), [], "a switched-off type has no chart");
  await sql(c, `update product_types set active = true where id = 't-coat'`);
  await clean();
});

test("admin writes size charts with product types; sellers and anon cannot", async () => {
  await clean();
  const id = await save(asAdmin, null, chartFields({ product_type_ids: ["t-hat", "t-scarf"] }));
  assert.deepEqual(await typesOf(id), ["t-hat", "t-scarf"], "the types now point at the chart (product_types.size_chart_id)");
  assert.equal((await sql(c, `select 1 from audit_log where action = 'size_chart.create' and target_id = $1`, [id])).length, 1);
  assert.deepEqual((await as(asAdmin, `select admin_size_charts_list() as r`))[0].r.find((x) => x.id === id).product_type_ids, ["t-hat", "t-scarf"]);
  assert.deepEqual((await as(anon, `select product_type_ids from public_size_charts where id = $1`, [id]))[0].product_type_ids, ["t-hat", "t-scarf"]);
  const seller = (await as(asA, `select jsonb_path_query_array(seller_product_types() -> 'types', '$[*] ? (@.id == "t-hat").sizeChartId') as r`))[0].r;
  assert.deepEqual(seller, [id], "seller_product_types already returns the type's sizeChartId (A08)");
  await rejects(c, asA, `select admin_save_size_chart(null, '${JSON.stringify(chartFields({ name: "T-Nope" }))}')`, [], /forbidden/);
  await rejects(c, anon, `select admin_save_size_chart(null, '${JSON.stringify(chartFields({ name: "T-Nope" }))}')`, [], /permission denied/);
  assert.equal((await sql(c, `select count(*)::int as n from size_charts where name = 'T-Nope'`))[0].n, 0);
  await clean();
});
test("product_type_ids: an absent key changes nothing, [] or null releases the types, a type moves from its old chart, bad lists are refused", async () => {
  await clean();
  const a = await save(asAdmin, null, chartFields({ name: "T-A", product_type_ids: ["t-hat"] }));
  await save(asAdmin, a, chartFields({ name: "T-A renamed" }));
  assert.deepEqual(await typesOf(a), ["t-hat"], "an absent key keeps the types");
  const b = await save(asAdmin, null, chartFields({ name: "T-B", product_type_ids: ["t-hat", "t-coat"] }));
  assert.deepEqual([await typesOf(a), await typesOf(b)], [[], ["t-coat", "t-hat"]], "a type has one chart: t-hat moved to B");
  await save(asAdmin, b, chartFields({ name: "T-B", product_type_ids: ["t-coat"] }));
  assert.deepEqual([await typeChart("t-hat"), await typesOf(b)], [null, ["t-coat"]], "a type left out of the list is released");
  await save(asAdmin, b, chartFields({ name: "T-B", product_type_ids: [] }));
  assert.deepEqual(await typesOf(b), []);
  await save(asAdmin, b, chartFields({ name: "T-B", product_type_ids: ["t-coat"] }));
  await save(asAdmin, b, chartFields({ name: "T-B", product_type_ids: null }));
  assert.deepEqual(await typesOf(b), []);
  const bad = (ids) => rejects(c, asAdmin, `select admin_save_size_chart($1, $2::jsonb)`, [b, JSON.stringify(chartFields({ name: "T-B", product_type_ids: ids }))], /invalid_type_ids/);
  await bad(["no-such-type"]); await bad(["t-hat", "t-hat"]); await bad("t-hat"); await bad([5]); await bad([null]); await bad(["t-hat", "nope"]); await bad({ id: "t-hat" });
  await bad(Array.from({ length: 21 }, (_, i) => `t-${i}`));
  assert.deepEqual(await typesOf(b), [], "a refused save changes nothing");
  assert.equal((await sql(c, `select name from size_charts where id = $1`, [b]))[0].name, "T-B");
  await rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields({ name: "T-New", product_type_ids: ["nope"] }))], /invalid_type_ids/);
  assert.equal((await sql(c, `select count(*)::int as n from size_charts where name = 'T-New'`))[0].n, 0, "a refused create writes nothing");
  await clean();
});
test("a chart a type uses cannot be deleted, and the database enforces the link", async () => {
  await clean();
  const id = await save(asAdmin, null, chartFields({ product_type_ids: ["t-scarf"] }));
  await rejects(c, asAdmin, `select admin_delete_size_chart($1)`, [id], /size_chart_in_use/);
  await rejects(c, asAdmin, `delete from size_charts where id = $1`, [id], /permission denied|violates foreign key/).catch(async () => rejects(c, { role: "service_role" }, `delete from size_charts where id = $1`, [id], /foreign key/));
  await rejects(c, { role: "service_role" }, `update product_types set size_chart_id = gen_random_uuid() where id = 't-hat'`, [], /foreign key/);
  await save(asAdmin, id, chartFields({ product_type_ids: [] }));
  await as(asAdmin, `select admin_delete_size_chart($1)`, [id]);
  assert.equal((await sql(c, `select count(*)::int as n from size_charts where id = $1`, [id]))[0].n, 0);
  await clean();
});
test("what A04 already did still holds: same errors, deleting an unused chart, items keep using their chart", async () => {
  await clean();
  const bad = (f, p) => rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields(f))], p);
  await bad({ name: "x" }, /invalid_name/); await bad({ unit: "yd" }, /invalid_unit/); await bad({ category: "nope" }, /invalid_category/);
  await bad({ columns: [] }, /invalid_chart/); await bad({ rows: [["S"]] }, /invalid_chart/);
  const id = await save(asAdmin, null, chartFields());
  await save(asAdmin, null, chartFields({ name: "T-Chart2" }));
  await rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields())], /duplicate_chart/);
  assert.deepEqual((await as(asAdmin, `select admin_size_charts_list() as r`))[0].r.find((x) => x.id === id).product_type_ids, []);
  await as(asAdmin, `select admin_delete_size_chart($1)`, [id]);
  assert.equal((await sql(c, `select count(*)::int as n from size_charts where id = $1`, [id]))[0].n, 0);
  await clean();
});

test("admin saves the shoe conversion chart: owner only, validated, versioned, audited, and the public read follows", async () => {
  const edited = shoeChartRows();
  edited.adult[7].cm = 26.8; // EU 42
  assert.equal((await as(asAdmin, `select admin_save_shoe_conversion($1::jsonb) as v`, [JSON.stringify(edited)]))[0].v, 2);
  const pub = (await as(anon, `select chart, version from public_shoe_conversion`))[0];
  assert.equal(pub.version, 2);
  assert.equal(pub.chart.adult[7].cm, 26.8);
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where action = 'shoe_conversion.update'`))[0].n, 1);
  await rejects(c, asA, `select admin_save_shoe_conversion($1::jsonb)`, [JSON.stringify(edited)], /forbidden/);
  await rejects(c, anon, `select admin_save_shoe_conversion($1::jsonb)`, [JSON.stringify(edited)], /permission denied/);
  assert.equal((await sql(c, `select version from shoe_conversion`))[0].version, 2);
  await as(asAdmin, `select admin_save_shoe_conversion($1::jsonb)`, [JSON.stringify(shoeChartRows())]);
  assert.equal((await sql(c, `select version from shoe_conversion`))[0].version, 3);
});
test("an admin edit reaches convertShoe: the chart read from the public view changes the answer", async () => {
  const edited = shoeChartRows();
  edited.adult = edited.adult.map((r) => ({ ...r, cm: Math.round((r.cm + 1) * 10) / 10 })); // every foot 1 cm longer
  edited.kids = edited.kids.map((r) => ({ ...r, cm: Math.round((r.cm + 1) * 10) / 10 }));
  await as(asAdmin, `select admin_save_shoe_conversion($1::jsonb)`, [JSON.stringify(edited)]);
  const row = (await as(anon, `select chart, version from public_shoe_conversion`))[0];
  const fromDb = shoeChartFrom(row);
  assert.equal(fromDb.version, row.version);
  assert.equal(convertShoe({ system: "eu", value: 42 }, "cm", fromDb).value.value, 27.7);
  assert.equal(convertShoe({ system: "eu", value: 42 }, "cm").value.value, 26.7);
  await as(asAdmin, `select admin_save_shoe_conversion($1::jsonb)`, [JSON.stringify(shoeChartRows())]);
});

// The database and cleanShoeConversion must agree on every case.
const cases = () => {
  const ok = shoeChartRows();
  const mut = (fn) => { const x = shoeChartRows(); fn(x); return x; };
  return [
    ["default chart", ok, true],
    ["no kids", { adult: ok.adult }, true],
    ["empty kids", { adult: ok.adult, kids: [] }, true],
    ["two adult rows", { adult: ok.adult.slice(0, 2), kids: [] }, true],
    ["one adult row", { adult: ok.adult.slice(0, 1) }, false],
    ["no adult", { kids: ok.kids }, false],
    ["adult not a list", { adult: "x" }, false],
    ["not an object", [1, 2], false],
    ["EU not rising", mut((x) => { x.adult[3].eu = x.adult[2].eu; }), false],
    ["cm falls", mut((x) => { x.adult[5].cm = 20; }), false],
    ["UK falls", mut((x) => { x.adult[4].uk = 1; }), false],
    ["adult UK missing", mut((x) => { x.adult[2].uk = null; }), false],
    ["adult US men missing", mut((x) => { delete x.adult[2].usM; }), false],
    ["kids UK present and rising", mut((x) => { x.kids[0].uk = 1; x.kids[1].uk = 2; }), true],
    ["kids UK present and falling", mut((x) => { x.kids[0].uk = 3; x.kids[1].uk = 2; }), false],
    ["kids overlap adult (cm)", mut((x) => { x.kids[15].cm = 22.5; }), false],
    ["kids overlap adult (EU)", mut((x) => { x.kids[15].eu = 36; x.kids[15].cm = 21.5; }), false],
    ["EU too small", mut((x) => { x.kids[0].eu = 9; }), false],
    ["cm too big", mut((x) => { x.adult[13].cm = 41; }), false],
    ["cm too small", mut((x) => { x.kids[0].cm = 7; }), false],
    ["UK out of range", mut((x) => { x.adult[13].uk = 26; }), false],
    ["a size as text", mut((x) => { x.adult[0].eu = "35"; }), false],
    ["extra column", mut((x) => { x.adult[0].width = 1; }), false],
    ["extra top-level key", { ...ok, widths: [] }, false],
    ["row is a list", mut((x) => { x.adult[0] = [35, 2.5]; }), false],
    ["61 kids rows", { adult: ok.adult, kids: Array.from({ length: 61 }, (_, i) => ({ eu: 10 + i * 0.5, uk: null, usM: null, usW: null, cm: 8 + i * 0.2 })) }, false]
  ];
};
test("validation parity: the database function and cleanShoeConversion give the same answer on every case", async () => {
  for (const [name, chart, want] of cases()) {
    const js = cleanShoeConversion(chart).ok;
    const db = (await sql(c, `select shoe_chart_valid($1::jsonb) as ok`, [JSON.stringify(chart)]))[0].ok;
    assert.equal(js, want, `JS: ${name}`);
    assert.equal(db, want, `DB: ${name}`);
  }
});
test("an invalid chart is refused by admin_save_shoe_conversion and nothing is written", async () => {
  const before = (await sql(c, `select version, chart from shoe_conversion`))[0];
  for (const [name, chart, want] of cases()) {
    if (want) continue;
    await rejects(c, asAdmin, `select admin_save_shoe_conversion($1::jsonb)`, [JSON.stringify(chart)], /invalid_shoe_chart/);
  }
  await rejects(c, asAdmin, `select admin_save_shoe_conversion(null)`, [], /invalid_shoe_chart/);
  const after = (await sql(c, `select version, chart from shoe_conversion`))[0];
  assert.deepEqual(after, before);
});
test("the shoe table has one row only and cannot be written by a seller or anon", async () => {
  await rejects(c, asAdmin, `insert into shoe_conversion (id, chart) values ('other', '{}')`, [], /permission denied|violates check/);
  await rejects(c, asA, `update shoe_conversion set version = 99`, [], /permission denied/);
  await rejects(c, anon, `delete from shoe_conversion`, [], /permission denied/);
  assert.equal((await sql(c, `select count(*)::int as n from shoe_conversion`))[0].n, 1);
});

test("admin sets or clears one item's size chart: owner only, active chart, override dropped, audited, and the list follows", async () => {
  await clean();
  const chart = await save(asAdmin, null, chartFields({ name: "T-Item chart" }));
  const other = await save(asAdmin, null, chartFields({ name: "T-Item other" }));
  const off = await save(asAdmin, null, chartFields({ name: "T-Item off", active: false }));
  const item = (await sql(c, `insert into items (business_id, name, price) values ('${ids.bizA}', 'T-Sundress', 900) returning id`))[0].id;
  const chartOf = async () => (await sql(c, `select size_chart_id, size_chart_override from items where id = $1`, [item]))[0];
  const set = (who, ch) => as(who, `select admin_set_item_size_chart($1, $2) as ok`, [item, ch]);

  await rejects(c, asA, `select admin_set_item_size_chart($1, $2)`, [item, chart], /forbidden/);
  await rejects(c, asAdmin, `select admin_set_item_size_chart($1, $2)`, ["00000000-0000-0000-0000-000000000000", chart], /item_not_found/);
  await rejects(c, asAdmin, `select admin_set_item_size_chart($1, $2)`, [item, "00000000-0000-0000-0000-000000000000"], /chart_not_found/);
  await rejects(c, asAdmin, `select admin_set_item_size_chart($1, $2)`, [item, off], /chart_inactive/);

  assert.equal((await set(asAdmin, chart))[0].ok, true);
  assert.equal((await chartOf()).size_chart_id, chart);
  await sql(c, `update items set size_chart_override = $2::jsonb where id = $1`, [item, JSON.stringify({ rows: [["S", "85"], ["M", "91"]] })]);
  assert.notEqual((await chartOf()).size_chart_override, null); // the item had its own rows
  await set(asAdmin, other);
  assert.deepEqual(await chartOf(), { size_chart_id: other, size_chart_override: null });
  const audits = async () => (await sql(c, `select count(*)::int as n from audit_log where action = 'item.size_chart'`))[0].n;
  const before = await audits();
  await set(asAdmin, other); // same chart again: nothing to change, nothing to audit
  assert.equal(await audits(), before);

  const listed = (await as(asAdmin, `select admin_items_for_size_chart($1, null, 30) as r`, [other]))[0].r;
  assert.deepEqual(listed.map((r) => [r.name, r.business_name, r.size_chart_name]), [["T-Sundress", "Shop A", "T-Item other"]]);
  const found = (await as(asAdmin, `select admin_items_for_size_chart(null, 'sundr', 30) as r`))[0].r;
  assert.equal(found[0].id, item);
  assert.deepEqual((await as(asAdmin, `select admin_items_for_size_chart(null, null, 30) as r`))[0].r, []);
  assert.deepEqual((await as(asAdmin, `select admin_items_for_size_chart(null, '%', 30) as r`))[0].r, []); // a wildcard is text, not a pattern
  await rejects(c, asA, `select admin_items_for_size_chart(null, 'x', 30)`, [], /forbidden/);

  await rejects(c, asAdmin, `select admin_delete_size_chart($1)`, [other], /size_chart_in_use/);
  await set(asAdmin, null);
  assert.deepEqual(await chartOf(), { size_chart_id: null, size_chart_override: null });
  await sql(c, `delete from items where id = $1`, [item]);
  await clean();
});

// ---- Seller-owned size guide (0103) ----
const guideItem = async (biz = ids.bizA) => {
  const id = (await sql(c, `insert into items (business_id, name, price, price_type, availability, visible) values ($1, 'Runner', 1000, 'fixed', 'available', true) returning id`, [biz]))[0].id;
  await sql(c, `select attach_item_media($1, 'image', $2, 'image/jpeg', 100, 100, null, 1000)`, [id, `${biz}/${id}.jpg`]);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
  return id;
};
const guideOf = (rows = [["EU 40", "6.5"], ["EU 41", "7.5"]]) => ({ unit: "cm", columns: ["Size", "UK"], rows });
const setGuide = (who, id, g) => as(who, `select seller_set_item_size_guide($1, $2::jsonb) as ok`, [id, g === null ? null : JSON.stringify(g)]);
const readGuide = (who, id) => as(who, `select seller_item_size_guide($1) as g`, [id]).then((r) => r[0].g);
const publicChart = (id) => as(anon, `select public_item_options($1) as r`, [id]).then((r) => r[0].r?.sizeChart ?? null);

test("size guide: a seller saves, reads back and removes the guide of their own item; the audit log records it", async () => {
  const id = await guideItem();
  assert.equal(await readGuide(asA, id), null);
  assert.equal((await setGuide(asA, id, guideOf()))[0].ok, true);
  assert.deepEqual(await readGuide(asA, id), guideOf());
  const log = await sql(c, `select action from audit_log where target_id = $1 and action like 'item_size_guide_%' order by created_at`, [id]);
  assert.deepEqual(log.map((r) => r.action), ["item_size_guide_saved"]);
  await setGuide(asA, id, guideOf());
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where target_id = $1 and action like 'item_size_guide_%'`, [id]))[0].n, 1, "saving the same guide again writes nothing");
  await setGuide(asA, id, null);
  assert.equal(await readGuide(asA, id), null);
  assert.equal((await sql(c, `select size_guide from items where id = $1`, [id]))[0].size_guide, null);
});

test("size guide: another shop, anonymous callers and admins-as-sellers cannot touch it", async () => {
  const id = await guideItem();
  await rejects(c, asB, `select seller_set_item_size_guide($1, $2::jsonb)`, [id, JSON.stringify(guideOf())], /item_not_found/);
  await rejects(c, asB, `select seller_item_size_guide($1)`, [id], /item_not_found/);
  await rejects(c, anon, `select seller_set_item_size_guide($1, $2::jsonb)`, [id, JSON.stringify(guideOf())], /permission denied/);
  await rejects(c, anon, `select seller_item_size_guide($1)`, [id], /permission denied/);
  assert.equal(await readGuide(asA, id), null, "nothing was written");
});

test("size guide: rules match the shared checks (width, empties, limits, unit, extra keys); the table itself refuses bad data too", async () => {
  const id = await guideItem();
  const bad = [
    { ...guideOf(), rows: [] }, { ...guideOf(), rows: [["S"]] }, { ...guideOf(), rows: [["S", " "]] }, { ...guideOf(), columns: ["Size", "Size"].map((x, i) => (i ? "" : x)) },
    { ...guideOf(), unit: "yd" }, { ...guideOf(), columns: ["Size", "x".repeat(31)] }, { ...guideOf(), rows: [["S", "x".repeat(21)]] }, { ...guideOf(), extra: 1 },
    { ...guideOf(), columns: Array.from({ length: 13 }, (_, i) => `C${i}`), rows: [Array.from({ length: 13 }, () => "1")] },
    { ...guideOf(), rows: Array.from({ length: 61 }, (_, i) => [`S${i}`, "1"]) }, [1, 2], "text"
  ];
  for (const g of bad) await rejects(c, asA, `select seller_set_item_size_guide($1, $2::jsonb)`, [id, JSON.stringify(g)], /invalid_size_guide/);
  await rejects(c, asService, `update items set size_guide = '{"columns":["A"],"rows":[["1","2"]]}'::jsonb where id = $1`, [id], /items_size_guide_shape|violates check/);
  assert.equal((await setGuide(asA, id, { columns: ["Size", "UK"], rows: [["S", "1"]] }))[0].ok, true, "the unit may be left out");
  const max = { unit: "in", columns: Array.from({ length: 12 }, (_, i) => `C${i}`), rows: Array.from({ length: 60 }, (_, r) => Array.from({ length: 12 }, () => "x".repeat(20))) };
  assert.equal((await setGuide(asA, id, max))[0].ok, true, "exactly at the limits is fine");
});

test("size guide: buyers get the seller's table first, the admin chart as before when there is none, and a removed guide gives the chart back", async () => {
  const id = await guideItem();
  const chart = await save(asAdmin, null, chartFields({ name: "T-Admin", columns: ["Size", "Bust"], rows: [["S", "84"]] }));
  await sql(c, `update items set size_chart_id = $2 where id = $1`, [id, chart]);
  assert.equal((await publicChart(id)).id, chart);
  await setGuide(asA, id, guideOf());
  assert.deepEqual(await publicChart(id), { id: null, name: "Size guide", category: null, unit: "cm", columns: ["Size", "UK"], rows: [["EU 40", "6.5"], ["EU 41", "7.5"]], overridden: false, own: true });
  await setGuide(asA, id, null);
  assert.equal((await publicChart(id)).id, chart);
  await sql(c, `update items set size_chart_id = null where id = $1`, [id]);
  assert.equal(await publicChart(id), null, "no guide and no chart: nothing");
  await clean();
});

test("size guide: the buyer reads the same thing the shared helper builds for the editor's preview", async () => {
  const { guideFromServer, guideForBuyer } = await import("../../shared/src/options/sizeGuide.js");
  const id = await guideItem();
  await setGuide(asA, id, { unit: "cm", columns: ["Size", "Width"], rows: [["S", "30"], ["M", "–"]] });
  const fromDb = await publicChart(id);
  assert.deepEqual(fromDb, guideForBuyer(guideFromServer(await readGuide(asA, id))));
});

test("size guide: a guide with no unit (bottle volumes, loaf weights) reaches buyers with no unit; inches stay inches", async () => {
  const id = await guideItem();
  await setGuide(asA, id, { columns: ["Size", "Volume (ml)"], rows: [["750ml", "750"]] });
  assert.equal((await publicChart(id)).unit, null);
  await setGuide(asA, id, { unit: null, columns: ["Size", "Volume (ml)"], rows: [["750ml", "750"]] });
  assert.equal((await publicChart(id)).unit, null);
  await setGuide(asA, id, { unit: "in", columns: ["Size", "Width"], rows: [["S", "12"]] });
  assert.equal((await publicChart(id)).unit, "in");
  await clean();
});
