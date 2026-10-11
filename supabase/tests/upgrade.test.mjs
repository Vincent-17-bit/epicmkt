// Simulates upgrading a live project: a database at migration 0005 with real-looking data (including admin-edited
// prices and old rows that break the new rules), then migrations 0006 to 0008, the preflight and the targeted
// item-template SQL. Uses its own database so it can run beside seller.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ITEM_TEMPLATES } from "../../shared/src/seller/item-templates.js";
import { categories as dbCategories } from "../../client/src/data/categories.js";
import { buildSql } from "../../scripts/gen-item-templates-sql.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, "..", "migrations");
const base = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const dbName = "epicmkt_upgrade_test";
const at = (db) => { const u = new URL(base); u.pathname = `/${db}`; return u.toString(); };
const read = (f) => readFileSync(f, "utf8");
const migration = (n) => read(join(migrations, readdirSync(migrations).find((f) => f.startsWith(n))));
const preflightSql = read(join(here, "..", "preflight-catalog.sql"));
const seedSql = read(join(here, "..", "seed-item-templates.sql"));

let c;
const rows = async (text, params) => (await c.query(text, params)).rows;

const U = "00000000-0000-0000-0000-0000000000c1";
const B = "10000000-0000-0000-0000-0000000000c1";
const item = { clean: "20000000-0000-0000-0000-000000000001", longName: "20000000-0000-0000-0000-000000000002", cents: "20000000-0000-0000-0000-000000000003", range: "20000000-0000-0000-0000-000000000004", sale: "20000000-0000-0000-0000-000000000005", legacy: "20000000-0000-0000-0000-000000000006" };

before(async () => {
  const root = new pg.Client({ connectionString: base });
  await root.connect();
  await root.query(`drop database if exists ${dbName} with (force)`);
  await root.query(`create database ${dbName}`);
  await root.end();
  c = new pg.Client({ connectionString: at(dbName) });
  await c.connect();
  await c.query(`alter database ${dbName} set search_path = "$user", public, extensions`);
  await c.query(`set search_path = "$user", public, extensions`);
  await c.query(read(join(here, "bootstrap.sql")));
  // The state of a project that has applied everything up to the seller portal backend (0005).
  for (const f of readdirSync(migrations).filter((x) => x.endsWith(".sql")).sort()) {
    if (parseInt(f.slice(0, 4), 10) <= 5) await c.query(read(join(migrations, f)));
  }
  await c.query(`insert into auth.users (id, email) values ('${U}', 'seller@test')`);
  for (const [i, cat] of dbCategories.entries()) {
    await c.query(`insert into public.categories (id, name, grp, tier, sort) values ($1, $2, $3, 'B', $4)`, [cat.id, cat.name, cat.group, i]);
  }
  // Prices an admin has edited since seeding: the targeted SQL must not touch them.
  await c.query(`insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
    ('barbershop', 'standard', 650, 30, '["a","b","c"]'), ('barbershop', 'premium', 1777, 90, '["d","e","f"]')`);
  await c.query(`insert into public.businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone)
    values ('${B}', 'ES100099', '${U}', 'live-shop', 'Live Shop', 'barbershop', 'standard', 'live', '+254712345678')`);
  await c.query(`insert into public.seller_settings (business_id, settings) values ('${B}', '{"sections":["Cuts","Braids"],"theme":"dark"}')`);
  const add = (id, name, cols = {}) => {
    const keys = ["id", "business_id", "name", ...Object.keys(cols)];
    return c.query(`insert into public.items (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, [id, B, name, ...Object.values(cols)]);
  };
  await add(item.clean, "Fade", { price: 300, section: "Cuts" });
  await add(item.longName, "x".repeat(90), { price: 100 });
  await add(item.cents, "Beard trim", { price: 10.5 });
  await add(item.range, "Shave", { price: 100, price_max: 100, price_type: "range" });
  await add(item.sale, "Kids cut", { price: 100, sale_price: 100 });
  await add(item.legacy, "Old status", { price: 50, availability: "unavailable" });
});

after(async () => {
  await c?.end();
  const root = new pg.Client({ connectionString: base });
  await root.connect();
  await root.query(`drop database if exists ${dbName} with (force)`);
  await root.end();
});

const snapshot = async () => ({
  items: await rows(`select id, name, description, section, price, price_max, price_type, unit, sale_price, availability, visible, sort from public.items order by id`),
  categories: await rows(`select id, name, grp, tier, sort, active, template from public.categories order by id`),
  plans: await rows(`select category_id, plan_key, price_kes, items_limit, top_benefits from public.plans order by 1, 2`),
  settings: await rows(`select settings from public.seller_settings`),
});

test("preflight finds exactly the old rows that would trip the new rules, and is read-only", async () => {
  await c.query("begin read only");
  let found;
  try { found = await rows(preflightSql); } finally { await c.query("rollback"); }
  const byItem = (id) => found.filter((r) => r.item_id === id).map((r) => r.problem).sort();
  assert.deepEqual(byItem(item.longName), ["name longer than 80 characters"]);
  assert.deepEqual(byItem(item.cents), ["price has cents (whole KES only)"]);
  assert.deepEqual(byItem(item.range), ["highest price is not above the price"]);
  assert.deepEqual(byItem(item.sale), ["sale price is not below the price"]);
  assert.deepEqual(byItem(item.clean), []);
  assert.deepEqual(byItem(item.legacy), [], "the old 'unavailable' status stays valid");
  assert.equal(found.length, 4);
  assert.ok(found.every((r) => r.business_id === B && r.detail), "each row says whose item and what value");
  assert.ok(!/\b(insert|update|delete|alter|drop|create|truncate)\b/i.test(preflightSql.replace(/--.*$/gm, "")), "no write statements");
});

test("migrations 0006 to 0008 apply on top of existing data without losing or changing any of it", async () => {
  const before = await snapshot();
  for (const n of ["0006", "0007", "0008"]) await c.query(migration(n));
  const after = await snapshot();
  assert.deepEqual(after.items, before.items, "every item survives unchanged, including the ones that break the new rules");
  assert.deepEqual(after.categories, before.categories);
  assert.deepEqual(after.plans, before.plans, "edited plan prices are untouched");
  assert.deepEqual(after.settings, before.settings);
  const cols = (await rows(`select column_name from information_schema.columns where table_name = 'categories'`)).map((r) => r.column_name);
  assert.ok(cols.includes("item_template"));
  const defaults = await rows(`select distinct item_template::text as t from public.categories`);
  assert.deepEqual(defaults, [{ t: "[]" }], "every category starts with no item fields");
});

test("an old row that breaks a new rule refuses ordinary edits until it is fixed; clean rows are unaffected", async () => {
  await c.query(`update public.items set visible = false where id = $1`, [item.clean]);
  await c.query(`update public.items set visible = false where id = $1`, [item.legacy]);
  await assert.rejects(c.query(`update public.items set visible = false where id = $1`, [item.cents]), /items_whole_kes_check/);
  await c.query(`update public.items set visible = false, price = 11 where id = $1`, [item.cents]);
  await assert.rejects(c.query(`update public.items set visible = false where id = $1`, [item.longName]), /items_name_len_check/);
  await c.query(`update public.items set name = 'Short name' where id = $1`, [item.longName]);
  await assert.rejects(c.query(`update public.items set unit = 'x' where id = $1`, [item.range]), /items_range_check/);
  await assert.rejects(c.query(`update public.items set unit = 'x' where id = $1`, [item.sale]), /items_sale_below_price_check/);
  await c.query(`update public.items set price_max = 150 where id = $1`, [item.range]);
  await c.query(`update public.items set sale_price = 80 where id = $1`, [item.sale]);
  // and after the preflight's fixes, the preflight is empty
  await c.query("begin read only");
  let left;
  try { left = await rows(preflightSql); } finally { await c.query("rollback"); }
  assert.deepEqual(left, []);
});

test("the targeted SQL sets every category's item fields and changes nothing else", async () => {
  const before = await snapshot();
  const results = await c.query(seedSql);
  const checks = results.slice(-2);
  assert.deepEqual(checks[0].rows, [], "every id in the file exists as a category");
  assert.equal(Number(checks[1].rows[0].categories), dbCategories.length);
  const expectedWith = Object.values(ITEM_TEMPLATES).filter((f) => f.length > 0).length;
  assert.equal(Number(checks[1].rows[0].with_item_fields), expectedWith);

  const stored = Object.fromEntries((await rows(`select id, item_template from public.categories`)).map((r) => [r.id, r.item_template]));
  assert.deepEqual(stored, ITEM_TEMPLATES, "the database holds exactly the shared definitions");

  const after = await snapshot();
  assert.deepEqual(after.categories, before.categories, "names, groups, tiers and business templates are untouched");
  assert.deepEqual(after.plans, before.plans, "plans and the admin-edited prices are untouched");
  assert.equal(after.plans.find((p) => p.category_id === "barbershop" && p.plan_key === "premium").price_kes, 1777);
  assert.deepEqual(after.items, before.items);
  assert.deepEqual(after.settings, before.settings);
});

test("it is safe to run again: migrations and the targeted SQL twice change nothing", async () => {
  const first = await snapshot();
  const firstTemplates = await rows(`select id, item_template from public.categories order by id`);
  for (const n of ["0006", "0007", "0008"]) await c.query(migration(n));
  await c.query(seedSql);
  await c.query(seedSql);
  assert.deepEqual(await snapshot(), first);
  assert.deepEqual(await rows(`select id, item_template from public.categories order by id`), firstTemplates);
});

test("a category id missing from the database is reported by the SQL and the rest still update", async () => {
  await c.query(`update public.categories set item_template = '[]' where id in ('chemist', 'bakery')`);
  await c.query(`delete from public.categories where id = 'cyber-cafe'`);
  const results = await c.query(seedSql);
  assert.deepEqual(results.slice(-2)[0].rows, [{ missing_category: "cyber-cafe" }]);
  const [{ n }] = await rows(`select jsonb_array_length(item_template) as n from public.categories where id = 'chemist'`);
  assert.equal(n, ITEM_TEMPLATES.chemist.length);
});

test("the committed SQL file matches the shared definitions", () => {
  assert.equal(seedSql, buildSql());
});
