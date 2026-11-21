import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asAdmin } from "./db.mjs";

// 0141: one ranked list of searched words (stores, products, flash sales, categories together), "Popular this week" and "Rising now",
// built from a permanent daily summary every hour.

let c;
const anon = { role: "anon" };
const service = { role: "service_role" };

const run = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const refresh = () => run(service, `select refresh_trending()`);
const lists = async (county = null, limit = 20) => (await run(anon, `select trending_lists($1, $2) as out`, [county, limit]))[0].out;
const popular = async (county) => (await lists(county)).popular.map((x) => x.term);
const rising = async () => (await lists()).rising.map((x) => x.term);

let seq = 0;
// n different people searching a term, `hoursAgo` hours ago (each call uses new anonymous visitors)
const people = (term, n, { county = null, hoursAgo = 1 } = {}) =>
  sql(
    c,
    `insert into search_events (term, client_hash, bucket, county, at)
     select $1, 'h' || $2::text || '-' || g, 0, $3, now() - make_interval(hours => $4) from generate_series(1, $5) g`,
    [term, ++seq, county, hoursAgo, n]
  );
// what the daily summary says about a term on each of the days `fromDay..toDay` before today
const history = (term, perDay, fromDay, toDay) =>
  sql(
    c,
    `insert into search_term_daily (day, term, scope, label, people)
     select (now() at time zone 'Africa/Nairobi')::date - g, public.search_group_key($1), '*', $1, $2 from generate_series($3::int, $4::int) g`,
    [term, perDay, fromDay, toDay]
  );

const addItem = async (business, name, { extra = {} } = {}) => {
  const id = randomUUID();
  const cols = Object.keys(extra);
  await sql(
    c,
    `insert into items (id, business_id, name, price, created_at${cols.map((k) => `, ${k}`).join("")})
     values ($1, $2, $3, 100, now() - interval '2 days'${cols.map((_, i) => `, $${4 + i}`).join("")})`,
    [id, business, name, ...Object.values(extra)]
  );
  return id;
};

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_trending" }));
  await seedFixtures(c);
  await sql(c, `update businesses set paid_until = now() + interval '30 days'`);
  await sql(c, `update businesses set county = 'Kisumu' where id = '${ids.bizA}'`);
  await sql(c, `update businesses set county = 'Nairobi' where id = '${ids.bizB}'`);

  await addItem(ids.bizA, "Gas Cylinder 6kg");
  await addItem(ids.bizB, "Water Dispenser");
  await addItem(ids.bizA, "Solar Lamp");
  await addItem(ids.bizA, "Sold Out Phone", { extra: { availability: "out_of_stock" } });
  const sneakers = await addItem(ids.bizA, "Flash Sneakers");
  await sql(
    c,
    `insert into flash_sales (business_id, item_id, headline, starts_at, ends_at, discount_type, discount_value, status)
     values ($1, $2, 'Sneaker day', now() - interval '1 hour', now() + interval '3 hours', 'percent', 20, 'live')`,
    [ids.bizA, sneakers]
  );
  await run(service, `select refresh_search_terms()`);
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(
    c,
    `delete from search_events; delete from search_term_daily; delete from search_trending; delete from search_trending_pins;
     delete from search_blocklist; update trending_settings set min_people = 3, min_people_pct = 0.005, min_people_cap = 50, rising_min_ratio = 1.5,
       popular_days = 7, county_min_terms = 5, stale_hours = 3`
  );
});

test("one list ranks every kind together: a store, a category, a flash sale and a product", async () => {
  await people("gas cylinder", 8);
  await people("shop a", 6);
  await people("barber", 5);
  await people("flash sneakers", 4);
  await refresh();
  const out = await lists();
  assert.deepEqual(out.popular.map((x) => [x.term, x.kind, x.count]), [
    ["gas cylinder", "product", 8],
    ["shop a", "store", 6],
    ["barber", "category", 5],
    ["flash sneakers", "flash", 4]
  ]);
  assert.deepEqual(out.popular.map((x) => x.rank), [1, 2, 3, 4]);
  assert.equal(out.items.length, out.popular.length, "older clients still read `items`");
  assert.equal(out.popular[3].label, "Flash Sneakers", "the name it resolved to");
  assert.ok(out.popular[0].itemId, "a product carries its example item");
  assert.equal(out.popular[1].slug, "shop-a", "a store carries its page");
});

test("plural endings and synonyms count as one thing, shown with the most common spelling", async () => {
  await people("gas cylinder", 2);
  await people("gas cylinders", 3);
  await people("gesi", 2); // a synonym of "gas"
  await people("gas", 1);
  await refresh();
  const out = await lists();
  const cyl = out.popular.find((x) => x.term === "gas cylinders");
  assert.equal(cyl.count, 5, "cylinder + cylinders = 5 people");
  assert.equal(out.popular.filter((x) => /cylinder/.test(x.term)).length, 1, "no split");
  const gas = out.popular.find((x) => x.term === "gas");
  assert.equal(gas.count, 3, "gesi + gas = 3 people, shown as the canonical word");
});

test("a term nobody can reach is never shown: no such item, or only a sold-out one", async () => {
  await people("unicorn saddle", 10);
  await people("sold out phone", 10);
  await people("solar lamp", 4);
  await refresh();
  assert.deepEqual(await popular(), ["solar lamp"]);
});

test("the people needed grows with traffic, up to a cap", async () => {
  await people("solar lamp", 6);
  await people("water dispenser", 12);
  await refresh();
  assert.deepEqual(await popular(), ["water dispenser", "solar lamp"], "at the quietest, 3 people is enough");

  // 18 searchers in 48 hours: the bar is 18 x the share, rounded up
  await sql(c, `update trending_settings set min_people_pct = 0.2`);
  await refresh();
  assert.deepEqual(await popular(), ["water dispenser", "solar lamp"], "ceil(18 * 0.2) = 4: both have enough");
  await sql(c, `update trending_settings set min_people_pct = 0.35`);
  await refresh();
  assert.deepEqual(await popular(), ["water dispenser"], "ceil(18 * 0.35) = 7: solar lamp has 6");
  await sql(c, `update trending_settings set min_people_pct = 0.5, min_people_cap = 50`);
  await refresh();
  assert.deepEqual(await popular(), ["water dispenser"], "ceil(18 * 0.5) = 9: the 6-person term drops out");
  await sql(c, `update trending_settings set min_people_cap = 4`);
  await refresh();
  assert.deepEqual(await popular(), ["water dispenser", "solar lamp"], "the cap holds the bar at 4");
});

test("popular is the 7-day window: today and 6 earlier days count, the 7th earlier day does not", async () => {
  await people("water dispenser", 20, { hoursAgo: 0 });
  await history("water dispenser", 20, 1, 7);
  await refresh();
  const out = await lists();
  assert.equal(out.popular.find((x) => x.term === "water dispenser").count, 20 + 6 * 20);
});

test("rising is a jump against the term's own average; an everyday word does not rise", async () => {
  await history("water dispenser", 20, 1, 7); // steady every day
  await history("solar lamp", 1, 1, 7); // quiet
  await people("water dispenser", 20); // still 20 today
  await people("solar lamp", 9); // 9 today
  await refresh();
  const out = await lists();
  assert.deepEqual(out.rising.map((x) => x.term), ["solar lamp"]);
  assert.equal(Number(out.rising[0].ratio), 9);
  assert.ok(out.popular.map((x) => x.term).includes("water dispenser"), "the everyday word is still popular");
  assert.equal(out.popular.find((x) => x.term === "solar lamp").hot, true, "a rising term is flagged in popular too");
  assert.equal(out.popular.find((x) => x.term === "water dispenser").hot, false);
  assert.equal(out.rising[0].kind, "product");
});

test("one enthusiastic searcher cannot make a term rise", async () => {
  await people("solar lamp", 2);
  await refresh();
  assert.deepEqual(await rising(), []);
});

test("the rebuild can run again and again, and a count never goes down when old raw searches are gone", async () => {
  await people("solar lamp", 5);
  await refresh();
  await refresh();
  const before = (await sql(c, `select sum(people)::int as n from search_term_daily where scope = '*'`))[0].n;
  assert.equal(before, 5);
  await sql(c, `delete from search_events`);
  await refresh();
  assert.equal((await sql(c, `select sum(people)::int as n from search_term_daily where scope = '*'`))[0].n, 5, "kept");
  assert.deepEqual(await popular(), ["solar lamp"]);
});

test("an admin can pin up to 3 terms to the top for some days; they still need a live result", async () => {
  await people("gas cylinder", 9);
  await people("solar lamp", 5);
  const pin = (term, days = 7) => run(asAdmin, `select admin_trending_pin($1, $2, 'campaign')`, [term, days]);
  await pin("barber"); // fewer than the 3 people needed, but it is a live category
  await pin("unicorn saddle"); // nothing live
  await refresh();
  const out = await lists();
  assert.deepEqual(out.popular.map((x) => x.term), ["barber", "gas cylinder", "solar lamp"]);
  assert.equal(out.popular[0].pinned, true);
  assert.equal(out.popular[1].pinned, false);

  await sql(c, `update search_trending_pins set expires_at = now() - interval '1 minute' where term = 'barber'`);
  await refresh();
  assert.deepEqual(await popular(), ["gas cylinder", "solar lamp"], "an expired pin is gone");

  await run(asAdmin, `select admin_trending_unpin('unicorn saddle')`);
  await pin("a1 term");
  await pin("b2 term");
  await pin("c3 term");
  await assert.rejects(pin("d4 term"), /at most 3 pinned/);
  await run(asAdmin, `select admin_trending_unpin('a1 term')`);
  await pin("d4 term");
});

test("hiding a term takes it out at once and keeps it out after the next rebuild; showing it again brings it back", async () => {
  await people("gas cylinder", 9);
  await people("solar lamp", 5);
  await refresh();
  assert.deepEqual(await popular(), ["gas cylinder", "solar lamp"]);
  await run(asAdmin, `select admin_trending_hide('solar')`);
  assert.deepEqual(await popular(), ["gas cylinder"], "immediate, without a rebuild");
  await refresh();
  assert.deepEqual(await popular(), ["gas cylinder"]);
  await run(asAdmin, `select admin_trending_unhide('solar')`);
  await refresh();
  assert.deepEqual(await popular(), ["gas cylinder", "solar lamp"]);
});

test("a county gets its own list when it has enough local terms, otherwise the national list", async () => {
  const kisumu = ["gas cylinder", "solar lamp", "water dispenser", "shop a", "barber"];
  for (const t of kisumu) await people(t, 3, { county: "kisumu" });
  await people("flash sneakers", 4); // national only
  await people("solar lamp", 4, { county: "nairobi" });
  await refresh();

  const k = await lists("Kisumu");
  assert.equal(k.scope, "kisumu");
  assert.equal(k.fallback, "none");
  assert.deepEqual(k.popular.map((x) => x.term).sort(), [...kisumu].sort());

  const n = await lists("Nairobi");
  assert.equal(n.scope, "*", "one local term is not a list");
  assert.equal(n.fallback, "national");
  assert.ok(n.popular.map((x) => x.term).includes("flash sneakers"));

  assert.equal((await lists("Narnia")).fallback, "national");
  assert.equal((await lists()).fallback, "none");
});

test("a list older than stale_hours is not served: the live count of the last 24 hours is, and the status says so", async () => {
  await people("solar lamp", 5);
  await refresh();
  assert.equal((await lists()).live, false);
  assert.equal((await run(service, `select trending_status() as s`))[0].s.ok, true);

  await sql(c, `update trending_settings set last_run_at = now() - interval '6 hours'`);
  const out = await lists();
  assert.equal(out.live, true);
  assert.deepEqual(out.popular.map((x) => x.term), ["solar lamp"]);
  const status = (await run(service, `select trending_status() as s`))[0].s;
  assert.equal(status.ok, false);
  assert.ok(status.ageMinutes >= 360);
  assert.equal(status.staleAfterHours, 3);
});

test("one or two missed hourly runs are tolerated; a list older than 3 hours is not served", async () => {
  await people("solar lamp", 5);
  await refresh();
  for (const [hours, served] of [[1, true], [2, true], [2.9, true], [3.1, false], [8, false]]) {
    await sql(c, `update trending_settings set last_run_at = now() - make_interval(mins => $1)`, [Math.round(hours * 60)]);
    assert.equal((await lists()).live, !served, `${hours} h old`);
    assert.equal((await run(service, `select trending_status() as s`))[0].s.ok, served, `${hours} h old`);
  }
});

test("a young site is never empty: the busiest categories stand in", async () => {
  await refresh();
  const out = await lists();
  assert.equal(out.fallback, "categories");
  assert.equal(out.popular[0].kind, "category");
  assert.equal(out.popular[0].term, "Barber");
  assert.equal((await run(service, `select trending_status() as s`))[0].s.ok, true, "the rebuild ran, there was just nothing to rank");
});

test("log_search keeps the shopper's county next to the anonymous hash, and the one-argument call still works", async () => {
  const log = async (ip, ...args) => {
    await c.query("begin");
    try {
      await c.query(`set local role anon`);
      await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ "cf-connecting-ip": ip })]);
      await c.query(`select log_search(${args.map((_, i) => `$${i + 1}`).join(", ")})`, args);
    } finally {
      await c.query("commit");
    }
  };
  await log("10.0.0.1", "water dispenser");
  await log("10.0.0.2", "water dispenser", "Kisumu");
  await log("10.0.0.3", "water dispenser", "kisumu; drop table x");
  const rows = await sql(c, `select county from search_events order by id`);
  assert.deepEqual(rows.map((r) => r.county), [null, "kisumu", null]);
});

test("who may do what", async () => {
  await refresh();
  await tx(c, anon, (k) => sql(k, `select trending_lists(null, 10)`));
  await assert.rejects(tx(c, anon, (k) => sql(k, `select refresh_trending()`)), /permission denied/);
  await assert.rejects(tx(c, anon, (k) => sql(k, `select trending_status()`)), /permission denied/);
  await assert.rejects(tx(c, anon, (k) => sql(k, `select admin_trending_overview()`)), /permission denied/);
  await assert.rejects(tx(c, anon, (k) => sql(k, `select * from search_term_daily`)), /permission denied/);
  await assert.rejects(tx(c, { sub: ids.userA }, (k) => sql(k, `select admin_trending_hide('x1')`)), /forbidden/);
  const overview = (await tx(c, asAdmin, (k) => sql(k, `select admin_trending_overview() as o`)))[0].o;
  assert.deepEqual(Object.keys(overview).sort(), ["counties", "hidden", "pins", "popular", "rising", "status", "synonyms"]);
  await run(asAdmin, `select admin_synonym_set('mkokoteni', 'wheelbarrow')`);
  assert.equal((await sql(c, `select canonical from search_synonyms where variant = 'mkokoteni'`))[0].canonical, "wheelbarrow");
  await run(asAdmin, `select admin_synonym_remove('mkokoteni')`);
  assert.equal((await sql(c, `select count(*)::int as n from search_synonyms where variant = 'mkokoteni'`))[0].n, 0);
});
