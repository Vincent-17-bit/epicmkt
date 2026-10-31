import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids } from "./db.mjs";

// similar_item_candidates is only the coarse net for "Similar items" (the shared rankSimilar applies the real gate), but it is
// where visibility, the current-store exclusion and the per-store cap are enforced, so those are tested here.

let c;
const anon = { role: "anon" };
const store = (n) => `10000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const item = (n) => `20000000-0000-0000-0000-0000000004${String(n).padStart(2, "0")}`;
const SEED = item(1);

const add = (n, business, name, section = null, extra = "") =>
  sql(c, `insert into items (id, business_id, name, section, price ${extra ? `, ${extra.split("=")[0]}` : ""}) values ('${item(n)}', '${business}', $1, $2, 100 ${extra ? `, ${extra.split("=")[1]}` : ""})`, [name, section]);

const ask = async (terms, { id = SEED, limit = 50, who = anon } = {}) => {
  const rows = await tx(c, who, (k) => sql(k, `select public.similar_item_candidates($1, $2::text[], $3) as out`, [id, terms, limit]));
  return rows[0].out;
};
const names = (out) => out.map((r) => r.name);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_similar_items" }));
  await seedFixtures(c);
  for (const n of [1, 2, 3, 4]) {
    const user = `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
    await sql(c, `insert into auth.users (id, email) values ('${user}', 's${n}@test')`);
    await sql(c, `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, paid_until) values ('${store(n)}', 'ES2000${n}', '${user}', 'sim-${n}', 'Sim ${n}', 'barber', 'standard', 'live', '+25471200000${n}', now() + interval '30 days')`);
  }
  // store 1 is the current store; 2, 3 and 4 are other stores
  await add(1, store(1), "Brown Bread 400g", "Bakery");
  await add(2, store(1), "Wholemeal loaf", "Bakery");
  await add(3, store(2), "Wheat Loaf", "Bakery");
  await add(4, store(2), "Chocolate Cake", "Cakes");
  await add(5, store(3), "Sliced bread loaf 800g", "Food");
  await add(6, store(3), "Steak", "Meat");
  await add(7, store(3), "Hidden bread", "Food", "visible=false");
  await add(8, store(3), "Draft bread", "Food", "draft=true");
  await add(9, store(3), "Sold out bread", "Food", "availability='out_of_stock'");
  await add(10, store(3), "Removed bread", "Food", "removed_by_admin=true");
  for (let n = 0; n < 6; n += 1) await add(20 + n, store(4), `Bread ${n}`, "Bakery");
});
after(async () => { await c.end(); });

test("finds whole-word name matches and same-section items in other stores, never the current store or item", async () => {
  const out = await ask(["bread", "breads", "loaf", "loaves"]);
  const found = new Set(names(out));
  for (const name of ["Wheat Loaf", "Sliced bread loaf 800g"]) assert.ok(found.has(name), name);
  assert.ok(out.some((r) => r.business_id === store(4)), "a store with many breads is still represented");
  assert.ok(!found.has("Brown Bread 400g") && !found.has("Wholemeal loaf"), "never the current store");
  assert.ok(out.every((r) => r.id !== SEED && r.business_id !== store(1)));
});

test("a word is matched whole, not as a substring: 'tea' does not find a steak, and a section brings the same-section items in", async () => {
  const out = await ask(["tea", "ste"]);
  assert.ok(!names(out).includes("Steak"));
  assert.ok(names(out).includes("Wheat Loaf"), "same section as the seed (Bakery)");
});

test("only listed items of visible stores come back", async () => {
  const found = names(await ask(["bread"]));
  for (const hidden of ["Hidden bread", "Draft bread", "Sold out bread", "Removed bread"]) assert.ok(!found.includes(hidden), hidden);
  await sql(c, `update businesses set paid_until = now() - interval '30 days' where id = '${store(3)}'`);
  assert.ok(!names(await ask(["bread"])).includes("Sliced bread loaf 800g"), "an expired store is not shown");
  await sql(c, `update businesses set paid_until = now() + interval '30 days' where id = '${store(3)}'`);
  assert.ok(names(await ask(["bread"])).includes("Sliced bread loaf 800g"));
});

test("at most three items per store, and each store's best item comes before any store's second", async () => {
  const out = await ask(["bread"]);
  assert.equal(out.filter((r) => r.business_id === store(4)).length, 3);
  const firstSecond = out.findIndex((r, i) => out.slice(0, i).some((p) => p.business_id === r.business_id));
  const lastFirst = out.map((r) => out.findIndex((p) => p.business_id === r.business_id)).reduce((m, i, idx) => (i === idx ? idx : m), -1);
  assert.ok(firstSecond === -1 || firstSecond > lastFirst, "every store appears once before any appears twice");
});

test("returns only the card columns, never the heavy ones", async () => {
  const [row] = await ask(["loaf"], { limit: 1 });
  assert.deepEqual(Object.keys(row).sort(), ["availability", "brand", "business_id", "created_at", "description", "id", "image_paths", "media", "name", "price", "price_type", "section", "sort", "stock_left", "unit", "video_paths"]);
});

test("odd input is harmless: hostile, empty and null terms, an unknown item, a clamped limit, and no signal at all", async () => {
  assert.ok(Array.isArray(await ask(["bread' | ) & !(", "!!", "", "a:*b"])));
  assert.deepEqual(await ask(["bread"], { id: "99999999-0000-0000-0000-000000000000" }), []);
  assert.equal((await ask(["bread", "loaf"], { limit: 0 })).length, 1);
  await sql(c, `update items set section = null where id = '${SEED}'`);
  assert.deepEqual(await ask([]), []);
  await sql(c, `update items set section = 'Bakery' where id = '${SEED}'`);
});

test("the name and section lookups are indexed", async () => {
  await sql(c, `set enable_seqscan = off`);
  const plan = (q) => sql(c, `explain ${q}`).then((r) => r.map((x) => x["QUERY PLAN"]).join("\n"));
  assert.match(await plan(`select id from items where to_tsvector('simple', coalesce(name, '')) @@ to_tsquery('simple', '''bread''')`), /items_name_words_idx/);
  assert.match(await plan(`select id from items where lower(btrim(section)) = 'bakery'`), /items_section_norm_idx/);
  await sql(c, `reset enable_seqscan`);
});

test("customers can run it and cannot read the table behind it", async () => {
  assert.ok((await ask(["bread"])).length > 0);
  await assert.rejects(() => tx(c, anon, (k) => sql(k, `select id from items limit 1`)), /permission denied/);
});
