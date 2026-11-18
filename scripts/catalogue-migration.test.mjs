// The generated migration must match the seed data, and the seed data must be sound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMigration, buildMore, buildExtras, MIGRATION_FILE, MORE_FILE, EXTRAS_FILE } from "./gen-catalogue-migration.mjs";
import { ALL_TYPES, COVERAGE_FOOD, COVERAGE_HEALTH, COVERAGE_HOME, COVERAGE_MORE } from "./seeds/index.mjs";
import { COVERAGE_OPEN_VALUES } from "./seeds/openValues.mjs";
import { COVERAGE_SIZE_CHARTS } from "./seeds/sizeCharts.mjs";
import { validateOpenValue, cleanSizeChart, validateProductType } from "../shared/src/index.js";
import { parse } from "../shared/src/scales/index.js";

const coverage = [...COVERAGE_FOOD, ...COVERAGE_HEALTH, ...COVERAGE_HOME, ...COVERAGE_MORE];

test("0132_catalogue_coverage.sql is exactly what the generator writes (run: node scripts/gen-catalogue-migration.mjs)", () => {
  assert.equal(readFileSync(MIGRATION_FILE, "utf8"), buildMigration());
});

test("0133_catalogue_coverage_more.sql is exactly what the generator writes", () => {
  assert.equal(readFileSync(MORE_FILE, "utf8"), buildMore());
});

test("supabase/data/catalogue_coverage_extras.sql is exactly what the generator writes", () => {
  assert.equal(readFileSync(EXTRAS_FILE, "utf8"), buildExtras());
});

test("the migration holds only types and departments: no category, value or chart (the database tests start without them)", () => {
  for (const file of [MIGRATION_FILE, MORE_FILE]) {
    const sql = readFileSync(file, "utf8");
    for (const table of ["categories", "plans", "option_values", "size_charts"]) assert.ok(!new RegExp(`(insert into|update) public\\.${table}\\b`).test(sql), `${file} ${table}`);
  }
});

test("coverage types are valid, unique and do not replace an existing type", () => {
  const ids = coverage.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id inside the coverage lists");
  assert.equal(ALL_TYPES.length, new Set(ALL_TYPES.map((t) => t.id)).size, "a coverage type has the id of an existing type");
  for (const t of coverage) assert.deepEqual(validateProductType(t).errors, [], t.id);
});

test("every suggested value on a scaled axis parses under its scale", () => {
  for (const t of coverage) for (const a of t.axes) if (a.scale) for (const v of a.suggested ?? []) assert.ok(parse(a.scale, v.label).ok, `${t.id}.${a.key}: ${v.label}`);
});

test("coverage types add no selling restriction", () => {
  assert.deepEqual(coverage.filter((t) => (t.restrictedTo ?? []).length), []);
});

test("every open value passes validateOpenValue and none repeats", () => {
  const seen = new Set();
  for (const v of COVERAGE_OPEN_VALUES) {
    const r = validateOpenValue(v);
    assert.ok(r.ok, `${v.kind} ${v.label}`);
    const k = `${v.kind}|${r.value.key}`;
    assert.ok(!seen.has(k), `repeated ${k}`);
    seen.add(k);
  }
});

test("every size chart is valid, each type gets one chart and linked types exist", () => {
  const ids = new Set(ALL_TYPES.map((t) => t.id));
  const linked = new Map();
  const names = new Set();
  for (const c of COVERAGE_SIZE_CHARTS) {
    assert.ok(cleanSizeChart(c).ok, c.name);
    assert.ok(!names.has(c.name.toLowerCase()), `repeated chart ${c.name}`);
    names.add(c.name.toLowerCase());
    for (const id of c.productTypeIds) {
      assert.ok(ids.has(id), `${c.name} links unknown type ${id}`);
      assert.ok(!linked.has(id), `${id} is linked to two charts`);
      linked.set(id, c.name);
    }
  }
});

test("the 17 new categories exist, are open (no draft flag), sit in a known group and are priced", async () => {
  const { categories } = await import("../client/src/data/categories.js");
  const { NEW_CATEGORY_IDS } = await import("./seeds/newCategories.mjs");
  const { planRows, TIER_PLANS } = await import("../client/src/config/plans.seed.js");
  assert.equal(NEW_CATEGORY_IDS.length, 17);
  const groups = new Set(categories.filter((c) => !NEW_CATEGORY_IDS.includes(c.id)).map((c) => c.group));
  for (const id of NEW_CATEGORY_IDS) {
    const c = categories.find((x) => x.id === id);
    assert.ok(c, id);
    assert.ok(!("draft" in c), `${id} still has a draft flag`);
    assert.ok(groups.has(c.group), `${id}: group ${c.group} is not one the site already shows`);
    assert.ok(TIER_PLANS[c.tier], `${id}: tier`);
    for (const r of planRows(c.id, c.tier)) assert.ok(r.price_kes > 0, `${id} ${r.plan_key} is not priced`);
  }
});

test("every type placed in a category points at a category that exists", async () => {
  const { categories } = await import("../client/src/data/categories.js");
  const known = new Set(categories.map((c) => c.id));
  for (const t of ALL_TYPES) for (const id of t.categoryIds) assert.ok(known.has(id), `${t.id} -> ${id}`);
});
