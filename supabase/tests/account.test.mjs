import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { categoryChangeQuote } from "@epicmkt/shared";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

let c;
let url;

before(async () => {
  url = await createDatabase();
  c = await connect(url);
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const branch = (biz, name = "Westlands") => `insert into branches (business_id, name, town) values ('${biz}', '${name}', 'Nairobi')`;

test("branches are Premium only and sellers only see their own", async () => {
  await rejects(c, asA, branch(ids.bizA), [], /premium_only/);
  await tx(c, asB, async (k) => {
    await k.query(branch(ids.bizB, "Main"));
    assert.equal((await sql(k, `select 1 from branches`)).length, 1);
  }, { commit: true });
  await tx(c, asA, async (k) => assert.equal((await sql(k, `select 1 from branches`)).length, 0));
  await rejects(c, asA, branch(ids.bizB), [], /row-level security/);
  await rejects(c, asA, `update branches set name = 'taken' where business_id = '${ids.bizB}'`, [], /.*/).catch(() => {});
  const stolen = await tx(c, asA, (k) => k.query(`update branches set name = 'taken'`));
  assert.equal(stolen.rowCount, 0);
  const del = await tx(c, asA, (k) => k.query(`delete from branches`));
  assert.equal(del.rowCount, 0);
  await rejects(c, asB, `update branches set business_id = '${ids.bizA}'`, [], /row-level security|branch_business_locked/);
  await tx(c, asAdmin, async (k) => assert.equal((await sql(k, `select 1 from branches`)).length, 1));
});

test("at most five branches per business", async () => {
  await tx(c, asB, async (k) => {
    for (const n of ["Two", "Three", "Four", "Five"]) await k.query(branch(ids.bizB, n));
    assert.equal((await sql(k, `select 1 from branches`)).length, 5);
  }, { commit: true });
  await rejects(c, asB, branch(ids.bizB, "Six"), [], /limit_reached:branches/);
  await rejects(c, asAdmin, branch(ids.bizB, "Six"), [], /limit_reached:branches/);
  await tx(c, asB, async (k) => {
    await k.query(`delete from branches where name = 'Five'`);
    await k.query(branch(ids.bizB, "Replacement"));
  });
});

test("the branch limit holds under concurrent inserts", async () => {
  await sql(c, `delete from branches where business_id = '${ids.bizB}'`);
  for (const n of ["One", "Two", "Three", "Four"]) await sql(c, branch(ids.bizB, n));
  const c2 = await connect(url);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const run = (conn, name) => tx(conn, asB, async (k) => { await k.query(branch(ids.bizB, name)); await pause(300); }, { commit: true });
    const results = await Promise.allSettled([run(c, "Race A"), run(c2, "Race B")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(String(results.find((r) => r.status === "rejected").reason.message), /limit_reached:branches/);
    assert.equal((await sql(c, `select count(*)::int as n from branches where business_id = '${ids.bizB}'`))[0].n, 5);
  } finally {
    await c2.end();
  }
});

test("branch phones are normalised and checked", async () => {
  await sql(c, `delete from branches where business_id = '${ids.bizB}'`);
  const row = await tx(c, asB, (k) => sql(k, `insert into branches (business_id, name, phone) values ('${ids.bizB}', 'Phoned', '0712 345 678') returning phone`));
  assert.equal(row[0].phone, "+254712345678");
  await rejects(c, asB, `insert into branches (business_id, name, phone) values ('${ids.bizB}', 'Bad', '12')`, [], /invalid_phone/);
  await rejects(c, asB, `insert into branches (business_id, name) values ('${ids.bizB}', 'x')`, [], /check constraint/);
});

test("the SQL category quote agrees with the shared JS quote", async () => {
  for (const [oldP, newP, days] of [[500, 800, 10], [500, 501, 10], [500, 1500, 29], [500, 800, 0], [500, 800, 45], [800, 500, 10], [500, 500, 5], [1500, 2000, 1], [300, 1500, 17]]) {
    const paidUntil = new Date(Date.now() + days * 86400000);
    const js = categoryChangeQuote({ oldPrice: oldP, newPrice: newP, paidUntil: paidUntil.toISOString() }).extraDueNow;
    const db = (await sql(c, `select category_change_quote($1, $2, $3::timestamptz) as q`, [oldP, newP, paidUntil.toISOString()]))[0].q;
    assert.equal(db, js, `${oldP}->${newP} in ${days} days`);
  }
  assert.equal((await sql(c, `select category_change_quote(500, 800, null) as q`))[0].q, 0);
});

test("category change requests store the quote the seller must pay", async () => {
  await sql(c, `
    insert into categories (id, name, grp, tier, sort) values ('salon', 'Salon', 'Beauty', 'A', 2), ('stall', 'Stall', 'Retail', 'D', 3);
    insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
      ('salon', 'standard', 800, 5, '["a","b","c"]'), ('salon', 'premium', 2000, 9, '["a","b","c"]'),
      ('stall', 'standard', 300, 5, '["a","b","c"]'), ('stall', 'premium', 900, 9, '["a","b","c"]');
    update businesses set paid_until = now() + interval '10 days' where id = '${ids.bizA}';`);
  const dearer = await tx(c, asA, (k) => sql(k, `select * from seller_request_change('category_id', 'salon')`));
  const expected = categoryChangeQuote({ oldPrice: 500, newPrice: 800, paidUntil: new Date(Date.now() + 10 * 86400000).toISOString() }).extraDueNow;
  assert.equal(dearer[0].quote_kes, expected);
  assert.ok(dearer[0].quote_kes > 0);
  await sql(c, `delete from change_requests where business_id = '${ids.bizA}'`);
  const cheaper = await tx(c, asA, (k) => sql(k, `select * from seller_request_change('category_id', 'stall')`));
  assert.equal(cheaper[0].quote_kes, 0);
  assert.equal((await sql(c, `select category_id from businesses where id = '${ids.bizA}'`))[0].category_id, "barber", "the old category stays live");
  await sql(c, `delete from change_requests where business_id = '${ids.bizA}'`);
  await rejects(c, asA, `select seller_request_change('category_id', 'barber')`, [], /no_change/);
});

test("map pin and licence document requests are validated", async () => {
  await sql(c, `update businesses set lat = -1.2864, lng = 36.8172 where id = '${ids.bizA}'`);
  for (const bad of ["abc", "10,10", "-1.28", "-1.2864,50"]) await rejects(c, asA, `select seller_request_change('location', $1)`, [bad], /invalid_location/);
  await rejects(c, asA, `select seller_request_change('location', '-1.286400,36.817200')`, [], /no_change/);
  const pin = await tx(c, asA, (k) => sql(k, `select * from seller_request_change('location', '-1.3, 36.9')`));
  assert.equal(pin[0].new_value, "-1.300000,36.900000");
  assert.equal(pin[0].old_value, "-1.286400,36.817200");
  assert.equal((await sql(c, `select lat from businesses where id = '${ids.bizA}'`))[0].lat, -1.2864, "the old pin stays live");
  const docs = (p) => JSON.stringify(p);
  for (const bad of ["not json", "{}", "[]", docs([`${ids.bizB}/x.pdf`]), docs([`${ids.bizA}/../x.pdf`]), docs([1]), docs(new Array(6).fill(`${ids.bizA}/a.pdf`))]) {
    await rejects(c, asA, `select seller_request_change('licence_docs', $1)`, [bad], /invalid_licence_docs/);
  }
  const ok = await tx(c, asA, (k) => sql(k, `select * from seller_request_change('licence_docs', $1)`, [docs([`${ids.bizA}/licence.pdf`])]));
  assert.equal(ok[0].status, "pending");
  assert.equal((await sql(c, `select licence_docs from businesses where id = '${ids.bizA}'`))[0].licence_docs.length, 0);
  await sql(c, `delete from change_requests where business_id = '${ids.bizA}'`);
});

test("profile limits, announcement rules and the new profile keys", async () => {
  const put = (who, patch) => tx(who === "A" ? c : c, who === "A" ? asA : asB, (k) => sql(k, `select * from seller_update_profile($1::jsonb)`, [JSON.stringify(patch)]));
  const bad = (who, patch, re) => rejects(c, who === "A" ? asA : asB, `select seller_update_profile($1::jsonb)`, [JSON.stringify(patch)], re);
  await put("A", { tagline: "x".repeat(80), description: "y".repeat(1500) });
  await bad("A", { tagline: "x".repeat(81) }, /invalid_tagline/);
  await bad("A", { description: "y".repeat(1501) }, /invalid_description/);
  for (const text of ["Visit www.shop.co.ke", "https://shop.co.ke", "mail me@shop.ke", "Call 0712 345 678", "+254 712 345 678", "x".repeat(141)]) {
    await bad("B", { announcement: text }, /invalid_announcement/);
  }
  const ok = await put("B", { announcement: "Open late on Fridays, 10% off for students" });
  assert.equal(ok[0].announcement, "Open late on Fridays, 10% off for students");
  await bad("A", { announcement: "Sale today" }, /premium_only/);
  const prof = await put("A", { profile: { year_established: 2015, website: "https://shop.co.ke", languages: ["English", "Kiswahili"], section_updated: { basics: "2026-10-09T00:00:00Z" } } });
  assert.equal(prof[0].profile.year_established, 2015);
  await bad("A", { profile: { year_established: 1800 } }, /invalid_year_established/);
  await bad("A", { profile: { year_established: 2015.5 } }, /invalid_year_established/);
  await bad("A", { profile: { website: "shop.co.ke" } }, /invalid_website/);
  await bad("A", { profile: { languages: new Array(11).fill("x") } }, /invalid_languages/);
  await bad("A", { profile: { shopfront_path: `${ids.bizB}/front.webp` } }, /invalid_shopfront_path/);
  await put("A", { profile: { shopfront_path: `${ids.bizA}/profile/front.webp` } });
});

test("licence documents use a private bucket and the migration re-runs safely", async () => {
  const b = await sql(c, `select public from storage.buckets where id = 'seller-docs'`);
  assert.equal(b[0].public, false);
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  await c.query(readFileSync(join(dir, "0006_account.sql"), "utf8"));
});
