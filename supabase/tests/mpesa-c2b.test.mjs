import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asService } from "./db.mjs";

let c;
const U = { owner: ids.admin, finance: "00000000-0000-0000-0000-0000000000c2", support: "00000000-0000-0000-0000-0000000000c3" };
const as = (role) => ({ sub: U[role] });
const sha = (phone) => createHash("sha256").update(phone).digest("hex");
const uid = (n) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const app = (n, ref, name, { status = "approved", price = 500, town = "Kisumu", phone = "+254712345678" } = {}) => `
  insert into applications (id, reference_no, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
    phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, status)
  values ('${uid(n)}', '${ref}', 'barber', 'standard', ${price}, '{}', 'Owner', 'national_id', '1', '${phone}', 'o@x.co', '${name}', false, 2020, 'S1', '2030-01-01',
    '${town}', '${town}', 'Main', 0, 0, '${phone}', '1', '1', true, '${status}');`;

let seq = 0;
const code = () => `TX${String(++seq).padStart(8, "0")}`;
const body = (account, amount, extra = {}) => ({
  TransactionType: "Pay Bill", TransID: extra.TransID ?? code(), TransTime: "20261018143005", TransAmount: String(amount),
  BusinessShortCode: "247247", BillRefNumber: account, MSISDN: extra.MSISDN ?? sha("254799000001"), FirstName: "JOHN", ...extra.more,
});
const ingest = (b) =>
  tx(c, asService, async (k) => (await sql(k, `select public.mpesa_ingest('confirmation', $1::jsonb, '1.2.3.4') as r`, [JSON.stringify(b)]))[0].r, { commit: true });
const pay = (account, amount, extra) => ingest(body(account, amount, extra));
const row = async (text) => (await sql(c, text))[0];
const day = (offset) => `(public.nairobi_day(now()) + ${offset})`;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${U.finance}', 'finance@test'), ('${U.support}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${U.finance}', 'finance', 'finance@test'), ('${U.support}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    update public.site_settings set value = '{"type":"paybill","number":"247247","name":"EpicMKT"}' where key = 'mpesa';
  `);
});
after(async () => { await c?.end(); });

// ---------------------------------------------------------------- first payment
test("paying the application reference moves the application to payment_confirming, stores the code and queues an SMS", async () => {
  await sql(c, app(1, "EPM-2026-AAA111", "Mama Pima Salon"));
  const r = await pay("EPM-2026-AAA111", 500, { TransID: "SGH4K9L2QW" });
  assert.equal(r.outcome, "ready");
  const a = await row(`select status, payment_code, credit_kes::int as credit from applications where id = '${uid(1)}'`);
  assert.deepEqual(a, { status: "payment_confirming", payment_code: "SGH4K9L2QW", credit: 500 });
  const t = await row(`select state, target_type, match_method, amount_kes::int as amount from mpesa_transactions where trans_id = 'SGH4K9L2QW'`);
  assert.deepEqual(t, { state: "credited", target_type: "application", match_method: "reference", amount: 500 });
  assert.equal((await sql(c, `select 1 from messages where application_id = '${uid(1)}' and channel = 'sms' and status = 'queued'`)).length, 1);
  assert.equal((await sql(c, `select 1 from admin_notifications where kind = 'payment_received'`)).length, 1);
});

test("paying before the application is approved keeps the money, and approval then goes straight to payment_confirming with the code", async () => {
  await sql(c, app(9, "EPM-2026-EARLY1", "Early Bird", { status: "under_review" }));
  const r = await pay("EPM-2026-EARLY1", 500, { TransID: "EARLY00001" });
  assert.equal(r.outcome, "early");
  assert.deepEqual(await row(`select status, credit_kes::int as credit from applications where id = '${uid(9)}'`), { status: "under_review", credit: 500 });
  await sql(c, `update applications set status = 'payment_confirming' where id = '${uid(9)}'`);
  assert.equal((await row(`select payment_code from applications where id = '${uid(9)}'`)).payment_code, "EARLY00001");
});

test("the reference can be typed in any case, without hyphens or with spaces", async () => {
  await sql(c, app(2, "EPM-2026-BBB222", "Duka Moja"));
  assert.equal((await pay("  epm 2026 bbb222 ", 500)).outcome, "ready");
});

test("a unique business name still works as a fallback", async () => {
  await sql(c, app(3, "EPM-2026-CCC333", "Kibanda Cha Pwani"));
  const r = await pay("kibanda   CHA pwani", 500);
  assert.equal(r.outcome, "ready");
  assert.equal((await row(`select match_method from mpesa_transactions where account = 'kibanda   CHA pwani'`)).match_method, "name");
});

// ---------------------------------------------------------------- same name, different towns
test("two shops with the same name are both kept: no guess, the admin sees both towns, and neither is blocked", async () => {
  await sql(c, app(4, "EPM-2026-DDD444", "Upendo Shop", { town: "Maseno", phone: "+254711000001" }) + app(5, "EPM-2026-EEE555", "Upendo Shop", { town: "Kiambu", phone: "+254722000002" }));
  const r = await pay("Upendo Shop", 500, { TransID: "UPENDO0001" });
  assert.equal(r.outcome, "needs_assignment");
  assert.equal(r.note, "ambiguous_name");
  const t = await row(`select state, candidates from mpesa_transactions where trans_id = 'UPENDO0001'`);
  assert.equal(t.state, "needs_assignment");
  assert.deepEqual(t.candidates.map((x) => x.town).sort(), ["Kiambu", "Maseno"]);
  assert.equal((await row(`select count(*)::int as n from applications where status = 'approved' and business_name = 'Upendo Shop'`)).n, 2);
  assert.equal((await row(`select count(*)::int as n from applications where credit_kes > 0 and business_name = 'Upendo Shop'`)).n, 0);
});

test("the payer's phone (hashed by Safaricom) decides between same-named shops when exactly one matches", async () => {
  const r = await pay("Upendo Shop", 500, { MSISDN: sha("254722000002"), TransID: "UPENDO0002" });
  assert.equal(r.outcome, "ready");
  assert.equal((await row(`select match_method from mpesa_transactions where trans_id = 'UPENDO0002'`)).match_method, "name+phone");
  const kiambu = await row(`select status, credit_kes::int as credit from applications where id = '${uid(5)}'`);
  assert.deepEqual(kiambu, { status: "payment_confirming", credit: 500 });
  assert.equal((await row(`select credit_kes::int as credit from applications where id = '${uid(4)}'`)).credit, 0);
});

test("an admin can search any shop by name, town, phone or reference to assign a payment; support cannot", async () => {
  const found = await tx(c, as("finance"), async (k) => (await sql(k, `select admin_mpesa_search_targets('upendo') as r`))[0].r);
  assert.deepEqual(found.map((x) => x.town).sort(), ["Kiambu", "Maseno"]);
  const byRef = await tx(c, as("finance"), async (k) => (await sql(k, `select admin_mpesa_search_targets('epm 2026 ddd444') as r`))[0].r);
  assert.equal(byRef[0].town, "Maseno");
  assert.deepEqual(await tx(c, as("owner"), async (k) => (await sql(k, `select admin_mpesa_search_targets('x') as r`))[0].r), []);
  await rejects(c, as("support"), `select admin_mpesa_search_targets('upendo')`, [], /forbidden/);
});

test("an admin assigns the waiting payment to the right shop; support cannot", async () => {
  const t = await row(`select id from mpesa_transactions where trans_id = 'UPENDO0001'`);
  await rejects(c, as("support"), `select admin_mpesa_assign('${t.id}', 'application', '${uid(4)}')`, [], /forbidden/);
  await rejects(c, asA, `select admin_mpesa_assign('${t.id}', 'application', '${uid(4)}')`, [], /permission denied|forbidden/);
  const r = await tx(c, as("finance"), async (k) => (await sql(k, `select admin_mpesa_assign('${t.id}', 'application', '${uid(4)}') as r`))[0].r, { commit: true });
  assert.equal(r.outcome, "ready");
  assert.equal((await row(`select status from applications where id = '${uid(4)}'`)).status, "payment_confirming");
  await rejects(c, as("finance"), `select admin_mpesa_assign('${t.id}', 'application', '${uid(4)}')`, [], /already_handled/);
});

// ---------------------------------------------------------------- short, top-up, prepay, overpay
test("a short payment is recorded as credit, tells the payer the balance, and a top-up completes it", async () => {
  await sql(c, app(6, "EPM-2026-FFF666", "Short Pay Shop", { price: 1000 }));
  const first = await pay("EPM-2026-FFF666", 300);
  assert.equal(first.outcome, "part_paid");
  assert.equal(first.balance, 700);
  assert.deepEqual(await row(`select status, credit_kes::int as credit from applications where id = '${uid(6)}'`), { status: "approved", credit: 300 });
  const sms = await row(`select body from messages where application_id = '${uid(6)}' and channel = 'sms' order by created_at desc limit 1`);
  assert.match(sms.body, /Balance KES 700/);
  assert.match(sms.body, /EPM-2026-FFF666/);
  const second = await pay("EPM-2026-FFF666", 700);
  assert.equal(second.outcome, "ready");
  assert.deepEqual(await row(`select status, credit_kes::int as credit from applications where id = '${uid(6)}'`), { status: "payment_confirming", credit: 1000 });
});

test("paying three months at once is recorded as 1,500 credit; the queue suggests 3 months", async () => {
  await sql(c, app(7, "EPM-2026-GGG777", "Prepay Shop"));
  const r = await pay("EPM-2026-GGG777", 1500);
  assert.equal(r.outcome, "ready");
  const q = await tx(c, as("owner"), (k) => sql(k, `select status, suggested_months, credit_kes::int as credit, expected_kes from admin_payment_queue where application_id = '${uid(7)}'`));
  assert.deepEqual(q, [{ status: "awaiting_confirmation", suggested_months: 3, credit: 1500, expected_kes: 500 }]);
});

test("activation uses the months paid for and carries the leftover onto the new business", async () => {
  await sql(c, app(8, "EPM-2026-HHH888", "Overpay Shop"));
  await pay("EPM-2026-HHH888", 1600);
  const bid = "10000000-0000-0000-0000-0000000000f8";
  await sql(c, `
    insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, application_id, monthly_price, paid_until)
    values ('${bid}', 'ES100800', null, 'overpay-shop', 'Overpay Shop', 'barber', 'standard', 'live', '+254712345678', '${uid(8)}', 500, public.nairobi_midnight(${day(0)} + 90))`);
  const pid = (await row(`insert into payments (business_id, application_id, amount_kes, kind, status, mpesa_code, source, confirmed_via, months)
    values ('${bid}', '${uid(8)}', 1500, 'first', 'confirmed', 'ACTIVATE01', 'admin', 'admin', 3) returning id`)).id;
  const r = await tx(c, asService, async (k) => (await sql(k, `select mpesa_settle_activation('${uid(8)}', '${bid}', '${pid}', 1500) as r`))[0].r, { commit: true });
  assert.equal(r.leftover, 100);
  assert.equal((await row(`select credit_kes::int as c from businesses where id = '${bid}'`)).c, 100);
  assert.equal((await row(`select credit_kes::int as c from applications where id = '${uid(8)}'`)).c, 0);
  assert.equal((await row(`select state from mpesa_transactions where application_id is null and business_id = '${bid}' and amount_kes = 1600`)).state, "applied");
});

// ---------------------------------------------------------------- renewals
const biz = (n, seller, price = 500, paidOffset = 10, status = "live") => `
  insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, monthly_price, paid_until)
  values ('10000000-0000-0000-0000-${String(n).padStart(12, "0")}', '${seller}', null, 'shop-${n}', 'Renewal Shop ${n}', 'barber', 'standard', '${status}', '+254733000${String(n).padStart(3, "0")}', ${price},
    ${paidOffset === null ? "null" : `public.nairobi_midnight(${day(paidOffset)})`})`;
const paidUntil = async (n) => (await row(`select to_char(public.nairobi_day(paid_until), 'YYYY-MM-DD') as d from businesses where seller_id = '${n === "A" ? "ES100001" : `ES2000${n}`}'`)).d;
const add = async (offsetDays, months) => (await row(`select to_char((${day(offsetDays)} + interval '${months} months')::date, 'YYYY-MM-DD') as d`)).d;

test("a renewal paid with the Seller ID is applied automatically: one month on from the current end date", async () => {
  await sql(c, biz(11, "ES200011"));
  const r = await pay("ES200011", 500);
  assert.equal(r.outcome, "applied");
  assert.equal(r.months, 1);
  assert.equal(await paidUntil(11), await add(10, 1));
  const p = await row(`select kind, status, source, confirmed_via, months, amount_kes, receipt_no from payments where business_id = '10000000-0000-0000-0000-000000000011'`);
  assert.deepEqual({ ...p, receipt_no: !!p.receipt_no }, { kind: "renewal", status: "confirmed", source: "auto", confirmed_via: "auto", months: 1, amount_kes: 500, receipt_no: true });
  assert.equal((await sql(c, `select 1 from messages where business_id = '10000000-0000-0000-0000-000000000011' and channel = 'in_app' and kind = 'payment'`)).length, 1);
  assert.equal((await sql(c, `select 1 from messages where business_id = '10000000-0000-0000-0000-000000000011' and channel = 'sms'`)).length, 1);
});

test("KES 1,500 on a 500 plan renews three months; KES 1,600 renews three and keeps 100 as credit", async () => {
  await sql(c, biz(12, "ES200012") + ";" + biz(13, "ES200013"));
  assert.equal((await pay("ES200012", 1500)).months, 3);
  assert.equal(await paidUntil(12), await add(10, 3));
  const r = await pay("ES200013", 1600);
  assert.equal(r.months, 3);
  assert.equal(r.credit, 100);
  assert.equal((await row(`select credit_kes::int as c from businesses where seller_id = 'ES200013'`)).c, 100);
});

test("a part payment on a renewal waits as credit; the top-up completes the month", async () => {
  await sql(c, biz(14, "ES200014"));
  const first = await pay("ES200014", 300);
  assert.equal(first.outcome, "part_paid");
  assert.equal(first.balance, 200);
  assert.equal(await paidUntil(14), await add(10, 0));
  const second = await pay("ES200014", 200);
  assert.equal(second.outcome, "applied");
  assert.equal(await paidUntil(14), await add(10, 1));
  assert.equal((await row(`select count(*)::int as n from mpesa_transactions where business_id = '10000000-0000-0000-0000-000000000014' and state = 'applied'`)).n, 2);
});

test("an expired listing restarts from today, a listing one day late carries on from its end date", async () => {
  await sql(c, biz(15, "ES200015", 500, -40, "expired") + ";" + biz(16, "ES200016", 500, -1));
  await pay("ES200015", 500);
  assert.equal(await paidUntil(15), await add(0, 1));
  assert.equal((await row(`select status from businesses where seller_id = 'ES200015'`)).status, "live");
  await pay("ES200016", 500);
  assert.equal(await paidUntil(16), await add(-1, 1));
});

test("the prepay cap stops at 12 months and keeps the rest as credit instead of losing it", async () => {
  await sql(c, biz(17, "ES200017", 500, 0));
  const r = await pay("ES200017", 8000);
  assert.equal(r.months, 12);
  assert.equal(r.credit, 2000);
  const again = await pay("ES200017", 500);
  assert.equal(again.outcome, "capped");
  assert.equal((await row(`select credit_kes::int as c from businesses where seller_id = 'ES200017'`)).c, 2500);
});

test("the old application reference still works after activation and goes to the business, not the finished application", async () => {
  const ref = "EPM-2026-HHH888";
  const r = await pay(ref, 500);
  assert.equal(r.outcome, "applied");
  assert.equal((await row(`select target_type from mpesa_transactions where account = '${ref}' order by created_at desc limit 1`)).target_type, "business");
});

// ---------------------------------------------------------------- nothing is lost
test("an unknown account is recorded with suggestions, never dropped", async () => {
  const r = await pay("Totally Unknown Ltd", 777, { TransID: "UNKNOWN001" });
  assert.equal(r.outcome, "needs_assignment");
  const t = await row(`select state, note, amount_kes::int as amount, account from mpesa_transactions where trans_id = 'UNKNOWN001'`);
  assert.deepEqual(t, { state: "needs_assignment", note: "no_match", amount: 777, account: "Totally Unknown Ltd" });
  const empty = await pay("", 100, { TransID: "NOACCOUNT1" });
  assert.equal(empty.note, "no_account");
});

test("a typo in the reference is recorded and suggests the near-miss", async () => {
  await sql(c, app(20, "EPM-2026-TYP123", "Typo Shop"));
  await pay("EPM-2026-TYP12", 500, { TransID: "TYPO000001" });
  const t = await row(`select candidates from mpesa_transactions where trans_id = 'TYPO000001'`);
  assert.deepEqual(t.candidates.map((x) => x.ref), ["EPM-2026-TYP123"]);
});

test("garbage callbacks are stored raw and flagged; they never throw and never create a transaction", async () => {
  const before = (await row(`select count(*)::int as n from mpesa_transactions`)).n;
  for (const bad of [{}, { TransID: "ONLYID0001" }, { TransID: "NEGATIVE01", TransAmount: "-5" }, { TransID: "TEXTAMT001", TransAmount: "abc" }, { _raw: "not json at all" }]) {
    const r = await ingest(bad);
    assert.equal(r.outcome, "error");
  }
  assert.equal((await row(`select count(*)::int as n from mpesa_transactions`)).n, before);
  const bad = await row(`select count(*)::int as n from mpesa_callbacks where not processed and error is not null`);
  assert.equal(bad.n, 5);
});

test("an unusual TransID format is still recorded, and Safaricom retries are ignored", async () => {
  const r = await pay("Totally Unknown Ltd", 50, { TransID: "weird-id-1" });
  assert.equal(r.outcome, "needs_assignment");
  assert.equal((await row(`select trans_id from mpesa_transactions where trans_id = 'WEIRD-ID-1'`)).trans_id, "WEIRD-ID-1");
  const dup = await pay("Totally Unknown Ltd", 50, { TransID: "WEIRD-ID-1" });
  assert.equal(dup.duplicate, true);
  assert.equal((await row(`select count(*)::int as n from mpesa_transactions where trans_id = 'WEIRD-ID-1'`)).n, 1);
});

test("masked, plain and hashed phone numbers are all accepted and never shown as a 64 character string", async () => {
  await pay("Totally Unknown Ltd", 11, { TransID: "MASKED0001", MSISDN: "2547****678" });
  await pay("Totally Unknown Ltd", 12, { TransID: "PLAIN00001", MSISDN: "254712345678" });
  await pay("Totally Unknown Ltd", 13, { TransID: "HASHED0001" });
  assert.equal((await row(`select payer_phone, msisdn_hash from mpesa_transactions where trans_id = 'MASKED0001'`)).payer_phone, null);
  const plain = await row(`select payer_phone, msisdn_hash from mpesa_transactions where trans_id = 'PLAIN00001'`);
  assert.equal(plain.payer_phone, "254712345678");
  assert.equal(plain.msisdn_hash, sha("254712345678"));
  assert.equal((await row(`select payer_phone from mpesa_transactions where trans_id = 'HASHED0001'`)).payer_phone, null);
});

test("a callback that failed mid-way is kept and can be reprocessed by an admin", async () => {
  const b = body("EPM-2026-AAA111", 25, { TransID: "REPROC0001" });
  const id = (await row(`insert into mpesa_callbacks (kind, body, processed, error) values ('confirmation', '${JSON.stringify(b)}'::jsonb, false, 'database was busy') returning id`)).id;
  await rejects(c, as("support"), `select admin_mpesa_reprocess('${id}')`, [], /forbidden/);
  const r = await tx(c, as("finance"), async (k) => (await sql(k, `select admin_mpesa_reprocess('${id}') as r`))[0].r, { commit: true });
  assert.equal(r.duplicate, false);
  assert.equal((await row(`select processed from mpesa_callbacks where id = '${id}'`)).processed, true);
  assert.equal((await row(`select 1 as x from mpesa_transactions where trans_id = 'REPROC0001'`)).x, 1);
});

// ---------------------------------------------------------------- admin actions
test("ignoring a payment that is only credit takes it back and re-opens the application; an applied one cannot be ignored", async () => {
  await sql(c, app(21, "EPM-2026-IGN001", "Ignore Shop"));
  await pay("EPM-2026-IGN001", 500, { TransID: "IGNORE0001" });
  const t = await row(`select id from mpesa_transactions where trans_id = 'IGNORE0001'`);
  await rejects(c, as("finance"), `select admin_mpesa_ignore('${t.id}', '  ')`, [], /reason_required/);
  await tx(c, as("finance"), (k) => sql(k, `select admin_mpesa_ignore('${t.id}', 'Paid to wrong shop, refunded')`), { commit: true });
  assert.deepEqual(await row(`select status, payment_code, credit_kes::int as credit from applications where id = '${uid(21)}'`), { status: "approved", payment_code: null, credit: 0 });
  assert.equal((await row(`select state, note from mpesa_transactions where id = '${t.id}'`)).state, "ignored");
  const applied = await row(`select id from mpesa_transactions where state = 'applied' limit 1`);
  await rejects(c, as("finance"), `select admin_mpesa_ignore('${applied.id}', 'mistake')`, [], /already_applied/);
});

test("only service_role can ingest; admins read the queue and raw inbox; sellers and anon see none of it", async () => {
  await rejects(c, as("finance"), `select public.mpesa_ingest('confirmation', '{}'::jsonb)`, [], /permission denied/);
  await rejects(c, asA, `select public.mpesa_ingest('confirmation', '{}'::jsonb)`, [], /permission denied/);
  // Finance and support cannot read applications directly, but must still see whose payment it is.
  const rows = await tx(c, as("finance"), (k) => sql(k, `select status, business_name, town, account, amount_kes::int as amount, mpesa_code from admin_payment_queue where mpesa_code in ('UPENDO0001','UNKNOWN001','SGH4K9L2QW') order by mpesa_code`));
  const byCode = Object.fromEntries(rows.map((r) => [r.mpesa_code, r]));
  assert.equal(byCode.UNKNOWN001.business_name, "No matching business");
  assert.equal(byCode.UNKNOWN001.status, "needs_assignment");
  assert.equal(byCode.SGH4K9L2QW.business_name, "Mama Pima Salon");
  assert.equal(byCode.UPENDO0001.business_name, "Upendo Shop");
  assert.ok((await tx(c, as("support"), (k) => sql(k, `select * from admin_payment_queue`))).length > 5);
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from admin_payment_queue`))).length, 0);
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from mpesa_callbacks`))).length, 0);
  const renewed = await tx(c, as("owner"), (k) => sql(k, `select status, receipt_no from admin_payment_queue where reference = 'ES200011' and status = 'renewed'`));
  assert.equal(renewed.length, 1);
  assert.ok(renewed[0].receipt_no);
});

// ---------------------------------------------------------------- seller side
test("the seller sees what to pay, their credit and the balance, and can spend credit on a renewal", async () => {
  await sql(c, `update businesses set paid_until = public.nairobi_midnight(${day(5)}), monthly_price = 500, credit_kes = 200 where id = '${ids.bizA}'`);
  const i = await tx(c, asA, async (k) => (await sql(k, `select seller_payment_instructions() as r`))[0].r);
  assert.equal(i.account, "ES100001");
  assert.equal(i.number, "247247");
  assert.equal(i.credit_kes, 200);
  assert.equal(i.amount_kes, 500);
  assert.equal(i.amount_due_kes, 300);
  await rejects(c, asA, `select seller_apply_credit()`, [], /not_enough_credit/);
  await sql(c, `update businesses set credit_kes = 700 where id = '${ids.bizA}'`);
  const r = await tx(c, asA, async (k) => (await sql(k, `select seller_apply_credit() as r`))[0].r, { commit: true });
  assert.equal(r.outcome, "applied");
  assert.equal((await row(`select credit_kes::int as c from businesses where id = '${ids.bizA}'`)).c, 200);
});

// ---------------------------------------------------------------- upgrades paid through the Paybill
const resetA = (offset = 20, status = "live") => sql(c, `update businesses set plan_key = 'standard', paid_until = public.nairobi_midnight(${day(offset)}), monthly_price = 500, credit_kes = 0, pay_intent = null, status = '${status}' where id = '${ids.bizA}'`);
const setIntent = (purpose = "upgrade", target = "premium") =>
  tx(c, asA, (k) => sql(k, `select seller_set_payment_intent('${purpose}', ${target ? `'${target}'` : "null"}, null, null)`), { commit: true });

test("money paid for an upgrade is applied as the upgrade, not eaten as a renewal month", async () => {
  await resetA();
  await setIntent();
  const due = (await tx(c, asA, async (k) => (await sql(k, `select seller_payment_instructions('upgrade', 'premium') as r`))[0].r)).amount_kes;
  assert.ok(due > 0);
  const before = await paidUntil("A");
  const r = await pay("ES100001", due);
  assert.equal(r.outcome, "applied");
  const b = await row(`select plan_key, credit_kes::int as credit, pay_intent from businesses where id = '${ids.bizA}'`);
  assert.deepEqual(b, { plan_key: "premium", credit: 0, pay_intent: null });
  const p = await row(`select kind, status, source from payments where business_id = '${ids.bizA}' and kind = 'upgrade'`);
  assert.deepEqual(p, { kind: "upgrade", status: "confirmed", source: "auto" });
  assert.equal(await paidUntil("A"), before);
});

test("a part payment toward an upgrade is held, and the rest completes it", async () => {
  await resetA();
  await setIntent();
  const due = (await tx(c, asA, async (k) => (await sql(k, `select seller_payment_instructions('upgrade', 'premium') as r`))[0].r)).amount_kes;
  const renewals = async () => (await row(`select count(*)::int as n from payments where business_id = '${ids.bizA}' and kind = 'renewal' and source = 'auto'`)).n;
  const before = await renewals();
  const first = await pay("ES100001", Math.floor(due / 2));
  assert.equal(first.outcome, "held");
  assert.equal((await row(`select plan_key from businesses where id = '${ids.bizA}'`)).plan_key, "standard");
  assert.equal(await renewals(), before);
  const second = await pay("ES100001", due - Math.floor(due / 2));
  assert.equal(second.outcome, "applied");
  assert.equal((await row(`select plan_key from businesses where id = '${ids.bizA}'`)).plan_key, "premium");
});

test("an old intent (over 48 hours) is ignored, so the same payment renews", async () => {
  await resetA();
  await sql(c, `update businesses set pay_intent = jsonb_build_object('purpose', 'upgrade', 'target_plan', 'premium', 'set_at', now() - interval '3 days') where id = '${ids.bizA}'`);
  const r = await pay("ES100001", 500);
  assert.equal(r.outcome, "applied");
  assert.equal(r.months, 1);
  assert.equal((await row(`select plan_key from businesses where id = '${ids.bizA}'`)).plan_key, "standard");
});

test("an intent that no longer applies (listing expired) is cleared and the money renews the listing", async () => {
  await resetA(-40, "expired");
  await sql(c, `update businesses set pay_intent = jsonb_build_object('purpose', 'upgrade', 'target_plan', 'premium', 'set_at', now()) where id = '${ids.bizA}'`);
  const r = await pay("ES100001", 500);
  assert.equal(r.outcome, "applied");
  assert.equal((await row(`select pay_intent from businesses where id = '${ids.bizA}'`)).pay_intent, null);
  assert.equal((await row(`select status from businesses where id = '${ids.bizA}'`)).status, "live");
});

test("opening a renewal clears an upgrade intent; only the seller can set one", async () => {
  await resetA();
  await setIntent();
  assert.ok((await row(`select pay_intent from businesses where id = '${ids.bizA}'`)).pay_intent);
  await setIntent("renewal", null);
  assert.equal((await row(`select pay_intent from businesses where id = '${ids.bizA}'`)).pay_intent, null);
  await rejects(c, as("finance"), `select seller_set_payment_intent('upgrade', 'premium', null, null)`, [], /not_a_seller/);
});
