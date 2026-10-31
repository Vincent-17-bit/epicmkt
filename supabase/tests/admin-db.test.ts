import nodeAssert from "node:assert/strict";
import { adminDecideApplication } from "../functions/admin-decide-application/handler.ts";
import { adminConfirmPayment } from "../functions/admin-confirm-payment/handler.ts";
import { adminResetSellerPassword } from "../functions/admin-reset-seller-password/handler.ts";
import { createAdminDb, pgDeps } from "./pg-world.ts";
import { post, read } from "./admin-world.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const ADMINS = {
  owner: "00000000-0000-4000-8000-0000000000a1",
  reviewer: "00000000-0000-4000-8000-0000000000a2",
  finance: "00000000-0000-4000-8000-0000000000a3",
};
const APP = "11111111-1111-4111-8111-111111111111";
const APP_B = "22222222-2222-4222-8222-222222222222";
const tokens = Object.fromEntries(Object.entries(ADMINS).map(([role, id]) => [`tok-${role}`, { id, email: `${role}@epicmkt.test` }]));

const client = await createAdminDb();
const w = pgDeps(client, tokens);
const confirm = adminConfirmPayment(w.deps);
const decide = adminDecideApplication(w.deps);
const reset = adminResetSellerPassword(w.deps);
const q = async (sql: string, params: unknown[] = []): Promise<any[]> => (await client.query(sql, params)).rows;

async function seed() {
  await client.query(`truncate public.payments, public.messages, public.businesses, public.applications, public.audit_log, public.rate_limits, public.admins, public.categories cascade`);
  await client.query(`truncate auth.users cascade`);
  await client.query(`alter sequence public.receipt_seq restart with 1`);
  w.sms.length = 0;
  w.mail.length = 0;
  w.authMeta.clear();
  for (const [role, id] of Object.entries(ADMINS)) {
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${role}@epicmkt.test`]);
    await client.query(`insert into public.admins (user_id, role) values ($1, $2)`, [id, role]);
  }
  await client.query(`insert into public.categories (id, name, grp, tier, sort) values ('salon', 'Salon', 'Beauty', 'A', 1)`);
  await client.query(`insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ('salon', 'standard', 500, 3, '["a","b","c"]')`);
  for (const [id, status, code] of [[APP, "under_review", null], [APP_B, "payment_confirming", "QWE1234567"]]) {
    await client.query(
      `insert into public.applications (id, status, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
         phone, email, business_name, registered, year_established, kra_pin, reg_number, sbp_number, sbp_expiry, county, town, address, lat, lng, business_phones,
         whatsapp, terms_version, privacy_version, authorised, payment_code, short_description)
       values ($1, $2, 'salon', 'standard', 500, '{}', 'Wanjiru Kamau', 'national_id', '29384756', '+254712345678', 'wanjiru@example.com', 'Mama Pima', true, 2019,
         'A001234567Z', 'REG-99120', 'SBP-77881', '2027-01-01', 'Kisumu', 'Kisumu', 'Oginga Odinga St', -0.09, 34.76, '["+254722000111"]',
         '+254712345678', 'v1', 'v1', true, $3, 'Salon and spa')`,
      [id, status, code],
    );
  }
  await client.query(`insert into public.application_documents (application_id, slot_key, storage_path, original_name, mime, size_bytes) values ($1, 'sbp', 'apps/x/sbp.pdf', 'sbp.pdf', 'application/pdf', 10)`, [APP_B]);
}

const pay = (over: Record<string, unknown> = {}) => ({ applicationId: APP_B, mpesaCode: "QWE1234567", amount: 500, months: 1, action: "confirm", ...over });
const as = (token: string, body: unknown) => post(body, token);

Deno.test("real schema: first payment activates a business with every insert accepted", async () => {
  await seed();
  const r = await read(await confirm(as("tok-finance", pay())));
  assertEquals(r.status, 200);
  assertEquals(r.body.kind, "activation");
  assertEquals(r.body.receiptNo, "RCT-000001");

  const [biz] = await q(`select *, public.nairobi_day(paid_until)::text as paid_day from public.businesses`);
  assertEquals([biz.seller_id, biz.slug, biz.status, biz.paid_day, biz.must_change_password, biz.monthly_price], [r.body.sellerId, "mama-pima", "live", "2026-11-14", true, 500]);
  assertEquals(biz.owner_name, "Wanjiru Kamau");
  assert(biz.first_paid_at && biz.user_id && biz.application_id === APP_B);
  assertEquals(biz.pin, null);
  assertEquals(biz.licence, null);
  const blob = JSON.stringify(biz);
  for (const secret of ["29384756", "A001234567Z", "SBP-77881", "REG-99120", "apps/x/sbp.pdf"]) assert(!blob.includes(secret), `business must not carry ${secret}`);
  assertEquals(w.authMeta.get(biz.user_id)?.user_metadata?.must_change_password, true);
  assertEquals(w.authMeta.get(biz.user_id)?.email, `${r.body.sellerId.toLowerCase()}@sellers.epicmkt.app`);

  const [p] = await q(`select * from public.payments`);
  assertEquals([p.status, p.kind, p.source, p.confirmed_via, p.receipt_no, p.amount_kes, p.months, p.business_id, p.application_id], ["confirmed", "first", "admin", "admin", "RCT-000001", 500, 1, biz.id, APP_B]);
  assertEquals(p.confirmed_by, ADMINS.finance);
  assert(p.confirmed_at);

  const [app] = await q(`select status, seller_id from public.applications where id = $1`, [APP_B]);
  assertEquals([app.status, app.seller_id], ["activated", r.body.sellerId]);

  const msgs = await q(`select channel, status, kind, template_key, business_id, application_id, to_address, dedupe_key from public.messages order by channel, template_key`);
  assertEquals(msgs.map((m) => [m.channel, m.status, m.template_key, m.to_address]), [
    ["email", "sent", "login_details", "wanjiru@example.com"], ["email", "queued", "welcome", "wanjiru@example.com"], ["sms", "sent", "login_details", "+254712345678"],
  ]);
  assert(msgs.filter((m) => m.template_key === "welcome").every((m) => m.business_id === biz.id && m.application_id === APP_B && m.dedupe_key.startsWith("welcome:")));

  const audit = await q(`select action, actor_role, actor_id, actor_email, target_type, target_id, business_id, after from public.audit_log order by id`);
  assertEquals(audit.map((a) => a.action), ["payment.confirm", "business.activate"]);
  assert(audit.every((a) => a.actor_role === "admin" && a.actor_id === ADMINS.finance && a.business_id === biz.id && a.actor_email === "finance@epicmkt.test"));
  assertEquals(audit.map((a) => a.target_type), ["payment", "business"]);

  const [{ events }] = await q(`select count(*)::int as events from public.application_events where application_id = $1 and type = 'activated'`, [APP_B]);
  assertEquals(events, 1);
  assertEquals(w.sms.length, 1);
  assert(w.sms[0].message.includes(r.body.temporaryPassword));
  assert(!JSON.stringify(await q(`select * from public.businesses`)).includes(r.body.temporaryPassword));
  assert(!JSON.stringify(await q(`select * from public.messages`)).includes(r.body.temporaryPassword));
  assert(!JSON.stringify(await q(`select * from public.audit_log`)).includes(r.body.temporaryPassword));
});

const asBrowser = async (sql: string) => {
  await client.query(`begin`);
  try {
    await client.query(`set local role authenticated`);
    await client.query(sql);
  } finally {
    await client.query(`rollback`);
  }
};

Deno.test("real schema: audit_log is append-only for browser roles but a business can still be deleted", async () => {
  const [{ id }] = await q(`select id from public.businesses`);
  await nodeAssert.rejects(asBrowser(`update public.audit_log set reason = 'tamper'`), /permission denied/);
  await nodeAssert.rejects(asBrowser(`delete from public.audit_log`), /permission denied/);
  await nodeAssert.rejects(asBrowser(`insert into public.audit_log (actor_role, action) values ('admin', 'forged')`), /permission denied/);
  const before = (await q(`select count(*)::int as n from public.audit_log`))[0].n;
  await client.query(`delete from public.businesses where id = $1`, [id]);
  const after = await q(`select count(*)::int as n, count(business_id)::int as linked from public.audit_log`);
  assertEquals([after[0].n, after[0].linked], [before, 0]);
});

Deno.test("real schema: renewal adds a month to the old paid_until and queues three messages once", async () => {
  await seed();
  const first = await read(await confirm(as("tok-finance", pay())));
  const [biz] = await q(`select id, user_id from public.businesses`);
  await client.query(`update public.businesses set paid_until = public.nairobi_midnight('2026-11-20'::date)`);
  const body = { businessId: biz.id, mpesaCode: "ABC1234567", amount: 500, months: 1, action: "confirm" };
  const r = await read(await confirm(as("tok-owner", body)));
  assertEquals(r.status, 200);
  assertEquals([r.body.kind, r.body.paidUntil, r.body.receiptNo], ["renewal", "2026-12-20", "RCT-000002"]);
  const [after] = await q(`select public.nairobi_day(paid_until)::text as d from public.businesses`);
  assertEquals(after.d, "2026-12-20");
  const [p] = await q(`select * from public.payments where kind = 'renewal'`);
  assertEquals([p.status, p.period_end.toISOString().slice(0, 10) > "2026-01-01", p.source], ["confirmed", true, "admin"]);

  const msgs = await q(`select channel, status, read_at is not null as stamped, dedupe_key, to_address from public.messages where kind = 'payment' order by channel`);
  assertEquals(msgs.map((m) => [m.channel, m.status, m.stamped]), [["email", "queued", true], ["in_app", "delivered", false], ["sms", "queued", true]]);
  assertEquals(new Set(msgs.map((m) => m.dedupe_key)).size, 3);

  await client.query(`begin`);
  await client.query(`set local role authenticated`);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [biz.user_id]);
  const seen = ((await client.query(`select channel from public.messages order by channel`)).rows as any[]).map((m) => m.channel);
  const unread = (await client.query(`select count(*)::int as n from public.messages where read_at is null`)).rows[0].n;
  await client.query(`rollback`);
  assertEquals(seen, ["in_app"]);
  assertEquals(unread, 1);
  assert(first.body.ok);
});

Deno.test("real schema: the unique M-Pesa index turns a duplicate into a clean conflict and rolls back", async () => {
  await seed();
  assertEquals((await read(await confirm(as("tok-finance", pay())))).status, 200);
  await client.query(`update public.applications set status = 'payment_confirming' where id = $1`, [APP]);
  const dup = await read(await confirm(as("tok-finance", pay({ applicationId: APP, acknowledgeWarnings: true }))));
  assertEquals(dup.status, 409);
  assertEquals(dup.body.error, "duplicate_mpesa_code");
  assertEquals((await q(`select count(*)::int as n from public.businesses`))[0].n, 1);
  assertEquals((await q(`select count(*)::int as n from public.payments`))[0].n, 1);
  assertEquals((await q(`select count(*)::int as n from auth.users where email like 'es%@sellers.epicmkt.app'`))[0].n, 1);
  assertEquals((await q(`select status from public.applications where id = $1`, [APP]))[0].status, "payment_confirming");
});

Deno.test("real schema: a rejected first payment is stored without a business", async () => {
  await seed();
  const r = await read(await confirm(as("tok-finance", pay({ action: "reject", reason: "Code not in statement" }))));
  assertEquals(r.status, 200);
  const [p] = await q(`select * from public.payments`);
  assertEquals([p.status, p.business_id, p.application_id, p.decline_reason, p.kind], ["rejected", null, APP_B, "Code not in statement", "first"]);
  assertEquals((await q(`select status, payment_code from public.applications where id = $1`, [APP_B]))[0], { status: "approved", payment_code: null });
  assertEquals((await read(await confirm(as("tok-finance", pay())))).status, 200);
});

Deno.test("real schema: decide-application queues messages for an application with no business", async () => {
  await seed();
  await client.query(`update public.site_settings set value = '{"type":"till","number":"123456","name":"EpicMKT"}' where key = 'mpesa'`);
  const noFlag = await read(await decide(as("tok-reviewer", { applicationId: APP, action: "request_changes", channels: { sms: true } })));
  assertEquals([noFlag.status, noFlag.body.error], [400, "flag_or_note_required"]);
  assertEquals((await q(`select count(*)::int as n from public.messages`))[0].n, 0);
  const r = await read(await decide(as("tok-reviewer", { applicationId: APP, action: "approve", channels: { sms: true, email: true, inApp: true } })));
  assertEquals(r.status, 200);
  const msgs = await q(`select channel, kind, status, business_id, application_id, to_address from public.messages order by channel`);
  assertEquals(msgs.map((m) => [m.channel, m.kind, m.status, m.business_id, m.application_id]), [
    ["email", "approval", "queued", null, APP], ["sms", "approval", "queued", null, APP],
  ]);
  assertEquals((await q(`select status from public.applications where id = $1`, [APP]))[0].status, "approved");
  const audit = await q(`select action, actor_role, target_type, target_id, business_id from public.audit_log`);
  assertEquals(audit, [{ action: "application.approve", actor_role: "admin", target_type: "application", target_id: APP, business_id: null }]);

  const guard = await read(await decide(as("tok-reviewer", { applicationId: APP_B, action: "request_changes", note: "x" })));
  assertEquals([guard.status, guard.body.error], [409, "invalid_status"]);
});

Deno.test("real schema: reset password flags the business and audits it", async () => {
  await seed();
  await confirm(as("tok-finance", pay()));
  const [biz] = await q(`select id, user_id from public.businesses`);
  await client.query(`update public.businesses set must_change_password = false`);
  const r = await read(await reset(as("tok-owner", { businessId: biz.id, reason: "Lost phone" })));
  assertEquals(r.status, 200);
  assertEquals((await q(`select must_change_password from public.businesses`))[0].must_change_password, true);
  assertEquals((await q(`select action, business_id, reason from public.audit_log where action = 'business.password_reset'`))[0], { action: "business.password_reset", business_id: biz.id, reason: "Lost phone" });
  assertEquals(w.authMeta.get(biz.user_id)?.user_metadata?.must_change_password, true);
});

Deno.test("real schema: rate limit counts in hit_rate_limit", async () => {
  await seed();
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await reset(as("tok-owner", { businessId: "44444444-4444-4444-8444-444444444444", reason: "none here" }))).status;
  assertEquals(last, 429);
});

const ingest = async (account: string, amount: number, id: string) =>
  (await q(`select public.mpesa_ingest('confirmation', $1::jsonb, null) as r`, [JSON.stringify({
    TransID: id, TransTime: "20261014093000", TransAmount: String(amount), BusinessShortCode: "247247", BillRefNumber: account, MSISDN: "254712345678", FirstName: "Wanjiru",
  })]))[0].r;

Deno.test("real schema: the client pays 1,600 for a 500 plan; one Confirm activates 3 months and keeps the 100 as credit", async () => {
  await seed();
  await client.query(`update public.applications set status = 'approved', payment_code = null where id = $1`, [APP_B]);
  const [{ reference_no }] = await q(`select reference_no from public.applications where id = $1`, [APP_B]);

  const got = await ingest(reference_no, 1600, "SGH4K9L2QW");
  assertEquals(got.outcome, "ready");
  const [{ payment_code }] = await q(`select payment_code from public.applications where id = $1`, [APP_B]);
  assertEquals(payment_code, "SGH4K9L2QW");

  const r = await read(await confirm(as("tok-finance", pay({ mpesaCode: payment_code, amount: 1500, months: 3 }))));
  assertEquals(r.status, 200);
  assertEquals(r.body.kind, "activation");
  const [biz] = await q(`select credit_kes::int as credit, public.nairobi_day(paid_until)::text as paid_day from public.businesses`);
  assertEquals(biz.credit, 100);
  assertEquals(biz.paid_day, "2027-01-14");
  const [app] = await q(`select credit_kes::int as credit from public.applications where id = $1`, [APP_B]);
  assertEquals(app.credit, 0);
  const [tx] = await q(`select state, target_type, payment_id is not null as linked from public.mpesa_transactions where trans_id = 'SGH4K9L2QW'`);
  assertEquals(tx, { state: "applied", target_type: "business", linked: true });
});

Deno.test("real schema: rejecting a payment takes its money back and re-opens the application", async () => {
  await seed();
  await client.query(`update public.applications set status = 'approved', payment_code = null where id = $1`, [APP_B]);
  const [{ reference_no }] = await q(`select reference_no from public.applications where id = $1`, [APP_B]);
  await ingest(reference_no, 500, "SGH4K9L2QX");
  const r = await read(await confirm(as("tok-finance", pay({ mpesaCode: "SGH4K9L2QX", action: "reject", reason: "Not in the statement" }))));
  assertEquals(r.status, 200);
  const [app] = await q(`select status, payment_code, credit_kes::int as credit from public.applications where id = $1`, [APP_B]);
  assertEquals(app, { status: "approved", payment_code: null, credit: 0 });
  const [tx] = await q(`select state, note from public.mpesa_transactions where trans_id = 'SGH4K9L2QX'`);
  assertEquals(tx, { state: "ignored", note: "Not in the statement" });
});

Deno.test("close", async () => {
  await client.end();
});
