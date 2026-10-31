import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";

const query = (who, args = {}) =>
  tx(c, who, async (k) => {
    const a = { tab: "all", search: null, sort: "paidUntil", dir: "asc", filters: {}, limit: 50, offset: 0, ...args };
    return (await sql(k, `select admin_businesses_query($1, $2, $3, $4, $5::jsonb, $6, $7) as r`,
      [a.tab, a.search, a.sort, a.dir, JSON.stringify(a.filters), a.limit, a.offset]))[0].r;
  });
const tabs = (who = asAdmin, filters = {}) =>
  tx(c, who, async (k) => (await sql(k, `select admin_business_tab_counts($1::jsonb) as r`, [JSON.stringify(filters)]))[0].r);
const activity = (who, limit = 15) =>
  tx(c, who, async (k) => (await sql(k, `select admin_activity($1) as r`, [limit]))[0].r);

const day = (offset) => `public.nairobi_midnight(public.nairobi_today() + (${offset}))`;
const setPaid = (id, offset, status = "live") =>
  sql(c, `update businesses set paid_until = ${offset === null ? "null" : day(offset)}, status = '${status}', deleted_at = null where id = '${id}'`);

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${SUPPORT}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'), ('${SUPPORT}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    update businesses set county = 'Nairobi', town = 'Westlands', owner_name = 'Alice Njeri' where id = '${ids.bizA}';
    update businesses set county = 'Kisumu', town = 'Kisumu', owner_name = 'John Ouma', featured = true, verification_level = 'verified' where id = '${ids.bizB}';
  `);
});
after(async () => { await c.end(); });

test("a seller and anon cannot read the admin lists", async () => {
  await rejects(c, asA, `select admin_businesses_query('all')`, [], /forbidden/);
  await rejects(c, asA, `select admin_business_tab_counts('{}')`, [], /forbidden/);
  await rejects(c, asA, `select admin_business_filter_options()`, [], /forbidden/);
  await rejects(c, asA, `select admin_activity(5)`, [], /forbidden/);
  await rejects(c, { role: "anon" }, `select admin_businesses_query('all')`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select admin_activity(5)`, [], /permission denied/);
});

test("rows come back in the shape the admin table reads", async () => {
  await setPaid(ids.bizA, 30);
  await setPaid(ids.bizB, 3);
  const { total, rows } = await query(asAdmin, { sort: "name", dir: "asc" });
  assert.equal(total, 2);
  const [a, b] = rows;
  assert.equal(a.name, "Shop A");
  assert.equal(a.sellerId, "ES100001");
  assert.equal(a.slug, "shop-a");
  assert.equal(a.category, "Barber");
  assert.equal(a.ownerName, "Alice Njeri");
  assert.equal(a.plan, "Standard");
  assert.equal(a.status, "live");
  assert.equal(a.verified, false);
  assert.match(a.paidUntil, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(a.deleted, false);
  assert.deepEqual(a.tags, []);
  assert.equal(a.agent, null);
  assert.ok(Number.isInteger(a.healthScore) && a.healthScore >= 0 && a.healthScore <= 100);
  assert.equal(b.plan, "Premium");
  assert.equal(b.verified, true);
  assert.equal(b.featured, true);
});

test("tabs follow the derived state: live, expiring, grace, expired, paused, suspended, deleted", async () => {
  await setPaid(ids.bizA, 30);
  await setPaid(ids.bizB, 3);
  let t = await tabs();
  assert.deepEqual([t.all, t.live, t.expiring], [2, 2, 1]);

  await setPaid(ids.bizB, -1);
  t = await tabs();
  assert.deepEqual([t.grace, t.expiring, t.live], [1, 0, 2]);

  await setPaid(ids.bizB, -2);
  t = await tabs();
  assert.deepEqual([t.expired, t.live, t.all], [1, 1, 2]);

  await setPaid(ids.bizB, 10, "paused");
  assert.equal((await tabs()).paused, 1);
  await setPaid(ids.bizB, 10, "suspended");
  assert.equal((await tabs()).suspended, 1);

  await sql(c, `update businesses set deleted_at = now() where id = '${ids.bizB}'`);
  t = await tabs();
  assert.deepEqual([t.deleted, t.all], [1, 1]);
  const bin = await query(asAdmin, { tab: "deleted" });
  assert.equal(bin.total, 1);
  assert.equal(bin.rows[0].deleted, true);
  await setPaid(ids.bizB, 3);
});

test("a live business that was never paid is pending, not live", async () => {
  await setPaid(ids.bizB, null);
  const { rows } = await query(asAdmin, { sort: "name" });
  assert.equal(rows.find((r) => r.name === "Shop B").status, "pending");
  assert.equal(rows.find((r) => r.name === "Shop B").paidUntil, null);
  assert.equal((await tabs()).live, 1);
  await setPaid(ids.bizB, 3);
});

test("paid_until is the Nairobi calendar day, and days-left filters use it", async () => {
  await setPaid(ids.bizA, 30);
  await setPaid(ids.bizB, 3);
  const [{ d }] = await sql(c, `select to_char(public.nairobi_today() + 3, 'YYYY-MM-DD') as d`);
  const { rows } = await query(asAdmin, { sort: "name" });
  assert.equal(rows[1].paidUntil, d);
  assert.deepEqual((await query(asAdmin, { filters: { daysMax: "7" } })).rows.map((r) => r.name), ["Shop B"]);
  assert.deepEqual((await query(asAdmin, { filters: { daysMin: "10" } })).rows.map((r) => r.name), ["Shop A"]);
});

test("search matches name, phone, seller id, slug and owner, and treats % and _ as plain text", async () => {
  for (const [needle, name] of [["shop a", "Shop A"], ["+25472234", "Shop B"], ["es100001", "Shop A"], ["shop-b", "Shop B"], ["john", "Shop B"]]) {
    assert.deepEqual((await query(asAdmin, { search: needle })).rows.map((r) => r.name), [name], needle);
  }
  assert.equal((await query(asAdmin, { search: "%" })).total, 0);
  assert.equal((await query(asAdmin, { search: "_" })).total, 0);
  assert.equal((await query(asAdmin, { search: "nothing like this" })).total, 0);
});

test("filters: category, county, town, plan, verified, featured, status, created date", async () => {
  const names = async (filters) => (await query(asAdmin, { filters, sort: "name" })).rows.map((r) => r.name);
  assert.deepEqual(await names({ category: "Barber" }), ["Shop A", "Shop B"]);
  assert.deepEqual(await names({ category: "Nope" }), []);
  assert.deepEqual(await names({ county: "Kisumu" }), ["Shop B"]);
  assert.deepEqual(await names({ town: "Westlands" }), ["Shop A"]);
  assert.deepEqual(await names({ plan: "Premium" }), ["Shop B"]);
  assert.deepEqual(await names({ verified: "yes" }), ["Shop B"]);
  assert.deepEqual(await names({ verified: "no" }), ["Shop A"]);
  assert.deepEqual(await names({ featured: "yes" }), ["Shop B"]);
  assert.deepEqual(await names({ status: "expiring" }), ["Shop B"]);
  assert.deepEqual(await names({ createdFrom: "2999-01-01" }), []);
  assert.deepEqual(await names({ agent: "__none__" }), ["Shop A", "Shop B"]);
  assert.deepEqual(await names({ agent: "Someone" }), []);
  // blank values from the UI mean "no filter"
  assert.deepEqual(await names({ category: "", county: "", daysMin: "", hasFlags: false }), ["Shop A", "Shop B"]);
  // tab counts respect the same filters
  assert.equal((await tabs(asAdmin, { county: "Kisumu" })).all, 1);
});

test("flags, items and unconfirmed payments feed the columns and the flagged tab", async () => {
  await sql(c, `
    insert into flags (business_id, reason, status) values ('${ids.bizA}', 'Wrong price', 'open'), ('${ids.bizA}', 'Old', 'resolved');
    insert into items (business_id, name, price) values ('${ids.bizA}', 'Haircut', 300), ('${ids.bizA}', 'Shave', 150);
    insert into payments (business_id, amount_kes, status, kind, mpesa_code) values ('${ids.bizB}', 1500, 'submitted', 'renewal', 'QWERTY1234');
  `);
  const { rows } = await query(asAdmin, { sort: "name" });
  assert.equal(rows[0].openFlags, 1);
  assert.equal(rows[0].items, 2);
  assert.equal(rows[1].unconfirmedPayment, true);
  assert.equal((await tabs()).flagged, 1);
  assert.deepEqual((await query(asAdmin, { tab: "flagged" })).rows.map((r) => r.name), ["Shop A"]);
  assert.deepEqual((await query(asAdmin, { filters: { hasFlags: true } })).rows.map((r) => r.name), ["Shop A"]);
  assert.deepEqual((await query(asAdmin, { filters: { hasUnconfirmed: true } })).rows.map((r) => r.name), ["Shop B"]);
  assert.deepEqual((await query(asAdmin, { sort: "items", dir: "desc" })).rows.map((r) => r.name), ["Shop A", "Shop B"]);
});

test("sorting is whitelisted, stable, and paging reports the full total", async () => {
  const byName = await query(asAdmin, { sort: "name", dir: "desc" });
  assert.deepEqual(byName.rows.map((r) => r.name), ["Shop B", "Shop A"]);
  const page1 = await query(asAdmin, { sort: "name", limit: 1, offset: 0 });
  const page2 = await query(asAdmin, { sort: "name", limit: 1, offset: 1 });
  assert.equal(page1.total, 2);
  assert.deepEqual([page1.rows[0].name, page2.rows[0].name], ["Shop A", "Shop B"]);
  // an unknown sort key falls back to paid_until instead of reaching the query text
  const odd = await query(asAdmin, { sort: "name; drop table businesses", dir: "asc; drop" });
  assert.equal(odd.total, 2);
  for (const key of ["healthScore", "lastLogin", "createdAt", "lastEdit", "strikes", "items", "paidUntil"]) {
    assert.equal((await query(asAdmin, { sort: key, dir: "desc" })).rows.length, 2, key);
  }
});

test("filter options list real categories and the counties and towns in use", async () => {
  const o = await tx(c, asAdmin, async (k) => (await sql(k, `select admin_business_filter_options() as r`))[0].r);
  assert.ok(o.categories.includes("Barber"));
  assert.deepEqual(o.counties, [{ name: "Kisumu", towns: ["Kisumu"] }, { name: "Nairobi", towns: ["Westlands"] }]);
  assert.deepEqual(o.plans, ["Standard", "Premium"]);
});

test("activity is empty when nothing happened, then lists real events newest first", async () => {
  await sql(c, `delete from admin_notifications; delete from audit_log;`);
  assert.deepEqual(await activity(asAdmin), []);

  await sql(c, `
    insert into admin_notifications (kind, business_id, data, created_at) values
      ('application_submitted', null, '{"business_name":"Umoja Market","reference_no":"EPM-1"}', now() - interval '3 minutes'),
      ('payment_submitted', '${ids.bizA}', '{"kind":"renewal"}', now() - interval '2 minutes');
    insert into audit_log (business_id, actor_role, action, entity, entity_id, created_at) values
      ('${ids.bizA}', 'seller', 'payment_submitted', 'payment', 'x', now() - interval '2 minutes'),
      ('${ids.bizB}', 'system', 'payment_confirmed', 'payment', 'y', now() - interval '1 minute');
  `);
  const rows = await activity(asAdmin);
  assert.deepEqual(rows.map((r) => r.kind), ["payment_confirmed", "payment_submitted", "application_submitted"]);
  assert.equal(rows[0].business_name, "Shop B");
  assert.equal(rows[1].business_name, "Shop A"); // the audit twin of the notification is not listed again
  assert.equal(rows[2].business_name, "Umoja Market");
  assert.equal((await activity(asAdmin, 2)).length, 2);
});

test("support never sees the applications queue in the feed; reviewer does", async () => {
  const support = await activity({ sub: SUPPORT });
  assert.ok(!support.some((r) => r.kind === "application_submitted"));
  assert.ok(support.some((r) => r.kind === "payment_submitted"));
  const reviewer = await activity({ sub: REVIEWER });
  assert.ok(reviewer.some((r) => r.kind === "application_submitted"));
});

test("the migration can be re-run", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  // 0014 cannot be replayed on a finished database any more: 0069 reshaped admin_businesses_v (new columns, two old ones gone) and
  // Postgres will not drop view columns in a create or replace. So the idempotency check runs on the migration that owns the view
  // now, twice in a row.
  const file = join(dir, "0069_business_health.sql");
  await c.query(readFileSync(file, "utf8"));
  await c.query(readFileSync(file, "utf8"));
});
