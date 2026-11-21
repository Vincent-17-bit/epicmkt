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

test("the first window with a result decides the whole list: a busy day is not mixed with older searches", async () => {
  await seed("today", 3, 1);
  await seed("yesterday", 6, 30);
  assert.deepEqual((await top()).map((r) => r.term), ["today"]);
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
