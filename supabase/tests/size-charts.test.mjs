import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, asA, asAdmin } from "./db.mjs";
import { SEED_SIZE_CHARTS, cleanShoeConversion, shoeChartFrom, shoeChartRows, convertShoe } from "../../shared/src/sizeCharts.js";
import { SHOE_CHART } from "../../shared/src/scales/shoeChart.js";

let c;
const anon = { role: "anon" };
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_size_charts" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const chartFields = (o = {}) => ({ name: "T-Chart", unit: "cm", columns: ["Size", "Bust"], rows: [["S", "84"], ["M", "90"]], ...o });
const save = (who, id, f) => as(who, `select admin_save_size_chart($1, $2::jsonb) as id`, [id, JSON.stringify(f)]).then((r) => r[0].id);
const clean = () => sql(c, `delete from size_charts where name like 'T-%'`);
const shoeRow = (eu, uk, usM, usW, cm) => ({ eu, uk, usM, usW, cm });
const adultRows = () => shoeChartRows().adult;

test("seeds: five charts and the default shoe conversion chart, equal to the shared data", async () => {
  const rows = await sql(c, `select name, category, unit, columns, rows, product_type_ids from size_charts where name not like 'T-%' order by name`);
  assert.equal(rows.length, SEED_SIZE_CHARTS.length);
  for (const seed of SEED_SIZE_CHARTS) {
    const got = rows.find((r) => r.name === seed.name);
    assert.ok(got, seed.name);
    assert.deepEqual([got.category, got.unit, got.columns, got.rows, got.product_type_ids], [seed.category, seed.unit, seed.columns, seed.rows, seed.productTypeIds], seed.name);
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

test("public read: anyone can read the active charts (with their types), the shoe chart, and charts by type; the tables stay closed", async () => {
  for (const who of [anon, asA, asAdmin]) {
    assert.equal((await as(who, `select count(*)::int as n from public_size_charts`))[0].n, SEED_SIZE_CHARTS.length);
    assert.equal((await as(who, `select version from public_shoe_conversion`))[0].version, 1);
  }
  const dress = (await as(anon, `select size_charts_for_type('dress') as r`))[0].r;
  assert.deepEqual(dress.map((x) => x.name), ["Dresses and tops (cm)"]);
  assert.deepEqual(dress[0].product_type_ids, ["dress"]);
  assert.deepEqual((await as(anon, `select size_charts_for_type('shoes-eu') as r`))[0].r.map((x) => x.name), ["Men's shoes", "Women's shoes"]);
  assert.deepEqual((await as(anon, `select size_charts_for_type('nothing') as r`))[0].r, []);
  assert.deepEqual((await as(anon, `select size_charts_for_type(null, null) as r`))[0].r, []);
  await rejects(c, anon, `select count(*) from size_charts`, [], /permission denied/);
  await rejects(c, anon, `select count(*) from shoe_conversion`, [], /permission denied/);
  await rejects(c, asA, `select count(*) from size_charts`, [], /permission denied|row-level/).catch(async () => assert.equal((await as(asA, `select count(*)::int as n from size_charts`))[0].n, 0));
  assert.equal((await as(asA, `select count(*)::int as n from shoe_conversion`))[0].n, 0);
});
test("public read by type: falls back to the category's charts that name no type; inactive charts and typed charts are not used for the fallback", async () => {
  await clean();
  await save(asAdmin, null, chartFields({ name: "T-Barber general", category: "barber" }));
  await save(asAdmin, null, chartFields({ name: "T-Barber typed", category: "barber", product_type_ids: ["hat"] }));
  await save(asAdmin, null, chartFields({ name: "T-Barber hidden", category: "barber", active: false }));
  await save(asAdmin, null, chartFields({ name: "T-Hat chart", product_type_ids: ["hat"] }));
  const names = async (t, cat) => (await as(anon, `select size_charts_for_type($1, $2) as r`, [t, cat]))[0].r.map((x) => x.name);
  assert.deepEqual(await names("hat", "barber"), ["T-Barber typed", "T-Hat chart"]);
  assert.deepEqual(await names("scarf", "barber"), ["T-Barber general"]);
  assert.deepEqual(await names("scarf", null), []);
  assert.deepEqual(await names("scarf", "other"), []);
  await clean();
});

test("admin writes size charts with product types; sellers and anon cannot", async () => {
  await clean();
  const id = await save(asAdmin, null, chartFields({ product_type_ids: ["dress", "top"] }));
  const got = (await sql(c, `select product_type_ids from size_charts where id = $1`, [id]))[0];
  assert.deepEqual(got.product_type_ids, ["dress", "top"]);
  assert.equal((await sql(c, `select 1 from audit_log where action = 'size_chart.create' and target_id = $1`, [id])).length, 1);
  assert.deepEqual((await as(asAdmin, `select admin_size_charts_list() as r`))[0].r.find((x) => x.id === id).product_type_ids, ["dress", "top"]);
  const sellerView = (await as(anon, `select product_type_ids from public_size_charts where id = $1`, [id]))[0];
  assert.deepEqual(sellerView.product_type_ids, ["dress", "top"]);
  await rejects(c, asA, `select admin_save_size_chart(null, '${JSON.stringify(chartFields({ name: "T-Nope" }))}')`, [], /forbidden/);
  await rejects(c, anon, `select admin_save_size_chart(null, '${JSON.stringify(chartFields({ name: "T-Nope" }))}')`, [], /permission denied/);
  await clean();
});
test("product_type_ids: an absent key keeps them on edit, an empty list or null clears them, bad lists are refused", async () => {
  await clean();
  const id = await save(asAdmin, null, chartFields({ product_type_ids: ["dress"] }));
  await save(asAdmin, id, chartFields({ name: "T-Renamed" }));
  assert.deepEqual((await sql(c, `select product_type_ids from size_charts where id = $1`, [id]))[0].product_type_ids, ["dress"]);
  await save(asAdmin, id, chartFields({ name: "T-Renamed", product_type_ids: ["a", "b"] }));
  assert.deepEqual((await sql(c, `select product_type_ids from size_charts where id = $1`, [id]))[0].product_type_ids, ["a", "b"]);
  await save(asAdmin, id, chartFields({ name: "T-Renamed", product_type_ids: [] }));
  assert.deepEqual((await sql(c, `select product_type_ids from size_charts where id = $1`, [id]))[0].product_type_ids, []);
  await save(asAdmin, id, chartFields({ name: "T-Renamed", product_type_ids: ["x"] }));
  await save(asAdmin, id, chartFields({ name: "T-Renamed", product_type_ids: null }));
  assert.deepEqual((await sql(c, `select product_type_ids from size_charts where id = $1`, [id]))[0].product_type_ids, []);
  const bad = (ids) => rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields({ name: "T-Bad", product_type_ids: ids }))], /invalid_type_ids/);
  await bad(["Dress"]); await bad(["a", "a"]); await bad(["has space"]); await bad("dress"); await bad([""]); await bad(["-x"]);
  await bad(Array.from({ length: 21 }, (_, i) => `t${i}`)); await bad(["x".repeat(41)]); await bad([5]);
  await save(asAdmin, null, chartFields({ name: "T-Twenty", product_type_ids: Array.from({ length: 20 }, (_, i) => `t${i}`) }));
  assert.equal((await sql(c, `select count(*)::int as n from size_charts where name = 'T-Bad'`))[0].n, 0);
  await clean();
});
test("what A04 already did still holds: same errors, deleting, and items keep their chart", async () => {
  await clean();
  const bad = (f, p) => rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields(f))], p);
  await bad({ name: "x" }, /invalid_name/); await bad({ unit: "yd" }, /invalid_unit/); await bad({ category: "nope" }, /invalid_category/);
  await bad({ columns: [] }, /invalid_chart/); await bad({ rows: [["S"]] }, /invalid_chart/);
  const id = await save(asAdmin, null, chartFields());
  await save(asAdmin, null, chartFields({ name: "T-Chart2" }));
  await rejects(c, asAdmin, `select admin_save_size_chart(null, $1::jsonb)`, [JSON.stringify(chartFields())], /duplicate_chart/);
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
