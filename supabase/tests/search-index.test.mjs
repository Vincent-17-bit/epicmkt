import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, connect, seedFixtures, tx, sql, ids } from "./db.mjs";

// 0128-0130: the indexed search, the type-ahead dictionary, the hourly trending list and the home feed pool.

let c;
const anon = { role: "anon" };
const service = { role: "service_role" };
const hidden = "30000000-0000-0000-0000-0000000000c1";

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params));
const run = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const one = async (who, text, params) => (await as(who, text, params))[0];
const candidates = async (q, limit = 600) => (await one(anon, `select public.search_product_candidates($1, $2) as out`, [q, limit])).out;
const suggest = async (q) => (await one(anon, `select public.search_suggest($1, 8) as out`, [q])).out;
const names = (out) => out.items.map((i) => i.name);

const add = async (business, name, { brand = null, section = null, created = "now() - interval '2 days'", extra = {} } = {}) => {
  const id = randomUUID();
  const cols = Object.keys(extra);
  await sql(
    c,
    `insert into items (id, business_id, name, brand, section, price, created_at${cols.map((k) => `, ${k}`).join("")})
     values ($1, $2, $3, $4, $5, 100, ${created}${cols.map((_, i) => `, $${6 + i}`).join("")})`,
    [id, business, name, brand, section, ...Object.values(extra)]
  );
  return id;
};

let milk;
let futureItem;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_search_index" }));
  await seedFixtures(c);
  // Shop A (standard) and Shop B (premium) are live and paid; a third store is live but expired, so it is not public.
  await sql(c, `update businesses set paid_until = now() + interval '30 days'`);
  await sql(c, `insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@test')`);
  await sql(c, `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, paid_until)
                values ('${hidden}', 'ES100003', '00000000-0000-0000-0000-0000000000c1', 'shop-c', 'Shop C', 'barber', 'standard', 'live', '+254732345678', now() - interval '90 days')`);

  milk = await add(ids.bizA, "Brookside Fresh Milk 500ml", { brand: "Brookside", section: "Dairy" });
  await add(ids.bizA, "Milk Powder 400g", { section: "Dairy" });
  await add(ids.bizB, "Daima Milk 1L", { brand: "Daima", section: "Dairy" });
  await add(ids.bizB, "Café Latté Mug", { section: "Kitchen" });
  await add(ids.bizB, "Bluetooth Speakers Pair", { brand: "Sony", section: "Electronics" });
  await add(ids.bizA, "Hidden Milk", { extra: { visible: false } });
  await add(ids.bizA, "Draft Milk", { extra: { draft: true } });
  await add(ids.bizA, "Sold Out Milk", { extra: { availability: "out_of_stock" } });
  await add(ids.bizA, "Removed Milk", { extra: { removed_by_admin: true } });
  await add(hidden, "Expired Store Milk");
  futureItem = await add(ids.bizA, "Milk Brand New Today", { created: "now() + interval '2 hours'" });
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', $3, 'image/jpeg')`, [milk, ids.bizA, `${ids.bizA}/${milk}/${randomUUID()}`]);
});
after(async () => {
  await c.end();
});

test("one normal form for text, and query words trimmed of plural endings", async () => {
  const r = await one(anon, `select public.search_key('Café Latté 500ML!  — Pack') as k, public.search_query_tokens('Speakers, Batteries & boxes x') as t`);
  assert.equal(r.k, "cafe latte 500ml pack");
  assert.deepEqual(r.t, ["speaker", "batter", "box"]);
});

test("every word matches as a prefix, accents do not matter, and only public items of visible stores come back", async () => {
  assert.deepEqual(names(await candidates("brook mil")), ["Brookside Fresh Milk 500ml"]);
  assert.deepEqual(names(await candidates("cafe latte")), ["Café Latté Mug"]);
  assert.deepEqual(names(await candidates("speaker")), ["Bluetooth Speakers Pair"]);
  const all = names(await candidates("milk"));
  for (const gone of ["Hidden Milk", "Draft Milk", "Sold Out Milk", "Removed Milk", "Expired Store Milk"]) assert.ok(!all.includes(gone), gone);
  assert.deepEqual(new Set(all), new Set(["Brookside Fresh Milk 500ml", "Milk Powder 400g", "Daima Milk 1L", "Milk Brand New Today"]));
});

test("a name that starts with the query ranks first, and the answer has the products_snapshot shape", async () => {
  const out = await candidates("milk");
  assert.match(out.items[0].name, /^Milk /);
  assert.equal(out.matched, 4);
  assert.equal(out.truncated, false);
  const brookside = out.items.find((i) => i.id === milk);
  assert.equal(brookside.brand, "Brookside");
  assert.equal(brookside.section, "Dairy");
  assert.ok(brookside.image_path, "first picture path");
  assert.ok(out.businesses.some((b) => b.slug === "shop-a"));
  assert.ok(!out.businesses.some((b) => b.slug === "shop-c"));
});

test("a limit bounds the answer and an empty query asks for nothing", async () => {
  assert.equal((await candidates("milk", 2)).items.length, 2);
  const empty = await candidates("  !! ");
  assert.deepEqual(empty.items, []);
  assert.equal(empty.matched, 0);
});

test("suggestions wait for the dictionary; then 'mi' offers milk, products with a store, stores and categories", async () => {
  assert.equal(await suggest("mi"), null, "never refreshed: the caller uses its own fallback");
  await run(service, `select public.refresh_search_rollups()`);
  const mi = await suggest("mi");
  assert.equal(mi.terms[0].label, "milk");
  const product = mi.products.find((p) => p.id === milk);
  assert.ok(product, "an example product for milk");
  assert.equal(product.slug, "shop-a");
  assert.ok(product.image);
  const shop = await suggest("shop");
  assert.deepEqual(shop.stores.map((s) => s.slug).sort(), ["shop-a", "shop-b"]);
  const barb = await suggest("barb");
  assert.deepEqual(barb.categories, [{ label: "Barber", id: "barber" }]);
  assert.deepEqual(await suggest("m"), { terms: [], products: [], stores: [], categories: [], corrected: null });
});

test("a word inside a longer phrase is found from three letters, and a misspelling is corrected", async () => {
  const fre = await suggest("fre");
  assert.ok(fre.terms.some((t) => t.label === "fresh"));
  const typo = await suggest("mlik");
  assert.equal(typo.corrected, "milk");
  assert.equal(typo.terms[0].label, "milk");
  const search = await candidates("mlik powdr");
  assert.equal(search.corrected, "milk powder");
  assert.deepEqual(names(search), ["Milk Powder 400g"]);
});

test("visitors can call the read functions but not the refreshes, and cannot read the tables", async () => {
  await assert.rejects(as(anon, `select public.refresh_search_rollups()`), /permission denied/);
  await assert.rejects(as(anon, `select public.refresh_search_terms()`), /permission denied/);
  await assert.rejects(as(anon, `select * from public.search_terms`), /permission denied/);
  await assert.rejects(as(anon, `select * from public.search_top_hourly`), /permission denied/);
});

test("trending: the live count until the hourly job has run, then the stored list with a picture", async () => {
  await sql(c, `delete from search_top_hourly`);
  for (const [n, term] of [[1, "milk"], [2, "milk"], [3, "milk"], [4, "speaker"]]) {
    await sql(c, `insert into search_events (term, client_hash, bucket) values ($1, $2, 1)`, [term, `client-${n}`]);
  }
  const live = (await one(anon, `select public.top_searches_hourly(10) as out`)).out;
  assert.equal(live.live, true);
  assert.deepEqual(live.items.map((i) => i.term), ["milk"]);
  await run(service, `select public.refresh_top_searches()`);
  const hourly = (await one(anon, `select public.top_searches_hourly(10) as out`)).out;
  assert.equal(hourly.live, false);
  assert.equal(hourly.items[0].term, "milk");
  assert.equal(hourly.items[0].count, 3);
  assert.equal(hourly.items[0].itemId, milk, "the newest milk with a picture");
  assert.equal(hourly.items[0].slug, "shop-a");
  assert.ok(hourly.items[0].image);
  const stats = await sql(c, `select term, score from search_query_stats order by term`);
  assert.deepEqual(stats.map((s) => s.term), ["milk", "speaker"]);
});

test("the feed pool of an hour is the same every time it is asked for, and never holds what was created during that hour", async () => {
  const epoch = Math.floor(Date.now() / 3_600_000);
  const a = (await one(anon, `select public.products_feed_pool($1) as out`, [epoch])).out;
  const b = (await one(anon, `select public.products_feed_pool($1) as out`, [epoch])).out;
  assert.deepEqual(a.items.map((i) => i.id), b.items.map((i) => i.id));
  assert.ok(!a.items.some((i) => i.id === futureItem), "created after the hour began");
  const later = (await one(anon, `select public.products_feed_pool($1) as out`, [epoch + 3])).out;
  assert.ok(later.items.some((i) => i.id === futureItem), "it joins the pool of a later hour");
  for (const gone of ["Hidden Milk", "Draft Milk", "Sold Out Milk", "Removed Milk", "Expired Store Milk"]) {
    assert.ok(!a.items.some((i) => i.name === gone), gone);
  }
  assert.equal(new Set(a.items.map((i) => i.id)).size, a.items.length, "no duplicates");
  assert.ok(a.featured > 0, "Shop B is premium, so it has a featured part");
});

test("the indexes on items exist and are valid", async () => {
  const rows = await sql(c, `select indexrelid::regclass::text as name, indisvalid from pg_index where indexrelid::regclass::text in ('items_search_doc_idx', 'items_search_trgm_idx') order by 1`);
  assert.deepEqual(rows, [{ name: "items_search_doc_idx", indisvalid: true }, { name: "items_search_trgm_idx", indisvalid: true }]);
});
