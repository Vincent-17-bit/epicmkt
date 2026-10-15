// Admin demo data: businesses in every status, items with problems, payments (one duplicate code),
// change requests, reports, applications in every status, and a message log with failures.
//
//   npm run seed:admin                    load it (stops if demo data is already there)
//   npm run seed:admin -- --reset         delete the demo data, then load it again
//   npm run seed:admin -- --dry-run       build it and print the numbers, touch nothing
//   npm run seed:admin -- --seed 7        another (still reproducible) dataset
//
// Needs SEED_DATABASE_URL (a direct Postgres connection string) in scripts/.env, and the catalogue loaded first
// with `npm run seed`. Runs in one transaction: it either all lands or none of it does.
// Node 22.18+ runs this file as it is. It refuses to run when APP_ENV=production.
import pg from "pg";
import { categories as repoCategories } from "../client/src/data/categories.js";
import { planRows } from "../client/src/config/plans.seed.js";
import { buildSeed } from "./lib/seed-data.ts";
import { demoExists, loadSeed, readCatalog, resetDemo } from "./lib/seed-load.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const fail = (message: string): never => { console.error(`seed: ${message}`); process.exit(1); };

if (flag("help")) {
  console.log("usage: npm run seed:admin -- [--reset] [--dry-run] [--seed N]");
  process.exit(0);
}
if (process.env.APP_ENV === "production") fail("refusing to run with APP_ENV=production");

const seedArg = value("seed");
const seed = seedArg === undefined ? undefined : Number(seedArg);
if (seed !== undefined && !Number.isInteger(seed)) fail("--seed must be a whole number");

const print = (stats: Record<string, unknown>) => console.log(JSON.stringify(stats, null, 2));

if (flag("dry-run")) {
  const plans = repoCategories.flatMap((c: { id: string; tier: string }) => planRows(c.id, c.tier));
  const data = buildSeed({
    seed,
    categories: repoCategories.map((c: { id: string; name: string; group: string; tier: string }) => ({ id: c.id, name: c.name, grp: c.group, tier: c.tier })),
    plans,
  });
  print(data.stats);
  console.log("dry run: nothing was written");
  process.exit(0);
}

const url = process.env.SEED_DATABASE_URL;
if (!url) fail("set SEED_DATABASE_URL in scripts/.env (Supabase: Project settings > Database > Connection string)");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  if (await demoExists(client)) {
    if (!flag("reset")) fail("demo data is already loaded. Run again with --reset to replace it.");
    await resetDemo(client);
    console.log("removed the previous demo data");
  }
  const { categories, plans } = await readCatalog(client);
  const data = buildSeed({ seed, categories, plans });
  const inserted = await loadSeed(client, data);
  await client.query("commit");
  print(data.stats);
  console.log("rows written:", inserted);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`seed failed, nothing was written: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
