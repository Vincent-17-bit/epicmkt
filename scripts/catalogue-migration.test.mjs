// The generated migration must match the seed data, and the seed data must be sound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMigration, MIGRATION_FILE } from "./gen-catalogue-migration.mjs";
import { ALL_TYPES, COVERAGE_FOOD, COVERAGE_HEALTH, COVERAGE_HOME } from "./seeds/index.mjs";
import { COVERAGE_OPEN_VALUES } from "./seeds/openValues.mjs";
import { COVERAGE_SIZE_CHARTS } from "./seeds/sizeCharts.mjs";
import { validateOpenValue, cleanSizeChart, validateProductType } from "../shared/src/index.js";
import { parse } from "../shared/src/scales/index.js";

const coverage = [...COVERAGE_FOOD, ...COVERAGE_HEALTH, ...COVERAGE_HOME];

test("0132_catalogue_coverage.sql is exactly what the generator writes (run: node scripts/gen-catalogue-migration.mjs)", () => {
  assert.equal(readFileSync(MIGRATION_FILE, "utf8"), buildMigration());
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
