import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, sql } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase());
});
after(async () => {
  await c.end();
});
beforeEach(async () => {
  await sql(c, `delete from search_events; delete from search_blocklist`);
});

const from = async (ip, term, role = "anon") => {
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(ip ? { "cf-connecting-ip": ip } : {})]);
    await c.query(`select log_search($1)`, [term]);
  } finally {
    await c.query("commit");
  }
};
const top = async () => {
  await c.query("begin");
  try {
    await c.query(`set local role anon`);
    return (await c.query(`select * from top_searches(10)`)).rows;
  } finally {
    await c.query("commit");
  }
};
const total = async () => Number((await sql(c, `select count(*) as n from search_events`))[0].n);

test("one client repeating a term counts once", async () => {
  for (let i = 0; i < 20; i += 1) await from("1.1.1.1", "barbershop");
  assert.equal(await total(), 1);
  assert.deepEqual(await top(), []);
});

test("a term needs three different clients before it is listed", async () => {
  await from("1.1.1.1", "barbershop");
  await from("2.2.2.2", "Barbershop ");
  assert.deepEqual(await top(), []);
  await from("3.3.3.3", "barbershop");
  const rows = await top();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].term, "barbershop");
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].hot, true);
});

test("a client is capped per minute", async () => {
  for (let i = 0; i < 30; i += 1) await from("9.9.9.9", `term ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`);
  assert.equal(await total(), 12);
});

test("junk, links and requests without a client address are dropped without error", async () => {
  await from("1.1.1.1", "http://spam.example/buy");
  await from("1.1.1.1", "<script>alert(1)</script>");
  await from("1.1.1.1", "12345");
  await from("1.1.1.1", "a");
  await from("1.1.1.1", "x".repeat(200));
  await from("1.1.1.1", "one two three four five six seven");
  await from("1.1.1.1", null);
  await from(null, "barbershop");
  assert.equal(await total(), 0);
});

test("a blocked word disappears from the list", async () => {
  for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) await from(ip, "badword shop");
  assert.equal((await top()).length, 1);
  await sql(c, `insert into search_blocklist (term) values ('badword')`);
  assert.equal((await top()).length, 0);
});

test("browser roles cannot read or write the tables", async () => {
  await from("1.1.1.1", "barbershop");
  for (const role of ["anon", "authenticated"]) {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await assert.rejects(c.query(`select * from search_events`), /permission denied/);
    await c.query("rollback");
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await assert.rejects(c.query(`insert into search_events (term, client_hash, bucket) values ('x1', 'h', 1)`), /permission denied/);
    await c.query("rollback");
  }
});

// ---- 0144: the list falls back to wider windows instead of going blank ---------------------------------------------------------
const age = (term, hours) => sql(c, `update search_events set at = now() - make_interval(hours => $2) where term = $1`, [term, hours]);
const seed = async (term, n, hours) => {
  for (let i = 0; i < n; i += 1) await from(`10.${term.length}.${hours}.${i + 1}`, term);
  await age(term, hours);
};

test("a quiet last 24 hours shows the previous day's trending term instead of nothing", async () => {
  await seed("bread", 4, 30);
  const rows = await top();
  assert.deepEqual(rows.map((r) => [r.term, r.count, r.hot]), [["bread", 4, false]]);
});

test("the last 7 days are used when the last 48 hours have nothing", async () => {
  await seed("cakes", 3, 100);
  assert.deepEqual((await top()).map((r) => r.term), ["cakes"]);
});

test("older than 7 days is still not trending", async () => {
  await seed("bread", 5, 24 * 8);
  assert.deepEqual(await top(), []);
});

test("a term with fewer than 3 searchers never shows, in any window", async () => {
  await seed("bread", 2, 30);
  await seed("cakes", 2, 100);
  assert.deepEqual(await top(), []);
});

test("a busy day comes first; older terms only top it up after it, never above it", async () => {
  await seed("today", 3, 1);
  await seed("yesterday", 6, 30);
  assert.deepEqual((await top()).map((r) => r.term), ["today", "yesterday"]);
});

test("a fallback list is sorted by searchers, then by term", async () => {
  await seed("bread", 4, 30);
  await seed("cakes", 4, 31);
  await seed("shirt", 6, 40);
  assert.deepEqual((await top()).map((r) => [r.term, r.count]), [["shirt", 6], ["bread", 4], ["cakes", 4]]);
});

test("the blocklist and the limit still apply to a fallback list", async () => {
  await seed("bread", 3, 30);
  await seed("badword shop", 3, 30);
  await sql(c, `insert into search_blocklist (term) values ('badword')`);
  assert.deepEqual((await top()).map((r) => r.term), ["bread"]);
  await c.query("begin");
  try {
    await c.query(`set local role anon`);
    assert.equal((await c.query(`select * from top_searches(1)`)).rows.length, 1);
  } finally {
    await c.query("commit");
  }
});

test("the same searchers repeating in a wider window still count once", async () => {
  for (let i = 0; i < 6; i += 1) await from("7.7.7.7", "bread");
  await age("bread", 30);
  assert.deepEqual(await top(), []);
});

test("top_searches_hourly falls back to the live list, which now has the wider window", async () => {
  await seed("bread", 3, 30);
  await c.query("begin");
  try {
    await c.query(`set local role anon`);
    const out = (await c.query(`select top_searches_hourly(10) as r`)).rows[0].r;
    assert.equal(out.live, true);
    assert.deepEqual(out.items.map((i) => i.term), ["bread"]);
  } finally {
    await c.query("commit");
  }
});

// ---- 0145: variants fold together, shop names are not product trends, short lists are topped up ----------------------------------
const people = async (term, ips) => { for (const ip of ips) await from(ip, term); };
const shop = async (name, status = "live") => {
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('barber', 'Barber', 'Services', 'A', 1) on conflict do nothing`);
  const n = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const user = `00000000-0000-0000-0000-000${n}`;
  await sql(c, `insert into auth.users (id, email) values ('${user}', 's${n}@test')`);
  await sql(c, `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, paid_until) values (gen_random_uuid(), 'ES${n}', '${user}', 's-${n}', $1, 'barber', 'standard', $2, '+254713${n.slice(0, 6)}', now() + interval '30 days')`, [name, status]);
};
const clear = () => sql(c, `delete from businesses where slug like 's-%'; delete from auth.users where email like 's%@test'`);

test("spacing and plural variants are one search, and a person who typed two variants counts once", async () => {
  await people("red bull", ["1.0.0.1", "1.0.0.2"]);
  await people("redbull", ["1.0.0.2", "1.0.0.3"]);
  await people("red bulls", ["1.0.0.4"]);
  const rows = await top();
  assert.deepEqual(rows.map((r) => [r.term, r.count]), [["red bull", 4]]);
});

test("the shown spelling is the one most people typed, the spaced one on a tie", async () => {
  await people("redbull", ["1.0.1.1", "1.0.1.2"]);
  await people("red bull", ["1.0.1.3", "1.0.1.4"]);
  assert.deepEqual((await top()).map((r) => r.term), ["red bull"]);
  await sql(c, `delete from search_events`);
  await people("redbull", ["1.0.1.1", "1.0.1.2", "1.0.1.5"]);
  await people("red bull", ["1.0.1.3"]);
  assert.deepEqual((await top()).map((r) => r.term), ["redbull"]);
});

test("cake and cakes are one search", async () => {
  await people("cake", ["1.0.2.1", "1.0.2.2"]);
  await people("cakes", ["1.0.2.3"]);
  assert.deepEqual((await top()).map((r) => [r.term, r.count]), [["cake", 3]]);
});

test("a typo of a popular term joins it, but different words do not", async () => {
  await people("bread", ["1.0.3.1", "1.0.3.2", "1.0.3.3", "1.0.3.4"]);
  await people("brread", ["1.0.3.5", "1.0.3.6"]);
  assert.deepEqual((await top()).map((r) => [r.term, r.count]), [["bread", 6]]);
  await sql(c, `delete from search_events`);
  await people("shirt", ["1.0.4.1", "1.0.4.2", "1.0.4.3"]);
  await people("skirt", ["1.0.4.4", "1.0.4.5", "1.0.4.6"]);
  assert.deepEqual((await top()).map((r) => r.term).sort(), ["shirt", "skirt"]);
});

test("short terms are never folded by spelling distance", async () => {
  await people("tea", ["1.0.5.1", "1.0.5.2", "1.0.5.3"]);
  await people("tee", ["1.0.5.4", "1.0.5.5", "1.0.5.6"]);
  assert.deepEqual((await top()).map((r) => r.term).sort(), ["tea", "tee"]);
});

test("a live shop's name is not a product trend; a suspended shop's name is, and a product word that starts a shop name stays", async () => {
  await clear();
  await shop("Sunrise Bakery");
  await shop("Kevin Bakery");
  await shop("Bread Basket");
  await shop("Old Shop", "suspended");
  await people("sunrise bakery", ["1.0.6.1", "1.0.6.2", "1.0.6.3"]);
  await people("kevin bakeries", ["1.0.6.4", "1.0.6.5", "1.0.6.6"]);
  await people("bread", ["1.0.6.7", "1.0.6.8", "1.0.6.9"]);
  await people("old shop", ["1.0.6.10", "1.0.6.11", "1.0.6.12"]);
  assert.deepEqual((await top()).map((r) => r.term).sort(), ["bread", "old shop"]);
  await clear();
});

test("a window whose only qualifying terms are shop names counts as empty: the next window is used", async () => {
  await clear();
  await shop("Sunrise Bakery");
  await people("sunrise bakery", ["1.0.7.1", "1.0.7.2", "1.0.7.3"]);
  await seed("bread", 3, 30);
  assert.deepEqual((await top()).map((r) => r.term), ["bread"]);
  await clear();
});

test("a short list is topped up from the wider windows, below the busy terms, without repeats", async () => {
  await seed("today", 3, 1);
  await seed("day before", 4, 30);
  await seed("last week", 5, 100);
  await seed("tody", 2, 100); // a typo variant of a term already listed is not listed twice
  const rows = await top();
  assert.deepEqual(rows.map((r) => r.term), ["today", "day before", "last week"]);
  assert.ok(rows.every((r) => r.hot === false || r.term === "today"));
});

test("a list that already has 5 terms is not padded, and the limit caps the top-up", async () => {
  for (const [i, t] of ["alpha", "bravo", "cobra", "delta", "eagle"].entries()) await seed(t, 3, 2 + i);
  await seed("older", 9, 100);
  assert.equal((await top()).length, 5);
  assert.ok(!(await top()).map((r) => r.term).includes("older"));
  await sql(c, `delete from search_events`);
  await seed("today", 3, 1);
  await seed("older", 9, 100);
  await c.query("begin");
  try {
    await c.query(`set local role anon`);
    assert.equal((await c.query(`select * from top_searches(1)`)).rows.length, 1);
  } finally {
    await c.query("commit");
  }
});

test("the hourly job stores the folded, topped-up list", async () => {
  await people("red bull", ["1.0.8.1", "1.0.8.2"]);
  await people("redbull", ["1.0.8.3"]);
  await sql(c, `select refresh_top_searches()`);
  const rows = await sql(c, `select term, searches from search_top_hourly order by rank`);
  assert.deepEqual(rows.map((r) => [r.term, Number(r.searches)]), [["red bull", 3]]);
});
