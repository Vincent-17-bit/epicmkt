import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids } from "./db.mjs";

let c;
const anon = { role: "anon" };
const PAID = "now() + interval '30 days'";
const ALL_DAY = { mon: ["00:00", "00:00"], tue: ["00:00", "00:00"], wed: ["00:00", "00:00"], thu: ["00:00", "00:00"], fri: ["00:00", "00:00"], sat: ["00:00", "00:00"], sun: ["00:00", "00:00"] };

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_browse_search" }));
  await seedFixtures(c);
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('bakery', 'Bakeries', 'Food', 'A', 2), ('garage', 'Garages', 'Auto', 'A', 3)`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from offers`);
  await sql(c, `delete from items`);
  await sql(c, `delete from businesses`);
});

let n = 0;
const biz = async (over = {}) => {
  n += 1;
  const row = {
    seller_id: `T${String(n).padStart(6, "0")}`, name: `Shop ${n}`, category_id: "bakery", plan_key: "standard", status: "live",
    phone: "+254700000000", county: "Kisumu", town: "Kisumu", lat: -0.1, lng: 34.75, tags: [], hours: {}, ...over
  };
  row.slug = `x-${over.slug ?? `shop-${n}`}`;
  const keys = Object.keys(row);
  const out = await sql(c, `insert into businesses (${keys.join(", ")}, paid_until) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}, ${PAID}) returning id`, keys.map((k) => (k === "hours" ? JSON.stringify(row[k]) : row[k])));
  return out[0].id;
};
const item = (biz_id, price, extra = {}) => {
  const row = { business_id: biz_id, name: "Item", price, price_type: "fixed", ...extra };
  const keys = Object.keys(row);
  return sql(c, `insert into items (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(row));
};

const call = async (fn, args = [], who = anon) =>
  (await tx(c, who, (k) => sql(k, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)))[0].r;

const search = (o = {}) => {
  const a = { query: "", category: null, county: null, town: null, open: false, verified: false, featured: false, radius: null, min: null, max: null, rating: 0, sort: "relevance", seed: "0", lat: null, lng: null, page: 1, size: 12, ...o };
  return call("browse_search", [a.query, a.category, a.county, a.town, a.open, a.verified, a.featured, a.radius, a.min, a.max, a.rating, a.sort, a.seed, a.lat, a.lng, a.page, a.size]);
};
const slugs = (r) => (r.items ?? r).map((x) => x.slug.replace(/^x-/, ""));

test("every word must match, in any field, and nothing else matches", async () => {
  await biz({ slug: "a", name: "Sunrise Bakery" });
  await biz({ slug: "b", name: "Other", tags: ["bread", "oven"] });
  await biz({ slug: "c", name: "Garage", category_id: "garage" });
  assert.deepEqual(slugs(await search({ query: "sunrise" })), ["a"]);
  assert.deepEqual(slugs(await search({ query: "bread" })), ["b"]);
  assert.deepEqual(slugs(await search({ query: "garages" })), ["c"]);
  assert.deepEqual(slugs(await search({ query: "garagess" })), []);
  assert.deepEqual(slugs(await search({ query: "garage" })), ["c"]);
  assert.deepEqual(slugs(await search({ query: "sunrise bakery" })), ["a"]);
  assert.deepEqual(slugs(await search({ query: "sunrise garage" })), []);
  assert.equal((await search({ query: "zzz" })).total, 0);
  assert.equal((await search({ query: "   " })).total, 3);
});

test("field weights rank name above tag, category, area and description", async () => {
  await biz({ slug: "desc", name: "Zed", description: "we sell widgets", created_at: "2026-01-05T00:00:00Z" });
  await biz({ slug: "area", name: "Yo", town: "Widgets Town", created_at: "2026-01-04T00:00:00Z" });
  await biz({ slug: "cat", name: "Xu", category_id: "garage", created_at: "2026-01-03T00:00:00Z" });
  await biz({ slug: "tag", name: "Wu", tags: ["garage-widget"], created_at: "2026-01-02T00:00:00Z" });
  await biz({ slug: "name", name: "Widget Works", created_at: "2026-01-01T00:00:00Z" });
  assert.deepEqual(slugs(await search({ query: "widget" })), ["name", "tag", "area", "desc"]);
  assert.deepEqual(slugs(await search({ query: "garage" })), ["tag", "cat"]);
});

test("queries are normalised like the app does: case, punctuation, accents, and underscore is not a wildcard", async () => {
  await biz({ slug: "a", name: "Café Mama's" });
  await biz({ slug: "b", name: "Tea_House" });
  await biz({ slug: "c", name: "Teaxhouse" });
  assert.deepEqual(slugs(await search({ query: "CAFE" })), ["a"]);
  assert.deepEqual(slugs(await search({ query: "mama's" })), ["a"]);
  assert.deepEqual(slugs(await search({ query: "tea_house" })), ["b"]);
  assert.deepEqual(slugs(await search({ query: "100%" })), []);
  assert.equal(await sql(c, `select public.search_norm('  Café,  Mama''s!  ') as v`).then((r) => r[0].v), "cafe mama s");
  assert.equal(await sql(c, `select public.search_slug('Homa Bay') as v`).then((r) => r[0].v), "homa-bay");
});

test("premium businesses rank first and rotate with the seed; standard ones follow", async () => {
  for (let i = 0; i < 6; i += 1) await biz({ slug: `p${i}`, plan_key: "premium" });
  for (let i = 0; i < 4; i += 1) await biz({ slug: `s${i}` });
  const first = slugs(await search({ seed: "1", size: 10 }));
  assert.ok(first.slice(0, 6).every((s) => s.startsWith("p")));
  assert.ok(first.slice(6).every((s) => s.startsWith("s")));
  assert.deepEqual(first, slugs(await search({ seed: "1", size: 10 })));
  const orders = new Set();
  for (const seed of ["1", "2", "3", "4", "5"]) orders.add(slugs(await search({ seed, size: 10 })).slice(0, 6).join());
  assert.ok(orders.size > 1);
});

test("pages partition the results with no gaps or repeats, and report the total", async () => {
  for (let i = 0; i < 25; i += 1) await biz({ slug: `b${String(i).padStart(2, "0")}`, plan_key: i % 5 === 0 ? "premium" : "standard", created_at: new Date(Date.UTC(2026, 0, 1 + (i % 7))).toISOString() });
  const seen = [];
  for (let page = 1; page <= 3; page += 1) {
    const r = await search({ page, size: 10, seed: "9" });
    assert.equal(r.total, 25);
    assert.equal(r.page, page);
    assert.equal(r.items.length, page < 3 ? 10 : 5);
    seen.push(...slugs(r));
  }
  assert.equal(new Set(seen).size, 25);
  const beyond = await search({ page: 9, size: 10 });
  assert.equal(beyond.total, 25);
  assert.deepEqual(beyond.items, []);
  assert.equal((await search({ size: 5000 })).pageSize, 100);
});

test("filters: category, county, town, verified, featured, open now, rating", async () => {
  await biz({ slug: "a", town: "Maseno", county: "Kisumu", verification_level: "verified", hours: ALL_DAY, plan_key: "premium" });
  await biz({ slug: "b", category_id: "garage", town: "Homa Bay", county: "Homa Bay" });
  await biz({ slug: "c", town: "Maseno", county: "Kisumu" });
  assert.deepEqual(slugs(await search({ category: "garage" })), ["b"]);
  assert.deepEqual(slugs(await search({ county: "Homa Bay" })), ["b"]);
  assert.deepEqual((await search({ town: "maseno" })).total, 2);
  assert.deepEqual(slugs(await search({ town: "homa-bay" })), ["b"]);
  assert.deepEqual(slugs(await search({ verified: true })), ["a"]);
  assert.deepEqual(slugs(await search({ featured: true })), ["a"]);
  assert.deepEqual(slugs(await search({ open: true })), ["a"]);
  assert.equal((await search({ rating: 4 })).total, 0);
  assert.equal((await search({ rating: 0 })).total, 3);
});

test("price: from-price is the cheapest public priced item; filters and sorts use it, unpriced last", async () => {
  const a = await biz({ slug: "a" });
  const b = await biz({ slug: "b" });
  const d = await biz({ slug: "d" });
  await biz({ slug: "none" });
  await item(a, 250);
  await item(a, 120);
  await item(b, 900, { price_type: "from" });
  await item(d, 50, { price_type: "contact" });
  await item(d, 10, { visible: false });
  await item(d, 5, { hidden_by_admin: true });
  await item(d, 400, { price_type: "range" });
  assert.deepEqual(slugs(await search({ max: 200 })), ["a"]);
  assert.deepEqual(slugs(await search({ min: 300 }).then((r) => r)).sort(), ["b", "d"]);
  assert.deepEqual(slugs(await search({ sort: "price_asc" })), ["a", "d", "b", "none"]);
  assert.deepEqual(slugs(await search({ sort: "price_desc" })), ["b", "d", "a", "none"]);
  const r = await search({ sort: "price_asc" });
  assert.deepEqual(r.items.map((x) => x.fromPriceKes), [120, 400, 900, null]);
});

test("newest and rating sorts order by creation time, newest first", async () => {
  await biz({ slug: "old", created_at: "2026-01-01T00:00:00Z" });
  await biz({ slug: "new", created_at: "2026-03-01T00:00:00Z" });
  await biz({ slug: "mid", created_at: "2026-02-01T00:00:00Z" });
  assert.deepEqual(slugs(await search({ sort: "newest" })), ["new", "mid", "old"]);
  assert.deepEqual(slugs(await search({ sort: "rating" })), ["new", "mid", "old"]);
  assert.deepEqual(slugs(await search({ sort: "nonsense" })).length, 3);
});

test("distance: PostGIS radius, ordering and reported kilometres", async () => {
  await biz({ slug: "kisumu", lat: -0.0917, lng: 34.768 });
  await biz({ slug: "maseno", lat: -0.0058, lng: 34.6 });
  await biz({ slug: "nairobi", lat: -1.2921, lng: 36.8219 });
  await biz({ slug: "nowhere", lat: null, lng: null });
  const near = await search({ sort: "distance", lat: -0.0917, lng: 34.768 });
  assert.deepEqual(slugs(near), ["kisumu", "maseno", "nairobi", "nowhere"]);
  assert.ok(near.items[0].distanceKm < 0.001);
  assert.ok(Math.abs(near.items[2].distanceKm - 265) < 10);
  assert.equal(near.items[3].distanceKm, null);
  assert.deepEqual(slugs(await search({ sort: "distance", lat: -0.0917, lng: 34.768, radius: 30 })), ["kisumu", "maseno"]);
  assert.deepEqual(slugs(await search({ radius: 30 })).length, 4);
  assert.equal((await search({ lat: 999, lng: 0, radius: 30 })).total, 4);
});

test("out-of-range coordinates never break saving or searching", async () => {
  const id = await biz({ slug: "bad", lat: 999, lng: -999 });
  assert.equal((await sql(c, `select geo from businesses where id = $1`, [id]))[0].geo, null);
  assert.equal((await search({ query: "shop" })).total, 1);
});

test("only live, paid, undeleted businesses are ever returned", async () => {
  await biz({ slug: "live" });
  await biz({ slug: "paused", status: "paused" });
  await biz({ slug: "pending", status: "pending" });
  const gone = await biz({ slug: "gone" });
  const lapsed = await biz({ slug: "lapsed" });
  await sql(c, `update businesses set deleted_at = now() where id = $1`, [gone]);
  await sql(c, `update businesses set paid_until = now() - interval '30 days' where id = $1`, [lapsed]);
  assert.deepEqual(slugs(await search()), ["live"]);
  assert.deepEqual(slugs(await call("browse_featured")), []);
  assert.deepEqual(await call("browse_category_counts"), [{ categoryId: "bakery", count: 1 }]);
});

test("cards carry the live promo counts", async () => {
  const a = await biz({ slug: "a" });
  await biz({ slug: "b" });
  await sql(c, `insert into offers (business_id, title) values ($1, 'One'), ($1, 'Two'), ($1, 'Finished')`, [a]);
  await sql(c, `update offers set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' where title = 'Finished'`);
  const r = await search({ sort: "newest" });
  const by = Object.fromEntries(r.items.map((x) => [x.slug.replace(/^x-/, ""), x.promo]));
  assert.deepEqual(by.a, { flash: 0, offers: 2 });
  assert.deepEqual(by.b, { flash: 0, offers: 0 });
});

test("facets: towns with counts, price range of from-prices, the single category", async () => {
  const a = await biz({ slug: "a", town: "Maseno", county: "Kisumu" });
  const b = await biz({ slug: "b", town: "Maseno", county: "Kisumu" });
  const d = await biz({ slug: "d", town: "Kisumu", county: "Kisumu", category_id: "garage" });
  await biz({ slug: "e", town: null, county: null });
  await item(a, 50);
  await item(b, 500);
  await item(d, 700);
  const all = await call("browse_facets", ["", null]);
  assert.deepEqual(all.towns.map((t) => [t.slug, t.count]), [["kisumu", 1], ["maseno", 2]]);
  assert.deepEqual([all.priceMin, all.priceMax], [50, 700]);
  assert.equal(all.categoryId, null);
  const bakery = await call("browse_facets", ["", "bakery"]);
  assert.deepEqual([bakery.priceMin, bakery.priceMax, bakery.categoryId], [50, 500, "bakery"]);
  const onlyGarage = await call("browse_facets", ["garage", null]);
  assert.equal(onlyGarage.categoryId, "garage");
  assert.deepEqual(await call("browse_facets", ["zzz", null]), { towns: [], priceMin: null, priceMax: null, categoryId: null });
});

test("suggestions: categories, then business names, then tags; deduplicated and limited", async () => {
  await biz({ slug: "a", name: "Sunrise Bakery", tags: ["sourdough", "sunday roast"] });
  await biz({ slug: "b", name: "sunrise bakery", tags: ["Sourdough"] });
  await biz({ slug: "c", name: "Sunny Side", category_id: "garage" });
  const out = await call("browse_suggestions", ["sun"]);
  assert.deepEqual(out.map((x) => [x.type, x.label.toLowerCase()]), [["business", "sunny side"], ["business", "sunrise bakery"], ["term", "sunday roast"]]);
  assert.equal(out[0].slug, "x-c");
  assert.deepEqual((await call("browse_suggestions", ["bake"]))[0], { type: "category", label: "Bakeries", categoryId: "bakery" });
  assert.deepEqual(await call("browse_suggestions", ["s"]), []);
  assert.equal((await call("browse_suggestions", ["sun", 2])).length, 2);
});

test("featured is premium only, newest first, shuffled per seed", async () => {
  await biz({ slug: "std" });
  await biz({ slug: "p1", plan_key: "premium", created_at: "2026-01-01T00:00:00Z" });
  await biz({ slug: "p2", plan_key: "premium", created_at: "2026-02-01T00:00:00Z" });
  await biz({ slug: "p3", plan_key: "premium", category_id: "garage", created_at: "2026-03-01T00:00:00Z" });
  assert.deepEqual(slugs(await call("browse_featured")), ["p3", "p2", "p1"]);
  assert.deepEqual(slugs(await call("browse_featured", ["bakery"])), ["p2", "p1"]);
  assert.deepEqual(slugs(await call("browse_featured", [null, 1])), ["p3"]);
  const a = slugs(await call("browse_featured", [null, 6, null, null, "7"]));
  assert.deepEqual(a, slugs(await call("browse_featured", [null, 6, null, null, "7"])));
  assert.deepEqual([...a].sort(), ["p1", "p2", "p3"]);
});

test("nearby: within the radius, closest first, optional category", async () => {
  await biz({ slug: "far", lat: -1.2921, lng: 36.8219 });
  await biz({ slug: "close", lat: -0.092, lng: 34.77 });
  await biz({ slug: "closer", lat: -0.0917, lng: 34.768, category_id: "garage" });
  await biz({ slug: "nocoords", lat: null, lng: null });
  assert.deepEqual(slugs(await call("browse_nearby", [-0.0917, 34.768, 10])), ["closer", "close"]);
  assert.deepEqual(slugs(await call("browse_nearby", [-0.0917, 34.768, 10, "bakery"])), ["close"]);
  assert.deepEqual(slugs(await call("browse_nearby", [-0.0917, 34.768, 1000, null, 2])), ["closer", "close"]);
  assert.deepEqual(await call("browse_nearby", [null, null, 10]), []);
  assert.ok((await call("browse_nearby", [-0.0917, 34.768, 10]))[0].distanceKm < 0.01);
});

test("similar: same category, same county first, then nearest; unknown references fail", async () => {
  await biz({ slug: "base", lat: -0.0917, lng: 34.768, county: "Kisumu" });
  await biz({ slug: "other-county-near", lat: -0.1, lng: 34.77, county: "Siaya" });
  await biz({ slug: "same-county-far", lat: -1.0, lng: 36.0, county: "Kisumu" });
  await biz({ slug: "same-county-near", lat: -0.09, lng: 34.77, county: "Kisumu" });
  await biz({ slug: "other-category", category_id: "garage" });
  const out = await call("browse_similar", ["x-base"]);
  assert.deepEqual(slugs(out), ["same-county-near", "same-county-far", "other-county-near"]);
  assert.ok(out.every((x) => x.distanceKm === null));
  const baseId = (await sql(c, `select id from businesses where slug = 'x-base'`))[0].id;
  assert.equal(slugs(await call("browse_similar", [baseId, 1])).length, 1);
  await rejects(c, anon, `select public.browse_similar('x-missing')`, [], /business_not_found/);
  await sql(c, `update businesses set status = 'paused' where slug = 'x-base'`);
  await rejects(c, anon, `select public.browse_similar('x-base')`, [], /business_not_found/);
});

test("category counts, towns and counties come from live businesses", async () => {
  await biz({ slug: "a", town: "Maseno", county: "Kisumu" });
  await biz({ slug: "b", town: "Kisumu", county: "Kisumu", category_id: "garage" });
  await biz({ slug: "c", town: "Bondo", county: "Siaya" });
  await biz({ slug: "d", town: null, county: null });
  await biz({ slug: "e", town: "Hidden", county: "Hidden", status: "paused" });
  const counts = Object.fromEntries((await call("browse_category_counts")).map((x) => [x.categoryId, x.count]));
  assert.deepEqual(counts, { bakery: 3, garage: 1 });
  assert.deepEqual((await call("browse_towns")).map((t) => [t.slug, t.name, t.county, t.count]), [["bondo", "Bondo", "Siaya", 1], ["kisumu", "Kisumu", "Kisumu", 1], ["maseno", "Maseno", "Kisumu", 1]]);
  assert.deepEqual(await call("browse_counties"), ["Kisumu", "Siaya"]);
});

test("open-now follows Nairobi time, overnight slots and bad data", async () => {
  const at = (iso) => sql(c, `select public.is_open_now($1::jsonb, $2::timestamptz) as v`, [JSON.stringify(hours), iso]).then((r) => r[0].v);
  let hours = { mon: ["09:00", "17:00"] };
  assert.equal(await at("2026-10-26T06:00:00Z"), true);
  assert.equal(await at("2026-10-26T05:59:00Z"), false);
  assert.equal(await at("2026-10-26T14:00:00Z"), false);
  assert.equal(await at("2026-10-27T06:00:00Z"), false);
  hours = { mon: ["20:00", "02:00"] };
  assert.equal(await at("2026-10-26T18:00:00Z"), true);
  assert.equal(await at("2026-10-26T20:30:00Z"), true);
  assert.equal(await at("2026-10-26T12:00:00Z"), false);
  for (const bad of [{}, { mon: null }, { mon: ["09:00"] }, { mon: ["9am", "5pm"] }, { mon: [9, 17] }, []]) {
    hours = bad;
    assert.equal(await at("2026-10-26T09:00:00Z"), false);
  }
  assert.equal((await sql(c, `select public.is_open_now(null) as v`))[0].v, false);
});

test("search results flag isOpen from the weekly hours", async () => {
  await biz({ slug: "open", hours: ALL_DAY });
  await biz({ slug: "shut", hours: {} });
  const by = Object.fromEntries((await search()).items.map((x) => [x.slug.replace(/^x-/, ""), x.isOpen]));
  assert.deepEqual(by, { open: true, shut: false });
});

test("anon can call the public functions but not the internal helpers or the tables", async () => {
  await biz({ slug: "a" });
  assert.equal((await search()).total, 1);
  await rejects(c, anon, `select public.browse_match_sql(array['x'])`, [], /permission denied/);
  await rejects(c, anon, `select public.browse_cards(array[]::uuid[])`, [], /permission denied/);
  await rejects(c, anon, `select id from businesses`, [], /permission denied|row-level security/);
});

test("search text is capped and injection-shaped input is just text", async () => {
  await biz({ slug: "a", name: "Plain Name" });
  assert.equal((await search({ query: "'; drop table businesses; --" })).total, 0);
  assert.equal((await search({ query: "plain ".repeat(300) })).total, 1);
  assert.equal((await sql(c, `select count(*)::int as n from businesses`))[0].n, 1);
});
