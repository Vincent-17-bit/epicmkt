import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { connect, createDatabase, ids, seedFixtures, sql } from "./db.mjs";

// The visibility matrix: a shop and what it sells may be seen only while business_is_visible(b) holds (live, not deleted, and the
// subscription active or inside its grace days). Every public door is asked about the same eleven shops.
let c;
// name, status, paid_until (days from now), per-shop grace days, deleted_at set, visible?
const SHOPS = [
  ["Zephyr Bakes", "live", 30, null, false, true, "active"],
  ["Quokka Cuts", "live", -1, null, false, true, "in grace (default 1 day)"],
  ["Marlin Mart", "live", -4, 5, false, true, "in a 5-day own grace"],
  ["Pelican Posh", "live", -1, 0, false, false, "no grace, one day late"],
  ["Heron Hub", "live", -10, null, false, false, "expired past grace"],
  ["Otter Outlet", "live", null, null, false, false, "never paid"],
  ["Lynx Lane", "suspended", 30, null, false, false, "suspended"],
  ["Gecko Goods", "paused", 30, null, false, false, "unlisted by the seller"],
  ["Ibis Imports", "pending", 30, null, false, false, "not approved yet"],
  ["Koala Kiosk", "deleted", 30, null, false, false, "account deleted"],
  ["Newt Nook", "live", 30, null, true, false, "deleted_at set"],
];
const slug = (n) => "vq-" + n.toLowerCase().replace(/[^a-z]+/g, "-");
const visibleSlugs = SHOPS.filter((s) => s[5]).map((s) => slug(s[0])).sort();
const allSlugs = SHOPS.map((s) => slug(s[0])).sort();
const bizId = {};
let seq = 0;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_visibility" }));
  await seedFixtures(c);
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('salon-beauty', 'Salon', 'Beauty', 'A', 2)`);
  await sql(c, `insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ('salon-beauty', 'standard', 500, 600, '["a","b","c"]'), ('salon-beauty', 'premium', 1500, 600, '["a","b","c"]')`);
  for (const [name, status, paid, grace, deleted] of SHOPS) {
    seq += 1;
    const user = `00000000-0000-0000-0000-0000000f${String(seq).padStart(4, "0")}`;
    await sql(c, `insert into auth.users (id, email) values ($1, $2)`, [user, `vq${seq}@test`]);
    const row = await sql(
      c,
      `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, paid_until, grace_days, deleted_at, tags)
       values (gen_random_uuid(), $1, $2, $3, $4, 'salon-beauty', 'premium', $5, $6, ${paid === null ? "null" : `now() + interval '${paid} days'`}, $7,
               ${deleted ? "now()" : "null"}, array['vqtag']) returning id`,
      [`ESVQ${seq}`, user, slug(name), name, status, `+2547130${String(seq).padStart(5, "0")}`, grace],
    );
    bizId[slug(name)] = row[0].id;
    await sql(c, `insert into items (business_id, name, price, visible, draft) values ($1, $2, 100, true, false)`, [row[0].id, `Glowberry ${name.split(" ")[0]}`]);
    await sql(c, `insert into staff_members (business_id, name) values ($1, $2)`, [row[0].id, `Staff of ${name}`]);
    await sql(c, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 1, '09:00', '10:00', $2)`, [row[0].id, `Class of ${name}`]);
    await sql(c, `insert into gallery_photos (business_id, path, mime) values ($1, $2, 'image/jpeg')`, [row[0].id, `${row[0].id}/gallery/vq${seq}`]);
  }
});
after(async () => c?.end());

const anon = async (fn) => {
  await c.query("begin");
  try {
    await c.query("set local role anon");
    return await fn(c);
  } finally {
    await c.query("rollback");
  }
};
const q = (text, params) => anon((k) => sql(k, text, params));
const slugsOf = (rows, key = "business_slug") => [...new Set(rows.map((r) => r[key]))].sort();
const search = async (text) => (await sql(c, text)).map((r) => r);
const setState = (name, set) => sql(c, `update businesses set ${set} where slug = $1`, [slug(name)]);

test("every anon-facing view shows only the shops that business_is_visible allows", async () => {
  assert.deepEqual(slugsOf(await q(`select business_slug from public_staff`)), visibleSlugs);
  assert.deepEqual(slugsOf(await q(`select business_slug from public_timetable`)), visibleSlugs);
  assert.deepEqual(slugsOf(await q(`select business_slug from public_gallery_photos`)), visibleSlugs);
  assert.deepEqual(slugsOf(await q(`select slug from public_businesses`, []), "slug").filter((s) => s.startsWith("vq-")), visibleSlugs);
  const items = await q(`select name from public_items where name like 'Glowberry %' order by name`);
  assert.deepEqual(items.map((r) => r.name), SHOPS.filter((s) => s[5]).map((s) => `Glowberry ${s[0].split(" ")[0]}`).sort());
});

test("the matrix agrees with business_is_visible itself", async () => {
  const rows = await sql(c, `select slug, public.business_is_visible(b) as v from businesses b where slug like 'vq-%'`);
  for (const r of rows) assert.equal(r.v, SHOPS.find((s) => slug(s[0]) === r.slug)[5], r.slug);
});

test("shop and product search return only visible shops", async () => {
  const shops = await q(`select search_businesses(p_query => 'vqtag', p_page_size => 100) as r`);
  assert.deepEqual(shops[0].r.items.map((d) => d.slug).sort(), visibleSlugs);
  const found = (await q(`select search_product_candidates('glowberry') as r`))[0].r;
  const names = (found.items ?? []).map((i) => i.name).sort();
  assert.deepEqual(names, SHOPS.filter((s) => s[5]).map((s) => `Glowberry ${s[0].split(" ")[0]}`).sort());
});

test("suggestions: products and stores are re-checked at read time, so a shop that lapses after the dictionary was built vanishes at once", async () => {
  await sql(c, `select refresh_search_terms()`);
  const before = (await q(`select search_suggest('zephyr') as r`))[0].r;
  assert.deepEqual(before.stores.map((s) => s.slug), ["vq-zephyr-bakes"]);
  assert.equal(before.products.length, 1);
  // the dictionary still has it; the shop is suspended now
  await setState("Zephyr Bakes", `status = 'suspended'`);
  const after1 = (await q(`select search_suggest('zephyr') as r`))[0].r;
  assert.deepEqual(after1.stores, []);
  assert.deepEqual(after1.products, []);
  await setState("Zephyr Bakes", `status = 'live', paid_until = now() - interval '10 days'`);
  const after2 = (await q(`select search_suggest('zephyr') as r`))[0].r;
  assert.deepEqual([after2.stores, after2.products], [[], []]);
  await setState("Zephyr Bakes", `paid_until = now() + interval '30 days', deleted_at = now()`);
  assert.deepEqual((await q(`select search_suggest('zephyr') as r`))[0].r.stores, []);
  await setState("Zephyr Bakes", `deleted_at = null`);
  assert.deepEqual((await q(`select search_suggest('zephyr') as r`))[0].r.stores.map((s) => s.slug), ["vq-zephyr-bakes"]);
});

const people = async (term, tag) => {
  for (let i = 1; i <= 3; i += 1) {
    await c.query("begin");
    await c.query(`set local role anon`);
    await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ "cf-connecting-ip": `7.${tag}.0.${i}` })]);
    await c.query(`select log_search($1)`, [term]);
    await c.query("commit");
  }
};

test("trending shops: only visible shops searched by 3 people trend, and they follow the shop's state at read time", async () => {
  await sql(c, `delete from search_events`);
  let tag = 0;
  for (const s of SHOPS) await people(s[0].toLowerCase(), (tag += 1));
  await people("glowberry", 99); // a product trend, so the hourly job stores a list (otherwise the live list is served)
  const names = await q(`select slug from top_shop_searches(10) order by slug`);
  assert.deepEqual(names.map((r) => r.slug), [...visibleSlugs].sort().slice(0, 10));
  // hourly list: stored, then the shop is suspended before the next run
  await sql(c, `select refresh_top_searches()`);
  const stored = (await q(`select top_searches_hourly(10) as r`))[0].r;
  assert.equal(stored.live, false);
  assert.deepEqual(stored.stores.map((s) => s.slug).sort(), visibleSlugs);
  await setState("Marlin Mart", `status = 'suspended'`);
  await setState("Quokka Cuts", `paid_until = now() - interval '20 days'`);
  const later = (await q(`select top_searches_hourly(10) as r`))[0].r;
  assert.deepEqual(later.stores.map((s) => s.slug), ["vq-zephyr-bakes"]);
  await setState("Marlin Mart", `status = 'live'`);
  await setState("Quokka Cuts", `paid_until = now() + interval '30 days'`);
});

test("a shop name is a shop trend, not a product trend; a hidden shop's name trends nowhere", async () => {
  await sql(c, `delete from search_events`);
  let tag = 50;
  for (const s of SHOPS) await people(s[0].toLowerCase(), (tag += 1));
  assert.deepEqual((await q(`select term from top_searches(10)`)).map((r) => r.term), []);
});

test("a term trends only while something visible matches it, even if the dictionary and the stored list are older", async () => {
  await sql(c, `delete from search_events`);
  await people("glowberry", 90);
  assert.deepEqual((await q(`select term from top_searches(10)`)).map((r) => r.term), ["glowberry"]);
  await sql(c, `select refresh_top_searches()`);
  const stored = (await q(`select top_searches_hourly(10) as r`))[0].r;
  assert.deepEqual(stored.items.map((i) => i.term), ["glowberry"]);
  assert.ok(stored.items[0].slug && stored.items[0].itemId);
  // the example item's shop lapses; another visible shop still sells it: the card moves to that shop at once
  const exSlug = stored.items[0].slug;
  await sql(c, `update businesses set status = 'suspended' where slug = $1`, [exSlug]);
  const moved = (await q(`select top_searches_hourly(10) as r`))[0].r;
  assert.deepEqual(moved.items.map((i) => i.term), ["glowberry"]);
  assert.notEqual(moved.items[0].slug, exSlug);
  assert.ok(visibleSlugs.includes(moved.items[0].slug));
  // now every shop that sells it is hidden: the term is gone from the live list and from the stored one
  await sql(c, `update businesses set status = 'suspended' where slug like 'vq-%'`);
  assert.deepEqual((await q(`select term from top_searches(10)`)).map((r) => r.term), []);
  assert.deepEqual((await q(`select top_searches_hourly(10) as r`))[0].r.items, []);
  await sql(c, `update businesses set status = 'live' where slug like 'vq-%' and slug = any($1)`, [visibleSlugs]);
});

test("browser roles cannot call the internal helpers", async () => {
  for (const fn of [`trending_shops_in_window('1 day', 5)`, `trending_in_window('1 day', 5)`, `search_term_has_result('x1')`]) {
    await c.query("begin");
    await c.query("set local role anon");
    await assert.rejects(c.query(`select * from ${fn}`), /permission denied/);
    await c.query("rollback");
  }
});
