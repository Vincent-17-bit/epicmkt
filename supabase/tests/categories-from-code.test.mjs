// supabase/data/categories_from_code.sql: adds the categories the code defines but the database lacks, and leaves every
// category and price an admin already has exactly as it is.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, connect, seedFixtures, sql } from "./db.mjs";
import { categories } from "../../client/src/data/categories.js";

const file = readFileSync(new URL("../data/categories_from_code.sql", import.meta.url), "utf8");
let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_categories_from_code_test" }));
  await seedFixtures(c);
  // An admin already has Bakery, switched off, with their own Premium price and a renamed group.
  await sql(c, `
    insert into public.categories (id, name, grp, icon, tier, sort, active) values ('bakery', 'Bakery and cakes', 'Food', 'bread-slice', 'B', 5, false);
    insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
      ('bakery', 'standard', 500, 3, '["a","b","c"]'), ('bakery', 'premium', 1100, 6, '["a","b","c"]');
  `);
});
after(async () => { await c?.end(); });

test("every category in the code ends up in the database with both plans priced, and running it twice changes nothing", async () => {
  await sql(c, file);
  const ids = categories.map((x) => x.id);
  const rows = await sql(c, `select c.id, (select count(*)::int from plans p where p.category_id = c.id and p.price_kes > 0) as priced from categories c where c.id = any($1)`, [ids]);
  assert.equal(rows.length, ids.length);
  assert.ok(rows.every((r) => r.priced === 2), JSON.stringify(rows.filter((r) => r.priced !== 2)));
  for (const id of ["phones-accessories", "electronics-computers", "fashion-boutiques", "home-kitchen"]) {
    const r = (await sql(c, `select active, (select array_agg(price_kes order by plan_key) from plans p where p.category_id = $1) as prices from categories where id = $1`, [id]))[0];
    assert.equal(r.active, true, id);
    assert.deepEqual(r.prices, [2000, 800], id);
  }
  const before = await sql(c, `select count(*)::int n from categories`);
  await sql(c, file);
  assert.deepEqual(await sql(c, `select count(*)::int n from categories`), before);
});

test("what an admin already set is left alone: name, group, on/off and prices", async () => {
  const b = (await sql(c, `select name, grp, active, (select array_agg(price_kes order by plan_key) from plans p where p.category_id = 'bakery') as prices from categories where id = 'bakery'`))[0];
  assert.deepEqual(b, { name: "Bakery and cakes", grp: "Food", active: false, prices: [1100, 500] });
  const barber = (await sql(c, `select array_agg(price_kes order by plan_key) as prices from plans where category_id = 'barber'`))[0].prices;
  assert.deepEqual(barber, [1500, 500]);
});
