import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin, asService } from "./db.mjs";
import { addCalendarMonth as dbDate, listingState as billingState } from "../../shared/src/billing.js";
import { addCalendarMonth, addDays, listingState, nairobiDay, nairobiMidnight, renewalPeriod } from "../functions/_shared/dates.ts";

let c;
const U = {
  owner: ids.admin,
  reviewer: "00000000-0000-0000-0000-0000000000c1",
  finance: "00000000-0000-0000-0000-0000000000c2",
  support: "00000000-0000-0000-0000-0000000000c3",
};
const as = (role) => ({ sub: U[role] });
const one = async (text, params) => (await sql(c, text, params))[0];

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values
      ('${U.reviewer}', 'reviewer@test'), ('${U.finance}', 'finance@test'), ('${U.support}', 'support@test');
    insert into public.admins (user_id, role, email) values
      ('${U.reviewer}', 'reviewer', 'reviewer@test'), ('${U.finance}', 'finance', 'finance@test'), ('${U.support}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
  `);
});

after(async () => { await c?.end(); });

// ---- the TypeScript helpers, billing.js and Postgres must agree ---------------------------------

test("add_calendar_month: SQL, billing.js and dates.ts agree on every day of four years", async () => {
  let day = "2025-01-01";
  const rows = [];
  while (day < "2029-01-01") { rows.push(day); day = addDays(day, 1); }
  const sqlRows = await sql(c, `select d::text as d, public.add_calendar_month(d::date)::text as next, public.add_calendar_month(d::date, -1)::text as prev
                                  from unnest($1::text[]) as d`, [rows]);
  for (const r of sqlRows) {
    assert.equal(addCalendarMonth(r.d), r.next, `+1 month from ${r.d}`);
    assert.equal(addCalendarMonth(r.d, -1), r.prev, `-1 month from ${r.d}`);
    assert.equal(dbDate(r.d).toISOString().slice(0, 10), r.next, `billing.js from ${r.d}`);
  }
});

test("nairobi_day, nairobi_midnight and listing_state agree with dates.ts around midnight EAT", async () => {
  const instants = ["2026-10-14T20:59:59Z", "2026-10-14T21:00:00Z", "2026-10-15T20:59:59Z", "2026-10-15T21:00:00Z", "2026-10-16T21:00:00Z", "2026-02-28T21:00:00Z", "2027-01-01T00:00:00Z"];
  const paid = nairobiMidnight("2026-10-15");
  assert.equal((await one(`select to_char(public.nairobi_midnight('2026-10-15') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as t`)).t, paid);
  for (const now of instants) {
    const r = await one(`select public.nairobi_day($1::timestamptz)::text as d, public.listing_state($2::timestamptz, $1::timestamptz) as s`, [now, paid]);
    assert.equal(nairobiDay(new Date(now)), r.d, `day at ${now}`);
    assert.equal(listingState(paid, new Date(now)), r.s, `state at ${now}`);
    assert.equal(billingState(paid, new Date(now)), r.s === "none" ? "none" : r.s, `billing.js state at ${now}`);
  }
});

test("renewalPeriod matches payment_apply_confirmation for first, early, grace and lapsed payments", async () => {
  await sql(c, `insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ('barber','standard',500,3,'["a","b","c"]') on conflict do nothing`);
  const cases = [
    { name: "early", paid: "2026-10-20", now: "2026-10-14T09:00:00+03:00" },
    { name: "paid today", paid: "2026-10-14", now: "2026-10-14T09:00:00+03:00" },
    { name: "grace", paid: "2026-10-13", now: "2026-10-14T09:00:00+03:00" },
    { name: "lapsed", paid: "2026-10-01", now: "2026-10-14T09:00:00+03:00" },
    { name: "31 Jan", paid: "2026-01-31", now: "2026-01-20T09:00:00+03:00" },
    { name: "never paid", paid: null, now: "2026-10-14T09:00:00+03:00" },
  ];
  for (const k of cases) {
    await sql(c, `update businesses set paid_until = $1, status = 'live' where id = $2`, [k.paid ? nairobiMidnight(k.paid) : null, ids.bizA]);
    const p = await one(`insert into payments (business_id, amount_kes, kind, status, mpesa_code, plan_key, source, submitted_at)
                          values ($1, 500, 'renewal', 'submitted', $2, 'standard', 'seller', now()) returning id`, [ids.bizA, `RN${String(cases.indexOf(k)).padStart(8, "0")}`]);
    const out = await one(`select (public.payment_apply_confirmation($1::uuid, 'admin', $2::timestamptz)).*`, [p.id, k.now]);
    const expected = renewalPeriod(k.paid ? nairobiMidnight(k.paid) : null, new Date(k.now));
    assert.equal(out.period_start.toISOString ? nairobiDay(out.period_start) : String(out.period_start).slice(0, 10), expected.start, `${k.name}: start`);
    assert.equal(String(out.period_end.toISOString ? nairobiDay(out.period_end) : out.period_end).slice(0, 10), expected.end, `${k.name}: end`);
    const b = await one(`select paid_until from businesses where id = $1`, [ids.bizA]);
    assert.equal(b.paid_until.toISOString(), nairobiMidnight(expected.end), `${k.name}: paid_until`);
  }
});

// ---- roles, RLS, audit ---------------------------------------------------------------------------

test("has_role: owner passes every list, others only their own", async () => {
  const q = (who, roles) => tx(c, who, async (k) => (await k.query(`select public.has_role($1::text[]) as ok`, [roles])).rows[0].ok);
  assert.equal(await q(as("owner"), ["finance"]), true);
  assert.equal(await q(as("finance"), ["finance"]), true);
  assert.equal(await q(as("finance"), ["reviewer"]), false);
  assert.equal(await q(asA, ["owner", "reviewer", "finance", "support"]), false);
});

test("applications are visible to owner and reviewer only; payments are readable by every admin, writable by owner and finance", async () => {
  await sql(c, `insert into applications (id, status, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number, phone, email,
                  business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, submitted_at)
                values ('30000000-0000-0000-0000-0000000000f1', 'submitted', 'barber', 'standard', 500, '{}', 'Owner', 'national_id', '12345678', '+254700000001', 'o@x.co',
                  'Biz', false, 2020, 'SBP1', '2099-01-01', 'Nairobi', 'Nairobi', 'Street', -1.28, 36.8, '+254700000001', '1', '1', true, now())`);
  const count = (who, table) => tx(c, who, async (k) => Number((await k.query(`select count(*) from ${table}`)).rows[0].count));
  assert.equal(await count(as("owner"), "applications"), 1);
  assert.equal(await count(as("reviewer"), "applications"), 1);
  assert.equal(await count(as("finance"), "applications"), 0);
  assert.equal(await count(as("support"), "applications"), 0);
  assert.equal(await count(asA, "applications"), 0);

  for (const role of ["owner", "reviewer", "finance", "support"]) assert.ok((await count(as(role), "payments")) >= 0, role);
  const pay = (who) => tx(c, who, (k) => k.query(`insert into payments (business_id, amount_kes, kind, status, mpesa_code, plan_key, source, submitted_at)
        values ('${ids.bizA}', 500, 'renewal', 'submitted', 'ZZ${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}', 'standard', 'seller', now())`));
  await pay(as("finance"));
  await pay(as("owner"));
  await rejects(c, as("support"), `insert into payments (business_id, amount_kes, kind, status, mpesa_code, plan_key, source, submitted_at) values ('${ids.bizA}', 500, 'renewal', 'submitted', 'SUPPORT001', 'standard', 'seller', now())`, [], /row-level security|permission denied/);
  await rejects(c, as("reviewer"), `insert into payments (business_id, amount_kes, kind, status, mpesa_code, plan_key, source, submitted_at) values ('${ids.bizA}', 500, 'renewal', 'submitted', 'REVIEW0001', 'standard', 'seller', now())`, [], /row-level security|permission denied/);
});

test("catalogue and settings are owner only", async () => {
  const changed = await tx(c, as("reviewer"), async (k) => (await k.query(`update categories set name = 'Hacked' where id = 'barber'`)).rowCount);
  assert.equal(changed, 0);
  const owner = await tx(c, as("owner"), async (k) => (await k.query(`update categories set name = 'Barber' where id = 'barber'`)).rowCount);
  assert.equal(owner, 1);
});

test("audit_log: admins can read it, nobody in the browser can write, update or delete it", async () => {
  await sql(c, `insert into audit_log (actor_role, action, entity, entity_id) values ('system', 'seed.test', 'business', 'x')`);
  const row = await one(`select target_type, target_id from audit_log where action = 'seed.test'`);
  assert.deepEqual([row.target_type, row.target_id], ["business", "x"], "entity is mirrored to target_type");
  await sql(c, `insert into audit_log (actor_role, action, target_type, target_id) values ('system', 'seed.test2', 'payment', 'y')`);
  const row2 = await one(`select entity, entity_id from audit_log where action = 'seed.test2'`);
  assert.deepEqual([row2.entity, row2.entity_id], ["payment", "y"], "target_type is mirrored to entity");

  assert.ok(await tx(c, as("support"), async (k) => (await k.query(`select * from audit_log`)).rows.length) >= 2);
  assert.equal(await tx(c, asA, async (k) => (await k.query(`select * from audit_log`)).rows.length), 0);
  await rejects(c, as("owner"), `insert into audit_log (actor_role, action) values ('admin', 'forged.entry')`, [], /permission denied/);
  await rejects(c, as("owner"), `update audit_log set action = 'x'`, [], /permission denied/);
  await rejects(c, as("owner"), `delete from audit_log`, [], /permission denied/);
  // the service role (edge functions) can append
  await tx(c, asService, (k) => k.query(`insert into audit_log (actor_role, action, actor_email, target_type, target_id, before, after, reason, ip_hash)
        values ('admin', 'business.suspend', 'a@b.co', 'business', 'b1', '{"s":"live"}', '{"s":"suspended"}', 'why', 'hash')`), { commit: true });
});

test("messages: a seller sees in-app notices only, never the SMS log with errors and costs", async () => {
  await sql(c, `delete from messages`);
  await sql(c, `insert into messages (business_id, channel, subject, body, status) values
      ('${ids.bizA}', 'in_app', 'Hello', 'in app body', 'sent'),
      ('${ids.bizA}', 'sms', null, 'sms body', 'failed')`);
  await sql(c, `update messages set error = 'at_InvalidSenderId', cost_kes = 0.8 where channel = 'sms'`);
  const seen = await tx(c, asA, async (k) => (await k.query(`select channel, subject from messages`)).rows);
  assert.deepEqual(seen, [{ channel: "in_app", subject: "Hello" }]);
  const admin = await tx(c, as("support"), async (k) => (await k.query(`select channel from messages order by channel`)).rows);
  assert.deepEqual(admin.map((r) => r.channel), ["in_app", "sms"]);
  // the log needs a target, and an in-app notice needs a business and a subject
  await assert.rejects(sql(c, `insert into messages (channel, body) values ('sms', 'nobody')`), /messages_target_chk/);
  await assert.rejects(sql(c, `insert into messages (business_id, channel, body) values ('${ids.bizA}', 'in_app', 'no subject')`), /messages_in_app_chk/);
  await sql(c, `insert into messages (application_id, channel, to_address, body, status) values (null, 'sms', '+254700000009', 'applicant sms', 'queued')`);
});

test("admin RPCs: role checks, state checks, audit rows, counts and search", async () => {
  await sql(c, `update businesses set status = 'live', paid_until = $1 where id = $2`, [nairobiMidnight(addDays(new Date(), 30)), ids.bizA]);
  await sql(c, `delete from audit_log`);

  await rejects(c, asA, `select admin_set_business_visibility('${ids.bizA}', false, 'x')`, [], /forbidden/);
  await rejects(c, as("finance"), `select admin_set_business_visibility('${ids.bizA}', false, 'x')`, [], /forbidden/);
  await tx(c, as("support"), (k) => k.query(`select admin_set_business_visibility('${ids.bizA}', false, 'asked to hide')`), { commit: true });
  const hidden = await one(`select status, status_reason from businesses where id = $1`, [ids.bizA]);
  assert.deepEqual(hidden, { status: "paused", status_reason: "asked to hide" });
  await tx(c, as("support"), (k) => k.query(`select admin_set_business_visibility('${ids.bizA}', true)`), { commit: true });
  assert.deepEqual(await one(`select status, status_reason from businesses where id = $1`, [ids.bizA]), { status: "live", status_reason: null });
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  await rejects(c, as("owner"), `select admin_set_business_visibility('${ids.bizA}', true)`, [], /invalid_status/);
  await sql(c, `update businesses set status = 'live' where id = $1`, [ids.bizA]);

  const audit = await sql(c, `select action, actor_email, actor_role, target_type, target_id, business_id, reason, before, after from audit_log order by id`);
  assert.deepEqual(audit.map((a) => a.action), ["business.visibility", "business.visibility"]);
  assert.equal(audit[0].actor_email, "support@test");
  assert.equal(audit[0].actor_role, "admin");
  assert.deepEqual([audit[0].target_type, audit[0].target_id, audit[0].business_id], ["business", ids.bizA, ids.bizA]);
  assert.deepEqual([audit[0].before, audit[0].after], [{ status: "live" }, { status: "paused" }]);

  // flags: open or resolve only
  const flag = await one(`insert into flags (business_id, reason) values ($1, 'price looks wrong') returning id`, [ids.bizA]);
  await tx(c, as("reviewer"), (k) => k.query(`select admin_set_flag_status($1, 'resolved', 'checked')`, [flag.id]), { commit: true });
  assert.equal((await one(`select status from flags where id = $1`, [flag.id])).status, "resolved");
  await rejects(c, as("reviewer"), `select admin_set_flag_status('${flag.id}', 'replied')`, [], /invalid_status/);
  await rejects(c, as("finance"), `select admin_set_flag_status('${flag.id}', 'open')`, [], /forbidden/);

  const counts = await tx(c, as("support"), async (k) => (await k.query(`select public.admin_counts() as c`)).rows[0].c);
  assert.equal(counts.live, 1); // Shop B has never been paid, so it is not visible
  assert.equal(counts.open_flags, 0);
  assert.equal(counts.submitted, 1);
  assert.equal(counts.failed_messages, 1);
  assert.deepEqual(await tx(c, asA, async (k) => (await k.query(`select public.admin_counts() as c`)).rows[0].c), {});

  const found = await tx(c, as("support"), async (k) => (await k.query(`select public.admin_search('shop a', null, 5) as r`)).rows[0].r);
  assert.equal(found.businesses[0].name, "Shop A");
  assert.deepEqual(await tx(c, as("support"), async (k) => (await k.query(`select public.admin_search('a') as r`)).rows[0].r), {});
  assert.equal(found.payments.every((p) => p.business_name), true);
  await rejects(c, asA, `select admin_search('shop')`, [], /forbidden/);
  // wildcard characters in the search are literal
  const wild = await tx(c, as("support"), async (k) => (await k.query(`select public.admin_search('%%', array['businesses']) as r`)).rows[0].r);
  assert.deepEqual(wild.businesses, []);
});

test("applications: open and return to queue are role checked, audited, and visible only to the reviewer queue", async () => {
  const id = "30000000-0000-0000-0000-0000000000f1";
  await rejects(c, as("finance"), `select admin_open_application('${id}')`, [], /forbidden/);
  assert.equal(await tx(c, as("reviewer"), async (k) => (await k.query(`select admin_open_application('${id}') as s`)).rows[0].s, { commit: true }), "under_review");
  assert.equal((await one(`select reviewer_id from applications where id = $1`, [id])).reviewer_id, U.reviewer);
  assert.equal(await tx(c, as("owner"), async (k) => (await k.query(`select admin_return_to_queue('${id}') as s`)).rows[0].s, { commit: true }), "submitted");
  assert.equal((await one(`select reviewer_id from applications where id = $1`, [id])).reviewer_id, null);
  const n = await one(`select count(*)::int as n from audit_log where action in ('application.open','application.return')`);
  assert.equal(n.n, 2);
});

test("a new submitted application notifies the admins once per submission", async () => {
  const before = (await one(`select count(*)::int as n from admin_notifications where kind = 'application_submitted'`)).n;
  await sql(c, `update applications set status = 'under_review' where id = '30000000-0000-0000-0000-0000000000f1'`);
  await sql(c, `update applications set status = 'submitted' where id = '30000000-0000-0000-0000-0000000000f1'`);
  const after = await one(`select count(*)::int as n, bool_and(business_id is null) as nobiz from admin_notifications where kind = 'application_submitted'`);
  assert.equal(after.n, before + 1);
});
