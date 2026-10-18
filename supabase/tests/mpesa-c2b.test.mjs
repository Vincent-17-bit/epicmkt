import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, asAdmin, asA, asService } from "./db.mjs";

let c;
const APP = "30000000-0000-0000-0000-0000000000c1";
const APP2 = "30000000-0000-0000-0000-0000000000c2";

const app = (id, ref, name, status, price = 450) => `
  insert into applications (id, reference_no, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
    phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, status)
  values ('${id}', '${ref}', 'barber', 'standard', ${price}, '{}', 'Owner', 'national_id', '1', '+254712345678', 'o@x.co', '${name}', false, 2020, 'S1', '2030-01-01',
    'Kisumu', 'Kisumu', 'Main', 0, 0, '+254712345678', '1', '1', true, '${status}');`;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, app(APP, "EPM-2026-AAA111", "Mama Pima Salon", "approved") + app(APP2, "EPM-2026-BBB222", "Duka Moja", "approved", 300));
});
after(async () => { await c.end(); });

const record = (code, amount, account, extra = {}) =>
  tx(c, asService, async (k) => (await sql(k,
    `select public.mpesa_record_c2b($1, $2, $3, $4, $5, $6, now(), $7::jsonb) as r`,
    [code, amount, account, extra.msisdn ?? "2547****678", extra.name ?? "JOHN DOE", "247247", "{}"]))[0].r, { commit: true });

test("a payment whose account is the exact business name is recorded and moves the application to payment_confirming", async () => {
  const r = await record("SGH4K9L2QW", 450, "Mama Pima Salon");
  assert.equal(r.status, "matched");
  assert.equal(r.reference_no, "EPM-2026-AAA111");
  const [a] = await sql(c, `select status, payment_code from applications where id = '${APP}'`);
  assert.deepEqual(a, { status: "payment_confirming", payment_code: "SGH4K9L2QW" });
  const [t] = await sql(c, `select * from mpesa_transactions where trans_id = 'SGH4K9L2QW'`);
  assert.equal(t.match_status, "matched");
  assert.equal(Number(t.amount_kes), 450);
  assert.equal(t.application_id, APP);
  const ev = await sql(c, `select actor, data from application_events where application_id = '${APP}' and type = 'payment_submitted'`);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].data.auto, true);
  const n = await sql(c, `select data from admin_notifications where kind = 'payment_received'`);
  assert.equal(n.length, 1);
});

test("account matching ignores capitals and extra spaces", async () => {
  const r = await record("SGH4K9L2QX", 300, "  duka   MOJA ");
  assert.equal(r.status, "matched");
  assert.equal(r.business_name, "Duka Moja");
});

test("Safaricom retries are ignored: the same transaction code is stored once", async () => {
  const r = await record("SGH4K9L2QW", 450, "Mama Pima Salon");
  assert.equal(r.duplicate, true);
  const [{ n }] = await sql(c, `select count(*)::int as n from mpesa_transactions where trans_id = 'SGH4K9L2QW'`);
  assert.equal(n, 1);
});

test("a second payment for an application that already has one is kept as extra, not matched", async () => {
  const r = await record("SGH4K9L2QY", 450, "Mama Pima Salon");
  assert.equal(r.status, "extra");
  const [a] = await sql(c, `select payment_code from applications where id = '${APP}'`);
  assert.equal(a.payment_code, "SGH4K9L2QW");
});

test("an unknown account and a short payment are recorded but do not move any application", async () => {
  assert.equal((await record("SGH4K9L2Q1", 450, "Nobody Ltd")).status, "unmatched");
  assert.equal((await record("SGH4K9L2Q2", 450, "")).status, "unmatched");
  await sql(c, app("30000000-0000-0000-0000-0000000000c3", "EPM-2026-CCC333", "Short Pay Shop", "approved", 1000));
  assert.equal((await record("SGH4K9L2Q3", 500, "Short Pay Shop")).status, "amount_short");
  const [a] = await sql(c, `select status, payment_code from applications where reference_no = 'EPM-2026-CCC333'`);
  assert.deepEqual(a, { status: "approved", payment_code: null });
});

test("two businesses with the same name are never guessed: the payment stays unmatched", async () => {
  await sql(c, app("30000000-0000-0000-0000-0000000000c4", "EPM-2026-DDD444", "Twin Shop", "approved") + app("30000000-0000-0000-0000-0000000000c5", "EPM-2026-EEE555", "twin shop", "approved"));
  assert.equal((await record("SGH4K9L2Q4", 450, "Twin Shop")).status, "unmatched");
});

test("bad codes and amounts are refused", async () => {
  await assert.rejects(record("short", 450, "Mama Pima Salon"), /invalid_trans_id/);
  await assert.rejects(record("SGH4K9L2Q5", 0, "Mama Pima Salon"), /invalid_amount/);
});

test("only the service role can record; admins read the queue; sellers and anon see nothing", async () => {
  await rejects(c, asA, `select public.mpesa_record_c2b('SGH4K9L2Q6', 10, 'x', null, null, null, now(), '{}')`, [], /permission denied/);
  await rejects(c, asAdmin, `select public.mpesa_record_c2b('SGH4K9L2Q6', 10, 'x', null, null, null, now(), '{}')`, [], /permission denied/);
  const adminRows = await tx(c, asAdmin, (k) => sql(k, `select status, business_name, account, amount_kes, expected_kes, mpesa_code from admin_payment_queue order by mpesa_code`));
  const first = adminRows.find((r) => r.mpesa_code === "SGH4K9L2QW");
  assert.equal(first.status, "awaiting_confirmation");
  assert.equal(first.business_name, "Mama Pima Salon");
  assert.equal(Number(first.expected_kes), 450);
  assert.equal(adminRows.find((r) => r.mpesa_code === "SGH4K9L2Q1").business_name, "No matching business");
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from admin_payment_queue`))).length, 0);
});

test("once an admin confirms or rejects the payment, the queue shows the outcome", async () => {
  await sql(c, `insert into payments (application_id, amount_kes, mpesa_code, status, kind, source) values ('${APP}', 450, 'SGH4K9L2QW', 'rejected', 'first', 'admin')`);
  const rows = await tx(c, asAdmin, (k) => sql(k, `select status, mpesa_code from admin_payment_queue where mpesa_code = 'SGH4K9L2QW'`));
  assert.deepEqual(rows, [{ status: "rejected", mpesa_code: "SGH4K9L2QW" }]);
});
