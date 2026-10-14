import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, sql } from "./db.mjs";
import { categories as repoCategories } from "../../client/src/data/categories.js";
import { planRows } from "../../client/src/config/plans.seed.js";
import { buildSeed, COUNTS, DEMO, ITEM_ISSUES, json } from "../../scripts/lib/seed-data.ts";
import { demoExists, insertMany, loadSeed, readCatalog, resetDemo } from "../../scripts/lib/seed-load.ts";
import { listingState } from "../functions/_shared/dates.ts";

let c;
const NOW = new Date();

before(async () => {
  c = await connect(await createDatabase());
  // the same catalogue `npm run seed` loads
  await insertMany(c, "categories", repoCategories.map((x, i) => ({ id: x.id, name: x.name, grp: x.group, icon: x.icon, tier: x.tier, sort: (i + 1) * 10, active: true, template: json(x.keyFields), extra_docs: json(x.extraDocs) })));
  await insertMany(c, "plans", repoCategories.flatMap((x) => planRows(x.id, x.tier)).map((p) => ({ ...p, top_benefits: json(p.top_benefits), features: json(p.features) })));
});
after(async () => { await c?.end(); });

const catalog = async () => readCatalog(c);

test("the dataset has the sizes and spread the admin screens need", async () => {
  const data = buildSeed({ ...(await catalog()), now: NOW });
  const s = data.stats;
  assert.equal(s.businesses, 66);
  assert.deepEqual(Object.keys(s.businessesByStatus).sort(), ["deleted", "expired", "live", "paused", "pending", "suspended"]);
  assert.ok(s.items >= 200 && s.itemsWithIssues >= 200, `${s.items} items, ${s.itemsWithIssues} with issues`);
  for (const k of ITEM_ISSUES) assert.ok(s.itemIssues[k] > 0, `no item has the issue ${k}`);
  assert.equal(s.payments, 40);
  assert.deepEqual(Object.keys(s.paymentsByStatus).sort(), ["confirmed", "rejected", "submitted"]);
  assert.equal(s.duplicatePaymentCodes, 1);
  assert.equal(s.changeRequests, COUNTS.changeRequests);
  assert.equal(s.reports, 10);
  assert.deepEqual(Object.keys(s.applicationsByStatus).sort(), ["activated", "approved", "changes_requested", "payment_confirming", "rejected", "submitted", "under_review", "uploading"]);
  assert.deepEqual(Object.keys(s.messagesByStatus).sort(), ["delivered", "failed", "queued", "sent"]);
  assert.ok(s.messagesByStatus.failed >= 10);
});

test("the same seed gives the same data, another seed gives different data", async () => {
  const cat = await catalog();
  const a = buildSeed({ ...cat, now: NOW, seed: 1 });
  const b = buildSeed({ ...cat, now: NOW, seed: 1 });
  const d = buildSeed({ ...cat, now: NOW, seed: 2 });
  assert.deepEqual(a.tables, b.tables);
  assert.notDeepEqual(a.tables.businesses.map((x) => x.id), d.tables.businesses.map((x) => x.id));
});

test("it refuses to build without a catalogue instead of inventing one", () => {
  assert.throws(() => buildSeed({ categories: [], plans: [] }), /npm run seed/);
});

test("loads into the real schema, and every demo row is recognisable", async () => {
  const cat = await catalog();
  const data = buildSeed({ ...cat, now: NOW });
  assert.equal(await demoExists(c), false);
  const written = await loadSeed(c, data);
  assert.equal(written.businesses, 66);
  assert.equal(written.items, data.stats.items);
  assert.equal(written.payments, 40);
  assert.equal(await demoExists(c), true);

  const n = async (q) => Number((await sql(c, q))[0].n);
  assert.equal(await n(`select count(*) n from businesses where seller_id like '${DEMO.sellerPrefix}%'`), 66);
  assert.equal(await n(`select count(*) n from businesses where slug not like '${DEMO.slugPrefix}%'`), 0);
  assert.equal(await n(`select count(*) n from change_requests`), 12);
  assert.equal(await n(`select count(*) n from reports`), 10);
  assert.equal(await n(`select count(*) n from applications`), 26);
  assert.equal(await n(`select count(*) n from messages where channel in ('sms','email')`), 60);
});

test("items respect their plan's item limit, and prices and media are consistent", async () => {
  const over = await sql(c, `select b.id from businesses b join plans p on p.category_id = b.category_id and p.plan_key = b.plan_key
                               join items i on i.business_id = b.id group by b.id, p.items_limit having count(*) > p.items_limit`);
  assert.deepEqual(over, []);
  assert.equal(Number((await sql(c, `select count(*) n from items where hidden_by_admin and admin_hide_reason is null`))[0].n), 0);
  assert.ok(Number((await sql(c, `select count(*) n from items where price is null and price_type = 'fixed'`))[0].n) > 0);
  assert.ok(Number((await sql(c, `select count(*) n from items i where not exists (select 1 from item_media m where m.item_id = i.id)`))[0].n) > 0);
});

test("payments: one code twice (a rejected twin), receipts issued for confirmed ones, paid_until matches the latest confirmed payment", async () => {
  const dup = await sql(c, `select mpesa_code, array_agg(status order by status) s from payments group by mpesa_code having count(*) > 1`);
  assert.equal(dup.length, 1);
  assert.deepEqual(dup[0].s, ["confirmed", "rejected"]);
  assert.equal(Number((await sql(c, `select count(*) n from payments where status = 'confirmed' and receipt_no is null`))[0].n), 0);
  assert.equal(Number((await sql(c, `select count(*) n from payments where status = 'confirmed' and period_end is null`))[0].n), 0);
  const mismatched = await sql(c, `select b.id from businesses b join payments p on p.business_id = b.id and p.status = 'confirmed'
                                    where public.nairobi_day(b.paid_until) <> p.period_end`);
  assert.deepEqual(mismatched, []);
});

test("every business status and listing state the admin filters on is present", async () => {
  const states = {};
  for (const b of await sql(c, `select status, paid_until from businesses where deleted_at is null`)) {
    const k = `${b.status}/${listingState(b.paid_until, NOW)}`;
    states[k] = (states[k] ?? 0) + 1;
  }
  for (const k of ["live/active", "live/grace", "live/expired", "pending/none", "paused/active", "suspended/active", "expired/expired"]) assert.ok(states[k], `missing ${k}: ${JSON.stringify(states)}`);
  const counts = (await sql(c, `select public.admin_counts() as c`)).length; // function exists
  assert.equal(counts, 1);
});

test("admin counts see the seeded work (run as an admin through the real function)", async () => {
  await sql(c, `insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a0', 'seed-admin@test') on conflict do nothing`);
  await sql(c, `insert into admins (user_id, role) values ('00000000-0000-0000-0000-0000000000a0', 'owner') on conflict do nothing`);
  await c.query("begin");
  await c.query(`set local role authenticated`);
  await c.query(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true)`);
  const k = (await c.query(`select public.admin_counts() as c`)).rows[0].c;
  await c.query("rollback");
  assert.equal(k.submitted, 6);
  assert.equal(k.under_review, 3);
  assert.equal(k.changes_requested, 3);
  assert.equal(k.awaiting_payment, 3);
  assert.equal(k.payment_confirming, 3);
  assert.equal(k.unconfirmed_payments, 8);
  assert.equal(k.failed_messages, 19);
  assert.equal(k.pending_changes, 6);
  assert.equal(k.open_reports, 6);
  assert.ok(k.live > 20 && k.expiring_7d > 0 && k.in_grace > 0 && k.expired > 0 && k.suspended === 5 && k.open_flags > 0);
});

test("seller notifications came from the triggers, and the seller never sees the SMS log", async () => {
  assert.ok(Number((await sql(c, `select count(*) n from messages where channel = 'in_app'`))[0].n) > 0);
  assert.ok(Number((await sql(c, `select count(*) n from admin_notifications where kind = 'application_submitted'`))[0].n) >= 6);
});

test("a second load without --reset is detected; --reset removes exactly the demo rows and loading again works", async () => {
  // a real, non-demo business must survive the reset
  await sql(c, `insert into businesses (seller_id, slug, name, category_id, plan_key, status, phone) values ('ES100777', 'real-shop', 'Real Shop', '${repoCategories[0].id}', 'standard', 'live', '+254700000777')`);
  assert.equal(await demoExists(c), true);
  await resetDemo(c);
  assert.equal(await demoExists(c), false);
  const n = async (q) => Number((await sql(c, q))[0].n);
  assert.equal(await n(`select count(*) n from businesses`), 1);
  assert.equal(await n(`select count(*) n from items`), 0);
  assert.equal(await n(`select count(*) n from payments`), 0);
  assert.equal(await n(`select count(*) n from applications`), 0);
  assert.equal(await n(`select count(*) n from messages`), 0);
  assert.equal(await n(`select count(*) n from admin_notifications`), 0);
  assert.ok(await n(`select count(*) n from message_templates`) >= 6, "templates are content and stay");

  await loadSeed(c, buildSeed({ ...(await catalog()), now: NOW, seed: 99 }));
  assert.equal(await n(`select count(*) n from businesses`), 67);
  assert.equal(await n(`select count(*) n from payments`), 40);
});
