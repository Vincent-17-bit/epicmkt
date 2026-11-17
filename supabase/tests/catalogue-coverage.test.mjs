// Migration 0132: the coverage types, draft categories, approved open values and size charts land, and running it again changes nothing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, connect, sql } from "./db.mjs";
import { COVERAGE_FOOD, COVERAGE_HEALTH, COVERAGE_HOME } from "../../scripts/seeds/index.mjs";
import { COVERAGE_OPEN_VALUES } from "../../scripts/seeds/openValues.mjs";
import { COVERAGE_SIZE_CHARTS } from "../../scripts/seeds/sizeCharts.mjs";
import { categories } from "../../client/src/data/categories.js";
import { validateProductType } from "../../shared/src/index.js";

let c;
const types = [...COVERAGE_FOOD, ...COVERAGE_HEALTH, ...COVERAGE_HOME];
const drafts = categories.filter((x) => x.draft);
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
    assert.deepEqual(r.category_ids, t.categoryIds, t.id);
    assert.deepEqual(r.axes, JSON.parse(JSON.stringify(t.axes)), t.id);
    assert.deepEqual(r.spec_rows, JSON.parse(JSON.stringify(t.specRows)), t.id);
    assert.deepEqual(validateProductType({ ...t, axes: r.axes, specRows: r.spec_rows, extras: r.extras }).errors, [], t.id);
  }
  const noDept = await sql(c, `select count(*)::int as n from product_types t where id = any($1) and not exists (select 1 from departments d where d.id = t.department_id)`, [types.map((t) => t.id)]);
  assert.equal(noDept[0].n, 0);
});

test("draft categories are inactive and both plans are priced 0", async () => {
  const cats = await sql(c, `select id, active from categories where id = any($1)`, [drafts.map((x) => x.id)]);
  assert.equal(cats.length, drafts.length);
  assert.ok(cats.every((x) => x.active === false));
  const plans = await sql(c, `select category_id, plan_key, price_kes, items_limit from plans where category_id = any($1)`, [drafts.map((x) => x.id)]);
  assert.equal(plans.length, drafts.length * 2);
  assert.ok(plans.every((p) => p.price_kes === 0 && p.items_limit === null));
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

test("running the migration again changes nothing and keeps an admin's edits", async () => {
  await sql(c, `update categories set active = true where id = 'bookshop'`);
  await sql(c, `update plans set price_kes = 700 where category_id = 'bookshop' and plan_key = 'standard'`);
  await sql(c, `update product_types set name = 'Edited name' where id = 'eggs'`);
  const count = async () => (await sql(c, `select (select count(*) from product_types)::int a, (select count(*) from option_values)::int b, (select count(*) from size_charts)::int d, (select count(*) from categories)::int e, (select count(*) from plans)::int f`))[0];
  const before = await count();
  await c.query(readFileSync(new URL("../migrations/0132_catalogue_coverage.sql", import.meta.url), "utf8"));
  await c.query(extras);
  assert.deepEqual(await count(), before);
  assert.equal((await sql(c, `select active from categories where id = 'bookshop'`))[0].active, true);
  assert.equal((await sql(c, `select price_kes from plans where category_id = 'bookshop' and plan_key = 'standard'`))[0].price_kes, 700);
  assert.equal((await sql(c, `select name from product_types where id = 'eggs'`))[0].name, "Edited name");
});
