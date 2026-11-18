// Migration 0132: the coverage types, draft categories, approved open values and size charts land, and running it again changes nothing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, connect, sql } from "./db.mjs";
import { COVERAGE_FOOD, COVERAGE_HEALTH, COVERAGE_HOME, COVERAGE_MORE } from "../../scripts/seeds/index.mjs";
import { COVERAGE_OPEN_VALUES } from "../../scripts/seeds/openValues.mjs";
import { COVERAGE_SIZE_CHARTS } from "../../scripts/seeds/sizeCharts.mjs";
import { categories } from "../../client/src/data/categories.js";
import { TIER_PLANS } from "../../client/src/config/plans.seed.js";
import { NEW_CATEGORY_IDS } from "../../scripts/seeds/newCategories.mjs";
import { EXTRA_CATEGORY_LINKS } from "../../scripts/seeds/categoryLinks.mjs";
import { validateProductType } from "../../shared/src/index.js";

let c;
const types = [...COVERAGE_FOOD, ...COVERAGE_HEALTH, ...COVERAGE_HOME, ...COVERAGE_MORE];
const fresh = NEW_CATEGORY_IDS.map((id) => categories.find((x) => x.id === id));
const extras = readFileSync(new URL("../data/catalogue_coverage_extras.sql", import.meta.url), "utf8");
// The migration adds the types; the extras file (run by hand, after it) adds the draft categories, values and charts.
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_catalogue_coverage" }));
  await c.query(extras);
});
after(async () => { await c.end(); });

test("every coverage type is stored as the seed defines it", async () => {
  const rows = await sql(c, `select id, kind, department_id, category_ids, axes, spec_rows, extras from product_types where id = any($1)`, [types.map((t) => t.id)]);
  assert.equal(rows.length, types.length);
  for (const t of types) {
    const r = rows.find((x) => x.id === t.id);
    assert.equal(r.kind, t.kind, t.id);
    assert.equal(r.department_id, t.departmentId, t.id);
    // The seed's own categories, plus any new category the extras file also offers this type to (appended, never replacing).
    const expectedCats = [...new Set([...t.categoryIds, ...(EXTRA_CATEGORY_LINKS[t.id] ?? [])])];
    assert.deepEqual([...r.category_ids].sort(), expectedCats.sort(), t.id);
    assert.deepEqual(r.axes, JSON.parse(JSON.stringify(t.axes)), t.id);
    assert.deepEqual(r.spec_rows, JSON.parse(JSON.stringify(t.specRows)), t.id);
    assert.deepEqual(validateProductType({ ...t, axes: r.axes, specRows: r.spec_rows, extras: r.extras }).errors, [], t.id);
  }
  const noDept = await sql(c, `select count(*)::int as n from product_types t where id = any($1) and not exists (select 1 from departments d where d.id = t.department_id)`, [types.map((t) => t.id)]);
  assert.equal(noDept[0].n, 0);
});

test("the new categories are open, both plans priced by their tier, and the database's own template and document checks accept them", async () => {
  const cats = await sql(c, `select id, tier, active, template, extra_docs from categories where id = any($1)`, [fresh.map((x) => x.id)]);
  assert.equal(cats.length, fresh.length);
  assert.ok(cats.every((x) => x.active === true));
  const plans = await sql(c, `select category_id, plan_key, price_kes, items_limit from plans where category_id = any($1)`, [fresh.map((x) => x.id)]);
  assert.equal(plans.length, fresh.length * 2);
  for (const cat of fresh) for (const key of ["standard", "premium"]) {
    const p = plans.find((x) => x.category_id === cat.id && x.plan_key === key);
    assert.equal(p.price_kes, TIER_PLANS[cat.tier][key].price, `${cat.id} ${key}`);
    assert.ok(p.price_kes > 0 && p.items_limit === null);
  }
  for (const x of cats) {
    await sql(c, `select public.validate_category_template($1::jsonb), public.validate_category_docs($2::jsonb)`, [JSON.stringify(x.template), JSON.stringify(x.extra_docs)]);
  }
  // The admin list the Categories page reads shows each one as priced (2 of 2), so the page lets an admin switch it off and on.
  const priced = await sql(c, `select count(*)::int n from (select c.id from categories c where c.id = any($1) and (select count(*) from plans p where p.category_id = c.id and p.price_kes > 0) = 2) z`, [fresh.map((x) => x.id)]);
  assert.equal(priced[0].n, fresh.length);
});

test("existing types are also offered to the new categories, and no old category is removed", async () => {
  for (const [id, cats] of Object.entries(EXTRA_CATEGORY_LINKS)) {
    const r = await sql(c, `select category_ids from product_types where id = $1`, [id]);
    if (!r.length) continue; // a type that only the first seed creates is absent from a bare migrated database
    for (const cat of cats) assert.ok(r[0].category_ids.includes(cat), `${id} -> ${cat}`);
    assert.equal(new Set(r[0].category_ids).size, r[0].category_ids.length, `${id} has a repeated category`);
  }
  assert.ok((await sql(c, `select category_ids from product_types where id = 'liquor'`))[0]?.category_ids.includes("supermarket-minimart") ?? true);
});

test("every open value is approved, with a shade only on colours", async () => {
  const rows = await sql(c, `select kind, label, status, hex, key from option_values where status = 'approved'`);
  for (const v of COVERAGE_OPEN_VALUES) {
    const r = rows.find((x) => x.kind === v.kind && x.label === v.label);
    assert.ok(r, `${v.kind} ${v.label}`);
    assert.equal(r.hex, v.hex ?? null, v.label);
  }
  assert.ok(rows.length >= COVERAGE_OPEN_VALUES.length);
});

test("size charts are added and the types with no chart point at theirs", async () => {
  for (const ch of COVERAGE_SIZE_CHARTS) {
    const r = await sql(c, `select unit, columns, rows from size_charts where name = $1 and category is null`, [ch.name]);
    assert.equal(r.length, 1, ch.name);
    assert.deepEqual(r[0].rows, ch.rows, ch.name);
  }
  const linked = await sql(c, `select t.id, s.name from product_types t join size_charts s on s.id = t.size_chart_id where t.id = any($1)`, [["baby-clothing", "school-uniform", "suit-formalwear", "motorbike-parts-gear", "underwear-socks"]]);
  assert.equal(linked.length, 5);
});

test("a copy of the file run earlier (closed, priced 0) is opened and priced; one an admin already changed is left alone", async () => {
  await sql(c, `update categories set active = false where id in ('pet-shop-vet', 'solar-energy')`);
  await sql(c, `update plans set price_kes = 0 where category_id = 'pet-shop-vet'`);
  await sql(c, `update plans set price_kes = 0 where category_id = 'solar-energy'`);
  await sql(c, `update plans set price_kes = 777 where category_id = 'solar-energy' and plan_key = 'standard'`);
  await c.query(extras);
  const pet = (await sql(c, `select c.active, c.tier, (select array_agg(price_kes order by plan_key) from plans p where p.category_id = c.id) as prices from categories c where id = 'pet-shop-vet'`))[0];
  assert.equal(pet.active, true);
  assert.deepEqual(pet.prices, [TIER_PLANS.B.premium.price, TIER_PLANS.B.standard.price]);
  const solar = (await sql(c, `select c.active, (select array_agg(price_kes order by plan_key) from plans p where p.category_id = c.id) as prices from categories c where id = 'solar-energy'`))[0];
  assert.equal(solar.active, false);
  assert.deepEqual(solar.prices, [0, 777]);
});

test("running the migration again changes nothing and keeps an admin's edits", async () => {
  await sql(c, `update categories set active = true where id = 'bookshop'`);
  await sql(c, `update plans set price_kes = 700 where category_id = 'bookshop' and plan_key = 'standard'`);
  await sql(c, `update product_types set name = 'Edited name' where id = 'eggs'`);
  const count = async () => (await sql(c, `select (select count(*) from product_types)::int a, (select count(*) from option_values)::int b, (select count(*) from size_charts)::int d, (select count(*) from categories)::int e, (select count(*) from plans)::int f`))[0];
  const before = await count();
  for (const f of ["0132_catalogue_coverage.sql", "0133_catalogue_coverage_more.sql"]) await c.query(readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8"));
  await c.query(extras);
  assert.deepEqual(await count(), before);
  assert.equal((await sql(c, `select active from categories where id = 'bookshop'`))[0].active, true);
  assert.equal((await sql(c, `select price_kes from plans where category_id = 'bookshop' and plan_key = 'standard'`))[0].price_kes, 700);
  assert.equal((await sql(c, `select name from product_types where id = 'eggs'`))[0].name, "Edited name");
});
