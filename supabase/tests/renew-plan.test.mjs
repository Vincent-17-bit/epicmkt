// Renew on Standard or Premium (migration 0138). The renewal names the plan; the days left move to the new plan (charged going up,
// credited going down); the months are at the new plan's price. Every way money arrives applies the choice the same way.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService } from "./db.mjs";
import { buildPaymentInstructions, planSwitchQuote } from "../../shared/src/billing.js";

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

const asSeller = (n) => ({ sub: `60000000-0000-0000-0000-${String(n).padStart(12, "0")}` });
const sellerBiz = async (n, seller, opts = {}) => {
  const user = asSeller(n).sub;
  await sql(c, `insert into auth.users (id, email) values ('${user}', 'seller${n}@test') on conflict do nothing`);
  await biz(n, seller, opts);
  await sql(c, `update businesses set user_id = '${user}' where id = '${bid(n)}'`);
  return user;
};
const asUser = (user) => ({ sub: user, role: "authenticated" });
const instructions = (user, target) => tx(c, asUser(user), async (k) => (await sql(k, `select public.seller_payment_instructions(null, $1, null) as r`, [target]))[0].r);
const setIntent = (user, target) => tx(c, asUser(user), async (k) => sql(k, `select public.seller_set_payment_intent(null, $1, null, null)`, [target]), { commit: true });
const bizRow = (n) => row(`select plan_key, monthly_price, credit_kes::int as credit, to_char(public.nairobi_day(paid_until), 'YYYY-MM-DD') as paid, pay_intent from businesses where id = '${bid(n)}'`);
const daysLeftQuote = async (oldP, newP, offset) => (await row(`select public.plan_switch_quote(${oldP}, ${newP}, public.nairobi_midnight(${day(offset)})) as q`)).q;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_renew_plan_test" }));
  await seedFixtures(c);
  await sql(c, `insert into public.site_settings (key, value) values ('mpesa', '{"type":"paybill","number":"247247","name":"EpicMKT","stk":true}')
    on conflict (key) do update set value = excluded.value`);
});
after(async () => { await c?.end(); });

test("the switch quote: days left move to the new plan, charged going up and credited going down; nothing with no days left", async () => {
  const up = await daysLeftQuote(500, 1500, 15);
  const down = await daysLeftQuote(1500, 500, 15);
  assert.ok(up.daysLeft === 15 && up.switchDue > 0 && up.switchCredit === 0, JSON.stringify(up));
  assert.ok(down.switchDue === 0 && down.switchCredit > 0, JSON.stringify(down));
  // Same numbers as the shared JavaScript the pages and the demo use.
  const today = (await row(`select to_char(public.nairobi_day(now()), 'YYYY-MM-DD') as d`)).d;
  const paid = (await row(`select to_char(${day(15)}, 'YYYY-MM-DD') as d`)).d;
  const js = (o, n) => planSwitchQuote({ oldPrice: o, newPrice: n, paidUntil: paid, now: new Date(`${today}T12:00:00+03:00`) });
  assert.deepEqual([js(500, 1500).switchDue, js(1500, 500).switchCredit], [up.switchDue, down.switchCredit]);
  for (const offset of [-1, -5, null]) {
    const q = (await row(`select public.plan_switch_quote(500, 1500, ${offset === null ? "null" : `public.nairobi_midnight(${day(offset)})`}) as q`)).q;
    assert.deepEqual([q.switchDue, q.switchCredit], [0, 0], String(offset));
  }
});

test("the seller page is offered both plans of its own category, and the amount follows the chosen plan", async () => {
  const user = await sellerBiz(1, "ES310001", { plan: "premium", paidOffset: -10, status: "expired" });
  const same = await instructions(user, null);
  assert.deepEqual(same.plan_choices, { standard: 500, premium: 1500 });
  assert.equal(same.current_plan, "premium");
  assert.equal(same.amount_kes, 1500);
  const std = await instructions(user, "standard");
  assert.deepEqual([std.purpose, std.plan_key, std.amount_kes, std.switch_kes, std.amount_due_kes], ["renewal", "standard", 500, 0, 500]);
  // The JavaScript twin (mock API, unit tests) gives the same answer.
  const b = await row(`select seller_id, plan_key, category_id, paid_until from businesses where id = '${bid(1)}'`);
  const now = new Date((await row(`select now() as n`)).n);
  const jsq = buildPaymentInstructions({ business: { sellerId: b.seller_id, planKey: b.plan_key, categoryId: b.category_id, paidUntil: b.paid_until, hasConfirmedPayment: true },
    priceOf: (cat, plan) => ({ standard: 500, premium: 1500 })[plan], targetPlan: "standard", now });
  assert.deepEqual([jsq.purpose, jsq.planKey, jsq.amount, jsq.switchKes], ["renewal", "standard", 500, 0]);
});

test("expired Premium seller renews on Standard by Paybill: the plan changes, the month is at the Standard price", async () => {
  const user = await sellerBiz(2, "ES310002", { plan: "premium", paidOffset: -10, status: "expired" });
  await setIntent(user, "standard");
  assert.equal((await bizRow(2)).pay_intent.purpose, "plan_switch");
  const r = await c2b("ES310002", 500, "DOWNEXP001");
  assert.equal(r.outcome, "applied");
  assert.equal(r.months, 1);
  const b = await bizRow(2);
  assert.deepEqual([b.plan_key, b.monthly_price, b.credit, b.pay_intent], ["standard", 500, 0, null]);
  assert.equal(b.paid, await plusMonths(0, 1));
  assert.ok(await row(`select 1 as x from audit_log where business_id = '${bid(2)}' and action = 'plan_switched'`));
});

test("expired Standard seller renews straight onto Premium (no upgrade first): 3 Premium months", async () => {
  const user = await sellerBiz(3, "ES310003", { plan: "standard", paidOffset: -20, status: "expired" });
  await setIntent(user, "premium");
  const r = await c2b("ES310003", 4500, "UPEXP00001");
  assert.equal(r.months, 3);
  const b = await bizRow(3);
  assert.deepEqual([b.plan_key, b.credit], ["premium", 0]);
  assert.equal(b.paid, await plusMonths(0, 3));
});

test("active Standard seller renews early on Premium: the days left are charged at the difference, then Premium months follow on", async () => {
  const user = await sellerBiz(4, "ES310004", { plan: "standard", paidOffset: 12 });
  const q = await instructions(user, "premium");
  assert.ok(q.switch_kes > 0);
  assert.equal(q.amount_due_kes, 1500 + q.switch_kes);
  await setIntent(user, "premium");
  const r = await c2b("ES310004", 1500 + q.switch_kes, "UPACT00001");
  assert.equal(r.months, 1);
  const b = await bizRow(4);
  assert.deepEqual([b.plan_key, b.credit], ["premium", 0]);
  assert.equal(b.paid, await plusMonths(12, 1));
  const up = await row(`select kind, amount_kes, status, plan_key from payments where business_id = '${bid(4)}' and kind = 'upgrade'`);
  assert.deepEqual(up, { kind: "upgrade", amount_kes: q.switch_kes, status: "confirmed", plan_key: "premium" });
});

test("active Premium seller renews on Standard: unused Premium days come back as credit and lower what is paid", async () => {
  const user = await sellerBiz(5, "ES310005", { plan: "premium", paidOffset: 12 });
  const q = await instructions(user, "standard");
  assert.ok(q.switch_kes < 0);
  assert.equal(q.amount_due_kes, Math.max(500 + q.switch_kes, 0));
  await setIntent(user, "standard");
  const pay = Math.max(500 + q.switch_kes, 1);
  const r = await c2b("ES310005", pay, "DOWNACT001");
  assert.equal(r.outcome, "applied");
  const b = await bizRow(5);
  assert.equal(b.plan_key, "standard");
  assert.equal(b.paid, await plusMonths(12, r.months));
  assert.equal(b.credit, pay - q.switch_kes - 500 * r.months);
  const msg = await row(`select body from messages where business_id = '${bid(5)}' and subject = 'Plan changed'`);
  assert.match(msg.body, /unused Premium days is kept as credit/);
});

test("not enough for the switch and a month: held as credit with a message, never a month on the old plan", async () => {
  const user = await sellerBiz(6, "ES310006", { plan: "standard", paidOffset: -5, status: "expired" });
  await setIntent(user, "premium");
  const r = await c2b("ES310006", 600, "HOLDPLAN01");
  assert.equal(r.outcome, "held");
  const b = await bizRow(6);
  assert.deepEqual([b.plan_key, b.credit, b.pay_intent?.purpose], ["standard", 600, "plan_switch"]);
  const msg = await row(`select body from messages where business_id = '${bid(6)}' and subject = 'Payment received, balance due' order by created_at desc limit 1`);
  assert.match(msg.body, /renewing on Premium/);
  assert.match(msg.body, /KES 900 more/);
  assert.equal((await c2b("ES310006", 900, "HOLDPLAN02")).months, 1);
  assert.equal((await bizRow(6)).plan_key, "premium");
});

test("phone prompt: the amount includes the switch, the request remembers the plan, and paying applies it", async () => {
  await sellerBiz(7, "ES310007", { plan: "premium", paidOffset: -3, status: "expired" });
  const r = await prepare("business", bid(7), { plan: "standard", months: 2 });
  assert.deepEqual([r.request.amount, r.request.months, r.request.purpose], [1000, 2, "renewal"]);
  assert.equal((await request(r.request.id)).target_plan, "standard");
  // Something else clears the intent before the callback: the request still says which plan.
  await sql(c, `update businesses set pay_intent = null where id = '${bid(7)}'`);
  const checkout = await send(r.request.id);
  const out = await callback(okBody(checkout, 1000, receipt()));
  assert.equal(out.outcome, "applied");
  const b = await bizRow(7);
  assert.deepEqual([b.plan_key, b.credit], ["standard", 0]);
  assert.equal(b.paid, await plusMonths(0, 2));
});

test("credit already held renews on the other plan with one button", async () => {
  const user = await sellerBiz(8, "ES310008", { plan: "standard", paidOffset: -2, status: "expired", credit: 1500 });
  const out = await tx(c, asUser(user), async (k) => (await sql(k, `select public.seller_apply_credit(null, 'premium', null, null) as r`))[0].r, { commit: true });
  assert.equal(out.outcome, "applied");
  assert.deepEqual([(await bizRow(8)).plan_key, (await bizRow(8)).credit], ["premium", 0]);
});

test("a stale or impossible choice never blocks the money: it renews the current plan", async () => {
  const user = await sellerBiz(9, "ES310009", { plan: "standard", paidOffset: -2, status: "expired" });
  await setIntent(user, "premium");
  await sql(c, `update businesses set pay_intent = jsonb_set(pay_intent, '{set_at}', to_jsonb(now() - interval '3 days')) where id = '${bid(9)}'`);
  const r = await c2b("ES310009", 500, "STALEPLAN1");
  assert.equal(r.months, 1);
  assert.equal((await bizRow(9)).plan_key, "standard");
  await rejects(c, asUser(user), `select public.seller_payment_instructions(null, 'gold', null)`, [], /invalid_plan/);
});

test("choosing the plan you are on is a plain renewal (no intent), and Upgrade to Premium still works as before", async () => {
  const user = await sellerBiz(10, "ES310010", { plan: "standard", paidOffset: 10 });
  await setIntent(user, "standard");
  assert.equal((await bizRow(10)).pay_intent, null);
  const up = await tx(c, asUser(user), async (k) => (await sql(k, `select public.seller_payment_instructions('upgrade', 'premium', null) as r`))[0].r);
  assert.equal(up.purpose, "upgrade");
  assert.ok(up.amount_kes > 0);
});
