import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids } from "./db.mjs";
import { isOpenOn } from "../../shared/src/utils.js";

let c;
const anon = { role: "anon" };
const PAID = "now() + interval '30 days'";
let serial = 0;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_search" }));
  await seedFixtures(c);
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('bakery', 'Bakery', 'Food', 'A', 2)`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from items`);
  await sql(c, `delete from businesses where id not in ('${ids.bizA}', '${ids.bizB}')`);
  await sql(c, `update businesses set status = 'paused' where id in ('${ids.bizA}', '${ids.bizB}')`);
});

const shop = async (over = {}) => {
  serial += 1;
  const row = {
    seller_id: `ES9${String(serial).padStart(5, "0")}`,
    slug: `shop-${serial}`,
    name: `Shop ${serial}`,
    category_id: "barber",
    plan_key: "standard",
    status: "live",
    phone: "+254700000000",
    paid_until: new Date(Date.now() + 30 * 86400000),
    ...over
  };
  const keys = Object.keys(row);
  const out = await sql(c, `insert into businesses (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, keys.map((k) => (k === "hours" || k === "exceptions" ? JSON.stringify(row[k]) : row[k])));
  return out[0].id;
};
const price = (biz, value, type = "fixed") => sql(c, `insert into items (business_id, name, price, price_type) values ($1, 'Thing', $2, $3)`, [biz, value, type]);

const search = async (args = {}) => {
  const defaults = { p_query: "", p_category: null, p_county: null, p_town: null, p_open_now: false, p_verified: false, p_featured: false, p_lat: null, p_lng: null, p_radius_km: null, p_min_price: null, p_max_price: null, p_sort: "relevance", p_seed: "", p_page: 1, p_page_size: 12 };
  const a = { ...defaults, ...args };
  const keys = Object.keys(a);
  const rows = await tx(c, anon, (k) => sql(k, `select search_businesses(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as r`, keys.map((key) => a[key])));
  return rows[0].r;
};
const names = (r) => r.items.map((i) => i.name);
const allDays = (slot) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, slot]));
const nairobiToday = async () => (await sql(c, `select public.nairobi_day(now())::text as d`))[0].d;

test("hours_open agrees with the JavaScript rule minute by minute, exceptions and overnight included", async () => {
  const weekly = { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["20:00", "02:00"], thu: ["09:00", "09:00"], fri: ["08:00", "12:00"], sat: ["09:00", "13:00"] };
  const exceptions = [
    { id: "1", date: "2026-10-20", kind: "closed", intervals: [], note: "Holiday" },
    { id: "2", date: "2026-10-21", kind: "special", intervals: [["09:00", "11:00"], ["14:00", "16:00"]] },
    { id: "3", date: "2026-10-22", kind: "special", intervals: [["22:00", "04:00"]] },
    { id: "4", date: "2026-10-23", kind: "closed", intervals: [] },
    { id: "5", date: "2026-10-24", kind: "weird", intervals: [["01:00", "02:00"]] },
    { id: "6", date: "2026-10-25", kind: "special", intervals: [["bad", "10:00"], ["10:00", "11:00"]] }
  ];
  const scenarios = [
    [weekly, exceptions],
    [weekly, []],
    [weekly, null],
    [allDays(["22:00", "03:00"]), exceptions],
    [{}, exceptions],
    [null, null],
    [{ mon: "nope", tue: ["8", "9"], wed: ["08:00"] }, []]
  ];
  const times = [];
  for (let day = 18; day <= 27; day += 1) for (let minute = 0; minute < 1440; minute += 11) times.push(new Date(Date.UTC(2026, 9, day, 0, minute) - 3 * 3600000));
  for (const [hours, ex] of scenarios) {
    const rows = await sql(c, `select t, hours_open($1::jsonb, $2::jsonb, t) as open from unnest($3::timestamptz[]) t`, [JSON.stringify(hours), JSON.stringify(ex), times]);
    for (const row of rows) {
      let expected = false;
      try {
        expected = Boolean(hours) && isOpenOn(hours, ex ?? [], new Date(row.t));
      } catch {
        expected = false;
      }
      assert.equal(row.open, expected, `${new Date(row.t).toISOString()} ${JSON.stringify(hours)}`);
    }
  }
});

test("customers can search but still cannot read the businesses table", async () => {
  await shop({ name: "Visible Cuts" });
  assert.deepEqual(names(await search()), ["Visible Cuts"]);
  await rejects(c, anon, `select * from businesses`, [], /permission denied/);
});

test("only visible businesses are searchable", async () => {
  await shop({ name: "Live" });
  await shop({ name: "Paused", status: "paused" });
  await shop({ name: "Expired", paid_until: new Date(Date.now() - 5 * 86400000) });
  assert.deepEqual(names(await search()), ["Live"]);
});

test("words are matched by weight and every word must match", async () => {
  await shop({ name: "Sunrise Bakery", category_id: "bakery", town: "Kisumu", county: "Kisumu", tags: ["bread"] });
  await shop({ name: "Kisumu Cuts", tagline: "bread and fades", town: "Kisumu", county: "Kisumu" });
  await shop({ name: "Other", town: "Nakuru", county: "Nakuru" });
  assert.deepEqual(names(await search({ p_query: "bread" })), ["Sunrise Bakery", "Kisumu Cuts"]);
  assert.deepEqual(names(await search({ p_query: "bread kisumu cuts" })), ["Kisumu Cuts"]);
  assert.deepEqual(names(await search({ p_query: "bread zebra" })), []);
  assert.equal((await search({ p_query: "  !!  " })).total, 3);
});

test("accents and punctuation do not stop a match", async () => {
  await shop({ name: "Café Zuri's" });
  assert.deepEqual(names(await search({ p_query: "cafe zuri" })), ["Café Zuri's"]);
});

test("a query is read to 8 words only", async () => {
  await shop({ name: "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta" });
  assert.equal((await search({ p_query: "alpha beta gamma delta epsilon zeta eta theta nonsense" })).total, 1);
  assert.equal((await search({ p_query: "nonsense alpha beta gamma delta epsilon zeta eta theta" })).total, 0);
});

test("a page holds at most 100 results", async () => {
  await sql(c, `insert into businesses (seller_id, slug, name, category_id, status, phone, paid_until)
    select 'ESB' || lpad(g::text, 5, '0'), 'bulk-' || g, 'Bulk ' || g, 'barber', 'live', '+254700000000', ${PAID} from generate_series(1, 130) g`);
  const first = await search({ p_page_size: 5000 });
  assert.equal(first.items.length, 100);
  assert.equal(first.total, 130);
  assert.equal(first.page_size, 100);
  const second = await search({ p_page_size: 5000, p_page: 2 });
  assert.equal(second.items.length, 30);
  const ids1 = new Set(first.items.map((i) => i.id));
  assert.ok(second.items.every((i) => !ids1.has(i.id)), "pages do not overlap");
  assert.equal((await search({ p_page_size: 0 })).items.length, 1);
  assert.equal((await search({ p_page: 99 })).total, 130, "total stays correct past the last page");
});

test("premium shops rank first, and the same seed gives the same order", async () => {
  await shop({ name: "Standard One" });
  await shop({ name: "Premium One", plan_key: "premium" });
  await shop({ name: "Premium Two", plan_key: "premium" });
  const a = names(await search({ p_seed: "s1" }));
  assert.deepEqual(a.slice(0, 2).sort(), ["Premium One", "Premium Two"]);
  assert.equal(a[2], "Standard One");
  assert.deepEqual(names(await search({ p_seed: "s1" })), a);
});

test("filters: category, county, town, verified, featured", async () => {
  await shop({ name: "Aa Shop", category_id: "bakery", county: "Kisumu", town: "Kisumu Town", verification_level: "verified" });
  await shop({ name: "Bb Shop", county: "Nakuru", town: "Nakuru", plan_key: "premium" });
  assert.deepEqual(names(await search({ p_category: "bakery" })), ["Aa Shop"]);
  assert.deepEqual(names(await search({ p_county: "Nakuru" })), ["Bb Shop"]);
  assert.deepEqual(names(await search({ p_town: "kisumu-town" })), ["Aa Shop"]);
  assert.deepEqual(names(await search({ p_verified: true })), ["Aa Shop"]);
  assert.deepEqual(names(await search({ p_featured: true })), ["Bb Shop"]);
});

test("price filter and sort use the lowest listed price and put unpriced shops last", async () => {
  const cheap = await shop({ name: "Cheap" });
  const dear = await shop({ name: "Dear" });
  await shop({ name: "Unpriced" });
  await price(cheap, 100);
  await price(cheap, 900);
  await price(dear, 500, "from");
  await price(dear, 50, "free");
  assert.deepEqual(names(await search({ p_sort: "price_asc" })), ["Cheap", "Dear", "Unpriced"]);
  assert.deepEqual(names(await search({ p_sort: "price_desc" })), ["Dear", "Cheap", "Unpriced"]);
  assert.deepEqual(names(await search({ p_min_price: 200 })), ["Dear"]);
  assert.deepEqual(names(await search({ p_max_price: 200 })), ["Cheap"]);
  assert.equal(Number((await search({ p_sort: "price_asc" })).items[0].from_price), 100);
});

test("distance sort and radius filter use PostGIS", async () => {
  await shop({ name: "Far", lat: -1.2921, lng: 36.8219 });
  await shop({ name: "Near", lat: -0.0917, lng: 34.768 });
  await shop({ name: "Nowhere" });
  const here = { p_lat: -0.1, p_lng: 34.75 };
  const sorted = await search({ ...here, p_sort: "distance" });
  assert.deepEqual(names(sorted), ["Near", "Far", "Nowhere"]);
  assert.ok(sorted.items[0].distance_km > 1 && sorted.items[0].distance_km < 4, String(sorted.items[0].distance_km));
  assert.equal(sorted.items[2].distance_km, null);
  assert.deepEqual(names(await search({ ...here, p_radius_km: 10 })), ["Near"]);
  assert.deepEqual(names(await search({ ...here, p_radius_km: 400 })).sort(), ["Far", "Near"]);
  assert.equal((await search({ p_radius_km: 10 })).total, 3, "a radius without a position changes nothing");
  assert.equal((await search({ p_lat: 999, p_lng: 0, p_radius_km: 1 })).total, 3, "an impossible position is ignored");
});

test("open now follows seller exceptions and overnight hours", async () => {
  const today = await nairobiToday();
  const everyDay = allDays(["00:00", "23:59"]);
  await shop({ name: "Always", hours: everyDay });
  await shop({ name: "Holiday", hours: everyDay, exceptions: [{ id: "x", date: today, kind: "closed", intervals: [], note: "Holiday" }] });
  await shop({ name: "Never", hours: {} });
  const open = await search({ p_open_now: true });
  assert.deepEqual(names(open), ["Always"]);
  const all = await search();
  assert.equal(all.items.find((i) => i.name === "Holiday").is_open, false);
  assert.equal(all.items.find((i) => i.name === "Always").is_open, true);
});

test("results carry the public fields and never private ones", async () => {
  await shop({ name: "Fields", email: "private@x.com", pin: "A123", licence: "L1" });
  const item = (await search()).items[0];
  for (const key of ["id", "slug", "name", "hours", "exceptions", "plan_key", "category_id"]) assert.ok(key in item, key);
  for (const key of ["email", "pin", "licence", "seller_id", "user_id", "paid_until", "status", "geo"]) assert.ok(!(key in item), key);
});

test("search_facets: towns, price range, matching categories", async () => {
  const a = await shop({ name: "Kisumu Cuts", category_id: "barber", town: "Kisumu", county: "Kisumu" });
  const b = await shop({ name: "Kisumu Bakes", category_id: "bakery", town: "Kisumu", county: "Kisumu" });
  await shop({ name: "Nakuru Cuts", town: "Nakuru", county: "Nakuru" });
  await price(a, 300);
  await price(b, 80);
  const facets = (await tx(c, anon, (k) => sql(k, `select search_facets('kisumu', null) as r`)))[0].r;
  assert.deepEqual(facets.towns, [{ slug: "kisumu", name: "Kisumu", county: "Kisumu", count: 2 }]);
  assert.deepEqual(facets.price, { min: 80, max: 300 });
  assert.deepEqual(facets.category_ids.sort(), ["bakery", "barber"]);
  const scoped = (await tx(c, anon, (k) => sql(k, `select search_facets('', 'bakery') as r`)))[0].r;
  assert.deepEqual(scoped.category_ids, ["bakery"]);
  const none = (await tx(c, anon, (k) => sql(k, `select search_facets('zzzz', null) as r`)))[0].r;
  assert.equal(none.price, null);
  assert.deepEqual(none.towns, []);
});

test("suggestions are sorted by name inside categories, businesses and terms", async () => {
  await shop({ name: "Zed Barbers", tags: ["barber shop"] });
  await shop({ name: "Alpha Barbers", tags: ["Barber tools", "barber shop"] });
  await shop({ name: "Mid barbershop" });
  const out = (await tx(c, anon, (k) => sql(k, `select search_suggestions('barber', 10) as r`)))[0].r;
  assert.deepEqual(out.map((s) => `${s.type}:${s.label}`), [
    "category:Barber",
    "business:Alpha Barbers",
    "business:Mid barbershop",
    "business:Zed Barbers",
    "term:barber shop",
    "term:Barber tools"
  ]);
  assert.equal(out[0].categoryId, "barber");
  assert.equal(out[1].slug.startsWith("shop-"), true);
  const limited = (await tx(c, anon, (k) => sql(k, `select search_suggestions('barber', 2) as r`)))[0].r;
  assert.equal(limited.length, 2);
  assert.deepEqual((await tx(c, anon, (k) => sql(k, `select search_suggestions('b', 6) as r`)))[0].r, []);
  assert.deepEqual((await tx(c, anon, (k) => sql(k, `select search_suggestions(null, 6) as r`)))[0].r, []);
});

test("suggestions skip hidden shops and never list the same label twice", async () => {
  await shop({ name: "Hidden Cuts", status: "paused", tags: ["secret"] });
  await shop({ name: "Dup Cuts", tags: ["fades"] });
  await shop({ name: "Dup Cuts 2", tags: ["Fades"] });
  const out = (await tx(c, anon, (k) => sql(k, `select search_suggestions('fades', 10) as r`)))[0].r;
  assert.deepEqual(out.map((s) => s.label), ["Fades"]);
  assert.deepEqual((await tx(c, anon, (k) => sql(k, `select search_suggestions('secret', 10) as r`)))[0].r, []);
});

test("PostGIS keeps a point for every business with coordinates", async () => {
  const withGeo = await shop({ name: "Pin", lat: -1, lng: 36 });
  const without = await shop({ name: "No pin" });
  const rows = await sql(c, `select id, geo is not null as has from businesses where id = any($1)`, [[withGeo, without]]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.has]));
  assert.equal(byId[withGeo], true);
  assert.equal(byId[without], false);
  assert.equal((await sql(c, `select count(*)::int as n from pg_indexes where indexname = 'businesses_geo_idx'`))[0].n, 1);
});
