import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categories } from "../client/src/data/categories.js";
import { CATEGORIES_FILE, categoriesSql } from "./gen-categories-from-code.mjs";

test("supabase/data/categories_from_code.sql is exactly what the generator writes (run node scripts/gen-categories-from-code.mjs)", () => {
  assert.equal(readFileSync(CATEGORIES_FILE, "utf8"), categoriesSql());
});

test("it adds every category in the code, both plans each, and never overwrites", () => {
  const sql = categoriesSql();
  for (const c of categories) assert.ok(sql.includes(`('${c.id}', `), c.id);
  assert.equal((sql.match(/on conflict \(id\) do nothing;/g) ?? []).length, 1);
  assert.equal((sql.match(/on conflict \(category_id, plan_key\) do nothing;/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /do update|^update /im);
});
