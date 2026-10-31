import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const FINANCE = "00000000-0000-0000-0000-0000000000c4";
const APP = "20000000-0000-0000-0000-0000000000a1";
const asSupport = { sub: SUPPORT };
const asFinance = { sub: FINANCE };
const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0], { commit: true });
let toBusiness;
let toApplicant;
let fromSeller;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_message_log_detail" }));
  await seedFixtures(c);
  await sql(c, `
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into auth.users (id, email) values ('${SUPPORT}', 'support@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${SUPPORT}', 'support', 'support@test'), ('${FINANCE}', 'finance', 'finance@test');
    insert into public.applications (id, status, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number, phone, email,
      business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, submitted_at)
      values ('${APP}', 'submitted', 'barber', 'standard', 500, '{}', 'Wanjiku Kamau', 'national_id', '12345678', '+254700000001', 'o@x.co',
      'Kamau Cuts', false, 2020, 'SBP1', '2099-01-01', 'Nairobi', 'Nairobi', 'Street', -1.28, 36.8, '+254700000001', '1', '1', true, now());
  `);
  toBusiness = (await sql(c, `insert into public.messages (business_id, channel, sender, kind, subject, body, to_address, status, attempts, error, provider_id, cost_kes, batch_id, created_by, read_at)
    values ($1, 'sms', 'admin', 'general', 'Weekend offer', 'A long body that the table never shows', '+254700000000', 'failed', 3, 'provider_unavailable', 'prov-1', 0.8,
            'aaaaaaaa-0000-4000-8000-000000000001', $2, now()) returning id`, [ids.bizA, ids.admin]))[0].id;
  toApplicant = (await sql(c, `insert into public.messages (application_id, channel, sender, kind, subject, body, to_address, status, read_at)
    values ($1, 'email', 'system', 'general', 'Application received', 'Thanks for applying', 'o@x.co', 'sent', now()) returning id`, [APP]))[0].id;
  fromSeller = (await sql(c, `insert into public.messages (business_id, channel, sender, kind, subject, body, status)
    values ($1, 'in_app', 'seller', 'general', 'Re: Hello', 'Private reply', 'sent') returning id`, [ids.bizA]))[0].id;
});
after(async () => { await c.end(); });

test("the log shows the business an applicant applied with, and still lists business rows", async () => {
  const { rows } = (await call(asSupport, `select public.admin_message_log_query('all', 'all', null, 50, 0) as r`)).r;
  const applicant = rows.find((r) => r.id === toApplicant);
  assert.equal(applicant.application_name, "Kamau Cuts");
  assert.equal(applicant.business_name, null);
  assert.ok(rows.find((r) => r.id === toBusiness).business_name, "business rows keep their name");
  assert.equal(rows.some((r) => r.id === fromSeller), false);
});

test("the status filter accepts cancelled", async () => {
  await sql(c, `update public.messages set status = 'cancelled' where id = $1`, [toApplicant]);
  const out = (await call(asSupport, `select public.admin_message_log_query('all', 'cancelled', null, 50, 0) as r`)).r;
  assert.deepEqual(out.rows.map((r) => r.id), [toApplicant]);
  await rejects(asSupport, `select public.admin_message_log_query('all', 'nonsense', null, 50, 0)`, [], /invalid_status/);
  await sql(c, `update public.messages set status = 'sent' where id = $1`, [toApplicant]);
});

test("the detail returns the full body and the metadata", async () => {
  const d = (await call(asSupport, `select public.admin_message_detail($1) as r`, [toBusiness])).r;
  assert.equal(d.body, "A long body that the table never shows");
  assert.equal(d.status, "failed");
  assert.equal(d.attempts, 3);
  assert.equal(d.error, "provider_unavailable");
  assert.equal(d.provider_id, "prov-1");
  assert.equal(d.batch_id, "aaaaaaaa-0000-4000-8000-000000000001");
  assert.equal(d.created_by_email, "admin@test");
  assert.ok(d.seller_id);
});

test("an applicant's detail carries the application and the person's name", async () => {
  const d = (await call(asAdmin, `select public.admin_message_detail($1) as r`, [toApplicant])).r;
  assert.equal(d.application_name, "Kamau Cuts");
  assert.equal(d.applicant_name, "Wanjiku Kamau");
  assert.equal(d.business_id, null);
});

test("roles and errors: finance and sellers are refused, seller messages and unknown ids are not found", async () => {
  await rejects(asFinance, `select public.admin_message_detail($1)`, [toBusiness], /forbidden/);
  await rejects(asA, `select public.admin_message_detail($1)`, [toBusiness], /forbidden/);
  await rejects(asAdmin, `select public.admin_message_detail(null)`, [], /invalid_input/);
  await rejects(asAdmin, `select public.admin_message_detail($1)`, [fromSeller], /message_not_found/);
  await rejects(asAdmin, `select public.admin_message_detail($1)`, ["aaaaaaaa-0000-4000-8000-0000000000ff"], /message_not_found/);
});

test("the migration can be run again", async () => {
  await sql(c, readFileSync(new URL("../migrations/0070_message_log_detail.sql", import.meta.url), "utf8"));
  assert.equal((await call(asAdmin, `select public.admin_message_detail($1) as r`, [toBusiness])).r.status, "failed");
});
