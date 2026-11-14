// Conformance run (Prompt 11.4): `npm run test:conformance`. Reads the live categories, the product types and the seed that says
// which categories may sell which type, prints one row per category and exits 1 when anything fails.
// `--json` prints the result as JSON (the admin readiness page stores this output as data, Prompt 11.6).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { categories } from "../client/src/data/categories.js";
import { PRODUCT_TYPES } from "../shared/src/contracts/productTypes.js";
import { runConformance, formatTable, scanForCategoryNames } from "../shared/src/conformance/index.js";
import { typeCategoriesFromSql } from "../shared/src/conformance/seedMap.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function readTypeCategories() {
  const dir = join(root, "supabase", "migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  return typeCategoriesFromSql(sql);
}

const SOURCE = /\.(js|jsx|mjs|ts|tsx)$/;
export function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (SOURCE.test(name)) out.push({ path: relative(root, p).split("\\").join("/"), text: readFileSync(p, "utf8") });
    }
  };
  for (const r of ["client/src", "seller/src", "admin/src", "ui/src", "shared/src", "backend/src", "supabase/functions"]) if (existsSync(join(root, r))) walk(join(root, r));
  return out;
}

export function run() {
  const result = runConformance({ categories, types: PRODUCT_TYPES, typeCategories: readTypeCategories() });
  const names = categories.map((c) => c.id);
  const hardCoded = scanForCategoryNames(sourceFiles(), names);
  return { ...result, hardCoded, ok: result.ok && hardCoded.length === 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = run();
  if (process.argv.includes("--json")) console.log(JSON.stringify({ ok: result.ok, rows: result.rows, types: result.types.map(({ id, ok }) => ({ id, ok })), hardCoded: result.hardCoded }, null, 2));
  else {
    console.log(formatTable(result));
    for (const h of result.hardCoded) console.log(`  hard-coded category name in ${h.path}: ${h.names.join(", ")}`);
  }
  process.exit(result.ok ? 0 : 1);
}
