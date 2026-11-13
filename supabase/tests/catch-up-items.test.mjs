// The catch-up script must take a database stopped at any point after 0037 to the same schema as a fully migrated one,
// and do nothing on a database that is already current.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createDatabase, connect, sql } from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "migrations");
const script = readFileSync(join(here, "..", "catch-up-items.sql"), "utf8");
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

async function schema(c) {
  const fns = await sql(c, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`);
  const cols = await sql(c, `select table_name || '.' || column_name as k, data_type as h from information_schema.columns where table_schema = 'public' order by 1`);
  return { fns: Object.fromEntries(fns.map((r) => [r.k, r.h])), cols: Object.fromEntries(cols.map((r) => [r.k, r.h])) };
}
async function partial(upTo) {
  const url = await createDatabase({ database: "partial_db" });   // fully migrated first, then rebuilt below
  const root = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, "/postgres") }); await root.connect();
  await root.query(`drop database if exists partial_db with (force)`); await root.query(`create database partial_db`); await root.end();
  const owner = new pg.Client({ connectionString: url }); await owner.connect();
  await owner.query(`alter database partial_db set search_path = "$user", public, extensions`);
  await owner.query(readFileSync(join(here, "bootstrap.sql"), "utf8"));
  for (const f of all) if (f <= upTo) await owner.query(readFileSync(join(dir, f), "utf8"));
  return owner;
}

const full = await (async () => { const c = await connect(await createDatabase({ database: "full_db" })); const s = await schema(c); await c.end(); return s; })();

for (const upTo of ["0037", "0049", "0057", "0085", "0094", "0099"]) {
  test(`a database stopped after migration ${upTo} is brought to the latest schema`, async () => {
    const c = await partial(upTo + "~");
    try {
      const rows = (await c.query(script)).at(-1).rows;
      assert.ok(rows.some((r) => r.result === "applied"), JSON.stringify(rows.slice(0, 3)));
      const skipped = rows.filter((r) => /^SKIPPED/.test(r.result));
      assert.deepEqual(skipped, []);
      const got = await schema(c);
      const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
      assert.deepEqual(diff(full.fns, got.fns), [], "functions differ");
      assert.deepEqual(diff(got.fns, full.fns), [], "extra functions");
      assert.deepEqual(diff(full.cols, got.cols), [], "columns differ");
      const again = (await c.query(script)).at(-1).rows;
      assert.match(again[0].result, /Nothing to do/);
    } finally { await c.end(); }
  });
}
test("a fully migrated database: the script does nothing", async () => {
  const c = await partial("9999");
  try { assert.match((await c.query(script)).at(-1).rows[0].result, /Nothing to do/); } finally { await c.end(); }
});

test("the real state of a hand-patched database (0085 + the size-chart catch-up + the size-guide catch-up) ends up identical", async () => {
  const c = await partial("0085~");
  try {
    await c.query(readFileSync(join(here, "..", "catch-up-size-charts.sql"), "utf8"));
    await c.query(readFileSync(join(here, "..", "catch-up-seller-size-guide.sql"), "utf8"));
    const rows = (await c.query(script)).at(-1).rows;
    assert.deepEqual(rows.filter((r) => /^SKIPPED/.test(r.result)).map((r) => r.migration + ": " + r.result.slice(0, 120)), []);
    const got = await schema(c);
    const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
    assert.deepEqual(diff(full.fns, got.fns), []);
    assert.deepEqual(diff(full.cols, got.cols), []);
  } finally { await c.end(); }
});

test("saving an item works after the catch-up on a hand-patched database", async () => {
  const { seedFixtures, tx, ids, asA } = await import("./db.mjs");
  const c = await partial("0085~");
  try {
    await c.query(readFileSync(join(here, "..", "catch-up-size-charts.sql"), "utf8"));
    await c.query(readFileSync(join(here, "..", "catch-up-seller-size-guide.sql"), "utf8"));
    await c.query(script);
    await seedFixtures(c);
    await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
    await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
    const f = { name: "Whole Wheat Loaf", description: "x", section: "Bread", price_type: "fixed", price: 120, availability: "available", track_stock: false, low_stock_threshold: 3, show_stock_count: false,
      brand: "B", short_description: "s", pack_size: "1", terms: "t", includes: ["bag"], highlights: [{ text: "h" }], specs: [{ group: "Features & Specs", label: "Weight", value: "400 g" }] };
    const id = (await tx(c, asA, (k) => sql(k, `select seller_save_item(null, $1::jsonb) as id`, [JSON.stringify(f)]), { commit: true }))[0].id;
    await tx(c, asA, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify({ ...f, name: "Renamed", price: 150 })]), { commit: true });
    const [row] = await sql(c, `select name, price from items where id = $1`, [id]);
    assert.equal(row.name, "Renamed"); assert.equal(Number(row.price), 150);
  } finally { await c.end(); }
});

test("the user's real state: 0084 + the size-chart catch-up (0086 view already in its 0093 shape) is repaired with no SKIPPED rows", async () => {
  const c = await partial("0084~");
  try {
    await c.query(readFileSync(join(here, "..", "catch-up-size-charts.sql"), "utf8"));
    await c.query(readFileSync(join(here, "..", "catch-up-seller-size-guide.sql"), "utf8"));
    const rows = (await c.query(script)).at(-1).rows;
    assert.deepEqual(rows.filter((r) => /^SKIPPED/.test(r.result)).map((r) => r.migration + ": " + r.result.slice(0, 100)), []);
    const got = await schema(c);
    const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
    assert.deepEqual(diff(full.fns, got.fns), [], "functions differ");
    assert.deepEqual(diff(full.cols, got.cols), []);
  } finally { await c.end(); }
});

test("the first published version of the script (0086 reported SKIPPED, already applied by the size-chart catch-up) left a database identical to a full migration", async () => {
  const { readFileSync: rf } = await import("node:fs");
  const c = await partial("0084~");
  try {
    await c.query(rf(join(here, "..", "catch-up-size-charts.sql"), "utf8"));
    await c.query(rf(join(here, "..", "catch-up-seller-size-guide.sql"), "utf8"));
    await c.query(script.replace("drop view if exists public.public_size_charts;\n", ""));   // approximates the first version: 0086 without the view drop
    const got = await schema(c);
    const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
    assert.deepEqual(diff(full.fns, got.fns), []);
    assert.deepEqual(diff(full.cols, got.cols), []);
  } finally { await c.end(); }
});
