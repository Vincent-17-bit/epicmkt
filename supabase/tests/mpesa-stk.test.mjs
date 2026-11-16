// STK Push (the "Pay now" phone prompt) and the one-price rule (migration 0128).
// Every path that moves money is covered: the amount is worked out by the database, a success is credited once whichever of the
// STK callback and the Paybill confirmation arrives first, failures never credit, and odd callbacks are held for an admin.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService } from "./db.mjs";

let c;
const U = { owner: ids.admin, finance: "00000000-0000-0000-0000-0000000000c2", support: "00000000-0000-0000-0000-0000000000c3" };
const as = (role) => ({ sub: U[role] });
const sha = (phone) => createHash("sha256").update(phone).digest("hex");
const uid = (n) => `40000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const bid = (n) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const day = (offset) => `(public.nairobi_day(now()) + ${offset})`;
const row = async (text, params) => (await sql(c, text, params))[0];
const svc = async (text, params) => tx(c, asService, async (k) => (await sql(k, text, params))[0].r, { commit: true });

const app = (n, ref, { status = "approved", price = 500, phone = "+254712345678", credit = 0 } = {}) => sql(c, `
  insert into applications (id, reference_no, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
    phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version,
    authorised, status, credit_kes)
  values ('${uid(n)}', '${ref}', 'barber', 'standard', ${price}, '{}', 'Owner', 'national_id', '1', '${phone}', 'o@x.co', 'Stk Shop ${n}', false, 2020, 'S1', '2030-01-01',
    'Kisumu', 'Kisumu', 'Main', 0, 0, '${phone}', '1', '1', true, '${status}', ${credit})`);
const biz = (n, seller, { plan = "standard", paidOffset = 10, credit = 0, status = "live", phone = "+254733000100" } = {}) => sql(c, `
  insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, paid_until, credit_kes)
  values ('${bid(n)}', '${seller}', null, 'stk-shop-${n}', 'Stk Biz ${n}', 'barber', '${plan}', '${status}', '${phone}',
    ${paidOffset === null ? "null" : `public.nairobi_midnight(${day(paidOffset)})`}, ${credit})`);

const prepare = (type, id, { purpose = null, plan = null, category = null, change = null, months = 1, phone = "0712345678", by = "seller" } = {}) =>
  svc(`select public.mpesa_stk_prepare($1, $2, $3, $4, $5, $6, $7, $8, $9) as r`, [type, id, purpose, plan, category, change, months, phone, by]);
let seq = 0;
const send = async (requestId) => {
  const checkout = `ws_CO_${Date.now()}_${++seq}`;
  await svc(`select public.mpesa_stk_mark_sent($1, $2, $3, 'Success. Request accepted for processing') as r`, [requestId, `m-${seq}`, checkout]);
  return checkout;
};
let rc = 0;
const receipt = () => `SK${String(++rc).padStart(8, "0")}`;
const okBody = (checkout, amount, rcpt, phone = 254712345678) => ({
  Body: { stkCallback: { MerchantRequestID: "m", CheckoutRequestID: checkout, ResultCode: 0, ResultDesc: "The service request is processed successfully.",
    CallbackMetadata: { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: rcpt }, { Name: "Balance" },
      { Name: "TransactionDate", Value: 20261116093012 }, { Name: "PhoneNumber", Value: phone }] } } },
});
const failBody = (checkout, code, desc = "Request cancelled by user") => ({ Body: { stkCallback: { MerchantRequestID: "m", CheckoutRequestID: checkout, ResultCode: code, ResultDesc: desc } } });
const callback = (body, verification = "query_ok") => svc(`select public.mpesa_stk_ingest($1::jsonb, '196.201.214.200', $2) as r`, [JSON.stringify(body), verification]);
const c2b = (account, amount, transId, msisdn = sha("254712345678")) => svc(`select public.mpesa_ingest('confirmation', $1::jsonb, '1.2.3.4') as r`, [JSON.stringify({
  TransactionType: "Pay Bill", TransID: transId, TransTime: "20261116093015", TransAmount: String(amount), BusinessShortCode: "247247",
  BillRefNumber: account, MSISDN: msisdn, FirstName: "JANE" })]);
const request = (id) => row(`select * from mpesa_stk_requests where id = $1`, [id]);
const paidUntil = async (n) => (await row(`select to_char(public.nairobi_day(paid_until), 'YYYY-MM-DD') as d from businesses where id = '${bid(n)}'`)).d;
const plusMonths = async (offset, months) => (await row(`select to_char((${day(offset)} + interval '${months} months')::date, 'YYYY-MM-DD') as d`)).d;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_stk_test" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${U.finance}', 'finance@test'), ('${U.support}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${U.finance}', 'finance', 'finance@test'), ('${U.support}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into public.site_settings (key, value) values ('mpesa', '{"type":"paybill","number":"247247","name":"EpicMKT","stk":true}')
      on conflict (key) do update set value = excluded.value;
  `);
});
after(async () => { await c?.end(); });

// ================================================================ one price
test("a plan price change reaches live sellers: monthly_price follows, and each seller is told", async () => {
  await biz(1, "ES300001");
  assert.equal((await row(`select monthly_price from businesses where id = '${bid(1)}'`)).monthly_price, 500);
  await sql(c, `update plans set price_kes = 400 where category_id = 'barber' and plan_key = 'standard'`);
  assert.equal((await row(`select monthly_price from businesses where id = '${bid(1)}'`)).monthly_price, 400);
  const note = await row(`select subject, body from messages where business_id = '${bid(1)}' and channel = 'in_app' and subject = 'Your monthly price has changed'`);
  assert.match(note.body, /KES 400 per month/);
  assert.match(note.body, /next payment/);
});

test("the original bug: a seller who pays exactly the new (lower) price gets a whole month, not 'KES 100 more is needed'", async () => {
  const r = await c2b("ES300001", 400, "LOWER00001");
  assert.equal(r.outcome, "applied");
  assert.equal(r.months, 1);
  assert.equal(await paidUntil(1), await plusMonths(10, 1));
  assert.equal((await row(`select credit_kes::int as c from businesses where id = '${bid(1)}'`)).c, 0);
  await sql(c, `update plans set price_kes = 500 where category_id = 'barber' and plan_key = 'standard'`);
});

test("the quote, the crediting and the admin list all use the same price", async () => {
  await sql(c, `update plans set price_kes = 650 where category_id = 'barber' and plan_key = 'standard'`);
  const q = await row(`select public.payment_quote(b, 'renewal', null, null) as q from businesses b where id = '${bid(1)}'`);
  assert.equal(q.q.amount_kes, 650);
  assert.equal(q.q.unit_price_kes, 650);
  const r = await c2b("ES300001", 1300, "RAISED0001");
  assert.equal(r.months, 2);
  const listed = await tx(c, as("owner"), async (k) => (await sql(k, `select expected_kes from admin_payment_queue where mpesa_code = 'RAISED0001'`))[0]);
  assert.equal(listed.expected_kes, 650);
  await sql(c, `update plans set price_kes = 500 where category_id = 'barber' and plan_key = 'standard'`);
});

test("an upgrade moves the seller to the Premium price: the next renewal costs (and credits) the Premium month", async () => {
  await biz(2, "ES300002", { paidOffset: 20 });
  await sql(c, `update businesses set pay_intent = jsonb_build_object('purpose', 'upgrade', 'target_plan', 'premium', 'set_at', now()) where id = '${bid(2)}'`);
  const due = (await row(`select public.payment_quote(b, 'upgrade', 'premium', null) as q from businesses b where id = '${bid(2)}'`)).q.amount_kes;
  assert.equal((await c2b("ES300002", due, "UPGRADE001")).outcome, "applied");
  const b = await row(`select plan_key, monthly_price from businesses where id = '${bid(2)}'`);
  assert.deepEqual(b, { plan_key: "premium", monthly_price: 1500 });
  // Before 0128 this KES 1,500 bought three Standard months.
  const r = await c2b("ES300002", 1500, "PREMRENEW1");
  assert.equal(r.months, 1);
});

// ================================================================ STK: preparing a request
test("an applicant's request: the database works out the amount, the short account and the phone", async () => {
  await app(1, "EPM-2026-STK111");
  const r = await prepare("application", uid(1), { phone: "+254 712 345 678", by: "applicant" });
  assert.equal(r.reused, false);
  assert.equal(r.request.amount, 500);
  assert.equal(r.request.account, "2026STK111");
  assert.equal(r.request.phone, "254712345678");
  assert.equal(r.request.status, "creating");
  assert.equal(r.request.purpose, "first");
  const db = await request(r.request.id);
  assert.equal(db.description, "Listing fee");
  assert.equal(db.initiated_by, "applicant");
});

test("phones: 07.., 01.., +254.., 254.. and 7.. are accepted; anything else is refused before Safaricom is called", async () => {
  for (const [given, want] of [["0712345678", "254712345678"], ["0110345678", "254110345678"], ["+254712345678", "254712345678"],
    ["254712345678", "254712345678"], ["712345678", "254712345678"], ["0712-345-678", "254712345678"]]) {
    assert.equal((await row(`select public.mpesa_stk_phone($1) as p`, [given])).p, want, given);
  }
  for (const bad of ["0812345678", "071234567", "+255712345678", "", "hello"]) {
    assert.equal((await row(`select public.mpesa_stk_phone($1) as p`, [bad])).p, null, bad);
  }
  await app(2, "EPM-2026-STK222");
  await rejects(c, asService, `select public.mpesa_stk_prepare('application', '${uid(2)}', null, null, null, null, 1, '0812345678', 'applicant')`, [], /invalid_phone/);
});

test("pressing Pay twice does not send two prompts: the open request is returned", async () => {
  const first = await prepare("application", uid(2), { by: "applicant" });
  await send(first.request.id);
  const again = await prepare("application", uid(2), { by: "applicant" });
  assert.equal(again.reused, true);
  assert.equal(again.request.id, first.request.id);
  assert.equal((await row(`select count(*)::int as n from mpesa_stk_requests where application_id = '${uid(2)}'`)).n, 1);
});

test("an old open prompt is replaced by a new one (it is marked expired, never deleted)", async () => {
  const old = await row(`select id from mpesa_stk_requests where application_id = '${uid(2)}'`);
  await sql(c, `update mpesa_stk_requests set sent_at = now() - interval '5 minutes' where id = '${old.id}'`);
  const fresh = await prepare("application", uid(2), { by: "applicant" });
  assert.equal(fresh.reused, false);
  assert.notEqual(fresh.request.id, old.id);
  assert.equal((await request(old.id)).status, "expired");
});

test("only an approved application can be asked to pay; a paid one is refused", async () => {
  await app(3, "EPM-2026-STK333", { status: "under_review" });
  await rejects(c, asService, `select public.mpesa_stk_prepare('application', '${uid(3)}', null, null, null, null, 1, '0712345678', 'applicant')`, [], /not_payable/);
  await app(4, "EPM-2026-STK444", { status: "payment_confirming", credit: 500 });
  await rejects(c, asService, `select public.mpesa_stk_prepare('application', '${uid(4)}', null, null, null, null, 1, '0712345678', 'applicant')`, [], /already_paid/);
});

test("a part payment already received is taken off the prompt amount", async () => {
  await app(5, "EPM-2026-STK555", { credit: 300 });
  const r = await prepare("application", uid(5), { by: "applicant" });
  assert.equal(r.request.amount, 200);
  assert.equal(Number(r.request.creditUsed), 300);
});

test("several months for a first payment: price x months, capped at the prepay limit", async () => {
  await app(12, "EPM-2026-STKCCC");
  const r = await prepare("application", uid(12), { by: "applicant", months: 3 });
  assert.deepEqual([r.request.months, r.request.amount], [3, 1500]);
  await rejects(c, asService, `select public.mpesa_stk_prepare('application', '${uid(12)}', null, null, null, null, 30, '0712345678', 'applicant')`, [], /invalid_months/);
});

// ================================================================ STK: callbacks
test("a successful prompt: credited once, the application is ready for activation, the request shows the receipt", async () => {
  await app(6, "EPM-2026-STK666");
  const r = await prepare("application", uid(6), { by: "applicant" });
  const checkout = await send(r.request.id);
  assert.equal((await request(r.request.id)).status, "pending");
  const rc1 = receipt();
  const out = await callback(okBody(checkout, 500, rc1));
  assert.equal(out.outcome, "ready");
  assert.equal(out.application_id, uid(6));
  const a = await row(`select status, credit_kes::int as credit, payment_code from applications where id = '${uid(6)}'`);
  assert.deepEqual(a, { status: "payment_confirming", credit: 500, payment_code: rc1 });
  const t = await row(`select channel, state, match_method, stk_request_id from mpesa_transactions where trans_id = '${rc1}'`);
  assert.deepEqual(t, { channel: "stk", state: "credited", match_method: "stk", stk_request_id: r.request.id });
  const q = await request(r.request.id);
  assert.equal(q.status, "paid");
  assert.equal(q.mpesa_receipt, rc1);
  assert.equal(q.verification, "query_ok");
  assert.equal((await row(`select processed from mpesa_callbacks where id = $1`, [out.callback_id])).processed, true);
});

test("Safaricom sends the same callback again: nothing is credited twice", async () => {
  const r = await row(`select checkout_request_id, mpesa_receipt from mpesa_stk_requests where application_id = '${uid(6)}'`);
  const again = await callback(okBody(r.checkout_request_id, 500, r.mpesa_receipt));
  assert.equal(again.duplicate, true);
  assert.equal((await row(`select credit_kes::int as c from applications where id = '${uid(6)}'`)).c, 500);
  assert.equal((await row(`select count(*)::int as n from mpesa_transactions where trans_id = '${r.mpesa_receipt}'`)).n, 1);
});

test("the Paybill confirmation of a prompt payment (same receipt) arriving afterwards is ignored", async () => {
  const r = await row(`select mpesa_receipt from mpesa_stk_requests where application_id = '${uid(6)}'`);
  const out = await c2b("2026STK666", 500, r.mpesa_receipt);
  assert.equal(out.duplicate, true);
  assert.equal((await row(`select credit_kes::int as c from applications where id = '${uid(6)}'`)).c, 500);
});

test("the Paybill confirmation arriving FIRST is matched to the prompt (account, amount, phone) and the late STK callback is a duplicate", async () => {
  await biz(3, "ES300003", { paidOffset: 5, phone: "+254711000003" });
  const r = await prepare("business", bid(3), { phone: "0711000003" });
  const checkout = await send(r.request.id);
  const rc1 = receipt();
  const first = await c2b("ES300003", 500, rc1, sha("254711000003"));
  assert.equal(first.outcome, "applied");
  const q = await request(r.request.id);
  assert.equal(q.status, "paid");
  assert.equal(q.verification, "c2b");
  assert.equal(await paidUntil(3), await plusMonths(5, 1));
  const late = await callback(okBody(checkout, 500, rc1, 254711000003));
  assert.equal(late.duplicate, true);
  assert.equal(await paidUntil(3), await plusMonths(5, 1));
  assert.equal((await row(`select count(*)::int as n from payments where business_id = '${bid(3)}' and kind = 'renewal'`)).n, 1);
});

test("a cancelled prompt (1032) fails with a clear message; nothing is recorded as money", async () => {
  await app(7, "EPM-2026-STK777");
  const r = await prepare("application", uid(7), { by: "applicant" });
  const checkout = await send(r.request.id);
  const out = await callback(failBody(checkout, 1032), null);
  assert.equal(out.outcome, "failed");
  const q = await request(r.request.id);
  assert.equal(q.status, "failed");
  assert.equal(q.result_code, "1032");
  const view = await row(`select public.mpesa_stk_view(s) as v from mpesa_stk_requests s where id = '${r.request.id}'`);
  assert.match(view.v.message, /cancelled/);
  assert.equal(view.v.retry, true);
  assert.equal((await row(`select credit_kes::int as c, status from applications where id = '${uid(7)}'`)).c, 0);
  // and the payer can try again straight away
  const retry = await prepare("application", uid(7), { by: "applicant" });
  assert.equal(retry.reused, false);
});

test("each Safaricom failure code has its own message", async () => {
  const msg = async (code) => (await row(`select public.mpesa_stk_message('failed', $1) as m`, [code])).m;
  assert.match(await msg("1"), /balance is not enough/);
  assert.match(await msg("2001"), /PIN was not correct/);
  assert.match(await msg("1037"), /could not reach your phone/);
  assert.match(await msg("1001"), /Another M-Pesa request/);
  assert.match(await msg("4242"), /did not go through/);
});

test("a success callback whose amount differs from the prompt is never credited: it is held as disputed for an admin", async () => {
  await app(8, "EPM-2026-STK888");
  const r = await prepare("application", uid(8), { by: "applicant" });
  const checkout = await send(r.request.id);
  const rc1 = receipt();
  const out = await callback(okBody(checkout, 5000, rc1));
  assert.equal(out.outcome, "disputed");
  assert.equal((await request(r.request.id)).status, "disputed");
  assert.equal((await row(`select count(*)::int as n from mpesa_transactions where trans_id = '${rc1}'`)).n, 0);
  assert.equal((await row(`select credit_kes::int as c from applications where id = '${uid(8)}'`)).c, 0);
  assert.ok(await row(`select 1 as x from admin_notifications where data ->> 'stk_request_id' = '${r.request.id}'`));
});

test("an admin settles a disputed prompt from the statement (owner or finance only, audited)", async () => {
  const r = await row(`select id from mpesa_stk_requests where application_id = '${uid(8)}'`);
  await rejects(c, as("support"), `select admin_stk_resolve('${r.id}', 'credit', 'STATEMNT01', 500, 'checked statement')`, [], /forbidden/);
  await rejects(c, as("finance"), `select admin_stk_resolve('${r.id}', 'credit', 'STATEMNT01', 500, '')`, [], /reason_required/);
  await rejects(c, as("finance"), `select admin_stk_resolve('${r.id}', 'credit', 'bad', 500, 'checked statement')`, [], /invalid_receipt/);
  const out = await tx(c, as("finance"), async (k) => (await sql(k, `select admin_stk_resolve('${r.id}', 'credit', 'STATEMNT01', 500, 'checked the statement') as r`))[0].r, { commit: true });
  assert.equal(out.outcome, "ready");
  assert.equal((await request(r.id)).status, "paid");
  assert.equal((await row(`select status from applications where id = '${uid(8)}'`)).status, "payment_confirming");
  assert.ok(await row(`select 1 as x from audit_log where action = 'stk_credit' and entity_id = '${r.id}'`));
  await rejects(c, as("finance"), `select admin_stk_resolve('${r.id}', 'close', null, null, 'again')`, [], /already_handled/);
});

test("a success that Safaricom's own status query says failed is held as disputed, not credited", async () => {
  await app(9, "EPM-2026-STK999");
  const r = await prepare("application", uid(9), { by: "applicant" });
  const checkout = await send(r.request.id);
  const out = await callback(okBody(checkout, 500, receipt()), "query_failed");
  assert.equal(out.outcome, "disputed");
  assert.equal((await row(`select credit_kes::int as c from applications where id = '${uid(9)}'`)).c, 0);
});

test("a success callback is stored raw and waits when nobody has checked it yet (the caller verifies, then processes)", async () => {
  await app(10, "EPM-2026-STKAAA");
  const r = await prepare("application", uid(10), { by: "applicant" });
  const checkout = await send(r.request.id);
  const rc1 = receipt();
  const first = await svc(`select public.mpesa_stk_ingest($1::jsonb, null, null) as r`, [JSON.stringify(okBody(checkout, 500, rc1))]);
  assert.equal(first.needs_verification, true);
  assert.equal(first.checkout_request_id, checkout);
  assert.equal((await request(r.request.id)).status, "pending");
  await sql(c, `update mpesa_callbacks set received_at = now() - interval '2 minutes' where id = '${first.callback_id}'`);
  const waiting = await svc(`select public.mpesa_stk_unprocessed(10) as r`);
  assert.ok(waiting.some((w) => w.callback_id === first.callback_id));
  const done = await svc(`select public.mpesa_stk_process($1, 'query_unavailable') as r`, [first.callback_id]);
  assert.equal(done.outcome, "ready");
  assert.equal((await request(r.request.id)).verification, "query_unavailable");
});

test("a success for a CheckoutRequestID we never sent still records the money for an admin", async () => {
  const rc1 = receipt();
  const out = await callback(okBody("ws_CO_not_ours", 750, rc1));
  assert.equal(out.outcome, "needs_assignment");
  const t = await row(`select state, note, channel from mpesa_transactions where trans_id = '${rc1}'`);
  assert.deepEqual(t, { state: "needs_assignment", note: "stk_unknown_request", channel: "stk" });
});

test("the reply to our request was lost (no CheckoutRequestID recorded): the success is matched by phone and amount", async () => {
  await app(13, "EPM-2026-STKDDD", { phone: "+254700111222" });
  const r = await prepare("application", uid(13), { by: "applicant", phone: "0700111222" });
  await svc(`select public.mpesa_stk_mark_error($1, 'network', 'timeout') as r`, [r.request.id]);
  assert.equal((await request(r.request.id)).status, "error");
  const out = await callback(okBody("ws_CO_lost_reply", 500, receipt(), 254700111222));
  assert.equal(out.outcome, "ready");
  const q = await request(r.request.id);
  assert.equal(q.status, "paid");
  assert.equal(q.checkout_request_id, "ws_CO_lost_reply");
});

test("a garbage body is stored and flagged, never turned into money, and not retried by the reconcile job", async () => {
  const out = await callback({ hello: "world" }, null);
  assert.equal(out.outcome, "error");
  const cb = await row(`select processed, error from mpesa_callbacks where id = $1`, [out.callback_id]);
  assert.equal(cb.processed, false);
  assert.match(cb.error, /not_an_stk_callback/);
  await sql(c, `update mpesa_callbacks set received_at = now() - interval '5 minutes' where id = '${out.callback_id}'`);
  assert.ok(!(await svc(`select public.mpesa_stk_unprocessed(100) as r`)).some((w) => w.callback_id === out.callback_id));
});

test("a masked phone number in a callback is dropped, not stored half", async () => {
  const body = okBody("ws_x", 1, "SKMASK0001");
  body.Body.stkCallback.CallbackMetadata.Item[4].Value = "2547****5678";
  const p = await row(`select public.mpesa_stk_parse($1::jsonb) as p`, [JSON.stringify(body)]);
  assert.equal(p.p.phone, null);
  assert.equal(p.p.receipt, "SKMASK0001");
  assert.equal((await row(`select public.mpesa_stk_parse($1::jsonb) as p`, [JSON.stringify(okBody("ws_x", 1, "SKMASK0002"))])).p.phone, "254712345678");
});

// ================================================================ STK: sellers
test("a seller renews 3 months by prompt: credit is taken off, and exactly 3 months are added", async () => {
  await biz(4, "ES300004", { paidOffset: 10, credit: 200 });
  const r = await prepare("business", bid(4), { months: 3 });
  assert.equal(r.request.amount, 1300);
  assert.equal(r.request.account, "ES300004");
  assert.equal(r.request.purpose, "renewal");
  const checkout = await send(r.request.id);
  const out = await callback(okBody(checkout, 1300, receipt()));
  assert.equal(out.outcome, "applied");
  assert.equal(out.months, 3);
  assert.equal(await paidUntil(4), await plusMonths(10, 3));
  assert.equal((await row(`select credit_kes::int as c from businesses where id = '${bid(4)}'`)).c, 0);
  const v = await row(`select public.mpesa_stk_view(s) as v from mpesa_stk_requests s where id = '${r.request.id}'`);
  assert.equal(v.v.outcome.months, 3);
  assert.ok(v.v.outcome.receiptNo);
});

test("the months asked for never exceed the prepay limit", async () => {
  await biz(5, "ES300005", { paidOffset: 300 });
  const r = await prepare("business", bid(5), { months: 12 });
  assert.ok(r.request.months < 12 && r.request.months >= 1, String(r.request.months));
  assert.equal(r.request.amount, r.request.months * 500);
  await biz(6, "ES300006", { paidOffset: 400 });
  await rejects(c, asService, `select public.mpesa_stk_prepare('business', '${bid(6)}', 'renewal', null, null, null, 1, '0712345678', 'seller')`, [], /paid_ahead/);
});

test("credit that already covers the payment: the seller is told to use it, no prompt is sent", async () => {
  await biz(7, "ES300007", { credit: 600 });
  await rejects(c, asService, `select public.mpesa_stk_prepare('business', '${bid(7)}', 'renewal', null, null, null, 1, '0712345678', 'seller')`, [], /use_credit/);
});

test("an upgrade paid by prompt is applied as the upgrade, even if the portal's intent was cleared in between", async () => {
  await biz(8, "ES300008", { paidOffset: 20 });
  const r = await prepare("business", bid(8), { purpose: "upgrade", plan: "premium" });
  assert.equal(r.request.purpose, "upgrade");
  const checkout = await send(r.request.id);
  await sql(c, `update businesses set pay_intent = null where id = '${bid(8)}'`);
  const before = await paidUntil(8);
  const out = await callback(okBody(checkout, r.request.amount, receipt()));
  assert.equal(out.outcome, "applied");
  assert.equal((await row(`select plan_key from businesses where id = '${bid(8)}'`)).plan_key, "premium");
  assert.equal(await paidUntil(8), before);
});

test("a category change: refused without its pending change request, paid by prompt with it", async () => {
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('salon', 'Salon', 'Beauty', 'A', 2) on conflict do nothing;
    insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ('salon', 'standard', 800, 3, '["a","b","c"]') on conflict do nothing`);
  await biz(14, "ES300014", { paidOffset: 15 });
  await rejects(c, asService, `select public.mpesa_stk_prepare('business', '${bid(14)}', 'category_change', null, 'salon', null, 1, '0712345678', 'seller')`, [], /change_not_found/);
  const ch = await row(`insert into change_requests (business_id, field, old_value, new_value) values ('${bid(14)}', 'category_id', 'barber', 'salon') returning id`);
  const r = await prepare("business", bid(14), { purpose: "category_change", category: "salon", change: ch.id });
  const extra = (await row(`select public.payment_quote(b, 'category_change', null, 'salon') as q from businesses b where id = '${bid(14)}'`)).q.amount_kes;
  assert.equal(r.request.amount, extra);
  assert.equal(r.request.purpose, "category_change");
  const checkout = await send(r.request.id);
  const out = await callback(okBody(checkout, extra, receipt()));
  assert.notEqual(out.outcome, "needs_assignment", JSON.stringify(out));
  const paid = await row(`select count(*)::int as n from payments where business_id = '${bid(14)}' and change_request_id = '${ch.id}' and status = 'confirmed'`);
  assert.equal(paid.n, 1);
});

// ================================================================ STK: late answers and the reconcile job
test("the status query: 'paid' moves a prompt to confirming; a failure code fails it; 'still processing' changes nothing", async () => {
  await biz(9, "ES300009");
  const r = await prepare("business", bid(9));
  await send(r.request.id);
  const proc = await svc(`select public.mpesa_stk_apply_query($1, null, null, true) as r`, [r.request.id]);
  assert.equal(proc.status, "pending");
  const ok = await svc(`select public.mpesa_stk_apply_query($1, '0', 'processed', false) as r`, [r.request.id]);
  assert.equal(ok.status, "confirming");
  assert.match(ok.message, /Do not pay again/);
  assert.equal((await request(r.request.id)).query_count, 2);

  await biz(10, "ES300010");
  const r2 = await prepare("business", bid(10));
  await send(r2.request.id);
  const bad = await svc(`select public.mpesa_stk_apply_query($1, '1032', 'Request cancelled by user', false) as r`, [r2.request.id]);
  assert.equal(bad.status, "failed");
});

test("a prompt nobody answered expires; if the PIN was entered late, the late success is still credited", async () => {
  await biz(11, "ES300011", { paidOffset: 3 });
  const r = await prepare("business", bid(11));
  const checkout = await send(r.request.id);
  await sql(c, `update mpesa_stk_requests set sent_at = now() - interval '11 minutes' where id = '${r.request.id}'`);
  const due = await svc(`select public.mpesa_stk_to_query(50) as r`);
  assert.ok(due.some((d) => d.id === r.request.id));
  const swept = await svc(`select public.mpesa_stk_expire_stale() as r`);
  assert.ok(swept.expired >= 1);
  assert.equal((await request(r.request.id)).status, "expired");
  const out = await callback(okBody(checkout, 500, receipt()));
  assert.equal(out.outcome, "applied");
  assert.equal((await request(r.request.id)).status, "paid");
});

test("a request that never reached Safaricom becomes an error; a 'confirming' one with no receipt is reported once", async () => {
  await biz(12, "ES300012");
  const r = await prepare("business", bid(12));
  await sql(c, `update mpesa_stk_requests set created_at = now() - interval '5 minutes' where id = '${r.request.id}'`);
  await svc(`select public.mpesa_stk_expire_stale() as r`);
  assert.equal((await request(r.request.id)).status, "error");

  await biz(13, "ES300013");
  const r2 = await prepare("business", bid(13));
  await send(r2.request.id);
  await svc(`select public.mpesa_stk_apply_query($1, '0', 'ok', false) as r`, [r2.request.id]);
  await sql(c, `update mpesa_stk_requests set sent_at = now() - interval '40 minutes' where id = '${r2.request.id}'`);
  assert.equal((await svc(`select public.mpesa_stk_expire_stale() as r`)).alerted, 1);
  assert.equal((await svc(`select public.mpesa_stk_expire_stale() as r`)).alerted, 0);
});

test("the short application reference from a prompt also works when typed at the Paybill", async () => {
  await app(11, "EPM-2026-STKBBB");
  const r = await c2b("2026stkbbb", 500, "SHORTREF01");
  assert.equal(r.outcome, "ready");
  assert.equal((await row(`select match_method from mpesa_transactions where trans_id = 'SHORTREF01'`)).match_method, "reference");
});

// ================================================================ who can see what
test("a seller reads only their own prompts; the public reads none; the admin list is for admins", async () => {
  await sql(c, `update businesses set user_id = null where id = '${ids.bizA}'; update businesses set user_id = '${ids.userA}' where id = '${bid(4)}'`);
  const mine = await tx(c, asA, (k) => sql(k, `select id from mpesa_stk_requests`));
  assert.ok(mine.length >= 1);
  assert.ok((await tx(c, asA, (k) => sql(k, `select business_id from mpesa_stk_requests`))).every((x) => x.business_id === bid(4)));
  assert.equal((await tx(c, asB, (k) => sql(k, `select id from mpesa_stk_requests where business_id = '${bid(4)}'`))).length, 0);
  await rejects(c, { role: "anon" }, `select * from mpesa_stk_requests`, [], /permission denied/);
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from admin_stk_requests`))).length, 0);
  const all = await tx(c, as("support"), (k) => sql(k, `select status, business_name, reference from admin_stk_requests`));
  assert.ok(all.length > 10);
  await rejects(c, asA, `select public.mpesa_stk_prepare('business', '${bid(4)}', null, null, null, null, 1, '0712345678', 'seller')`, [], /permission denied/);
  await rejects(c, asA, `select public.mpesa_stk_ingest('{}'::jsonb, null, 'query_ok')`, [], /permission denied/);
  await rejects(c, asA, `select public.mpesa_stk_settle('${bid(4)}', 'XXXXXXXXXX', 1, null, null, null, 'x')`, [], /permission denied/);
});

test("the seller's payment instructions say whether Pay now is on, and give the listing phone", async () => {
  const i = await tx(c, asA, async (k) => (await sql(k, `select seller_payment_instructions() as r`))[0].r);
  assert.equal(i.stk, true);
  assert.equal(i.phone, "+254733000100");
  await sql(c, `update site_settings set value = value || '{"stk": false}' where key = 'mpesa'`);
  assert.equal((await tx(c, asA, async (k) => (await sql(k, `select seller_payment_instructions() as r`))[0].r)).stk, false);
  await sql(c, `update site_settings set value = value || '{"stk": true}' where key = 'mpesa'`);
});
