import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin, asService } from "./db.mjs";
import { addCalendarMonth, categoryChangeQuote, listingState, daysLeft, buildPaymentInstructions } from "../../shared/src/billing.js";

let c;
const iso = (d) => d.toISOString().slice(0, 10);
const APP = "30000000-0000-0000-0000-0000000000a1";
const MPESA = { type: "paybill", number: "247247", name: "EpicMKT Ltd" };

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into categories (id, name, grp, tier, sort) values ('salon', 'Salon', 'Beauty', 'A', 2), ('kiosk', 'Kiosk', 'Retail', 'A', 3);
    insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
      ('salon', 'standard', 800, 3, '["a","b","c"]'), ('salon', 'premium', 2000, 6, '["a","b","c"]'),
      ('kiosk', 'standard', 300, 3, '["a","b","c"]'), ('kiosk', 'premium', 900, 6, '["a","b","c"]');
    insert into applications (id, reference_no, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
      phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, status)
    values ('${APP}', 'EPM-2026-ABC234', 'barber', 'standard', 450, '{}', 'A Owner', 'national_id', '1', '+254712345678', 'a@x.co', 'Shop A', false, 2020, 'S1', '2030-01-01',
      'Kisumu', 'Kisumu', 'Main', 0, 0, '+254712345678', '1', '1', true, 'approved');
    update businesses set application_id = '${APP}' where id = '${ids.bizA}';
  `);
});
after(async () => { await c.end(); });

const day = (offset) => `(public.nairobi_day(now()) + ${offset})`;
const setPaid = (biz, offsetDays, extra = "") => sql(c, `update businesses set paid_until = public.nairobi_midnight(${day(offsetDays)}) ${extra} where id = '${biz}'`);
const instr = (who, ...args) => tx(c, who, async (k) => (await sql(k, `select seller_payment_instructions(${args.map((a) => (a == null ? "null" : `'${a}'`)).join(", ")}) as r`))[0].r);
const submit = (who, code, ...rest) => tx(c, who, async (k) => (await sql(k, `select * from seller_submit_payment('${code}'${rest.map((a) => (a == null ? ", null" : `, '${a}'`)).join("")})`))[0], { commit: true });

test("calendar months: 31 Jan runs to 28 Feb, and SQL agrees with the JS helper", async () => {
  for (const d of ["2026-01-31", "2028-01-31", "2026-01-30", "2026-03-15", "2026-12-31", "2026-02-28", "2026-05-31"]) {
    const [{ r }] = await sql(c, `select to_char(public.add_calendar_month('${d}'::date), 'YYYY-MM-DD') as r`);
    assert.equal(r, iso(addCalendarMonth(d)), d);
  }
  assert.equal((await sql(c, `select public.add_calendar_month('2026-01-31'::date)::text as r`))[0].r, "2026-02-28");
});

test("grace is exactly one day after paid_until, in Nairobi time; SQL equals JS", async () => {
  const paid = "2026-10-05";
  const cases = [
    ["2026-10-05T20:59:00Z", "active"], ["2026-10-05T21:00:00Z", "grace"],
    ["2026-10-06T20:59:00Z", "grace"], ["2026-10-06T21:00:00Z", "expired"],
    ["2026-09-01T00:00:00Z", "active"],
  ];
  for (const [now, want] of cases) {
    const [{ r, left }] = await sql(c, `select public.listing_state(public.nairobi_midnight('${paid}'::date), '${now}') as r, public.days_left(public.nairobi_midnight('${paid}'::date), '${now}') as left`);
    assert.equal(r, want, now);
    assert.equal(r, listingState(paid, new Date(now)));
    assert.equal(left, daysLeft(paid, new Date(now)));
  }
  assert.equal((await sql(c, `select public.listing_state(null) as r`))[0].r, "none");
});

test("category quotes: SQL equals JS across a grid of dates and prices", async () => {
  const now = "2026-10-05T09:00:00Z";
  let checked = 0;
  for (const paid of ["2026-10-20", "2026-10-05", "2026-10-06", "2026-11-04", "2027-02-28", "2026-03-31"]) {
    for (const [o, n] of [[500, 800], [500, 501], [800, 500], [500, 500], [300, 900]]) {
      const [{ r }] = await sql(c, `select public.category_change_quote(${o}, ${n}, public.nairobi_midnight('${paid}'::date), '${now}') as r`);
      assert.deepEqual(r, categoryChangeQuote({ oldPrice: o, newPrice: n, paidUntil: paid, now: new Date(now) }), `${paid} ${o}->${n}`);
      checked += 1;
    }
  }
  assert.equal(checked, 30);
  const [{ r }] = await sql(c, `select public.category_change_quote(500, 800, public.nairobi_midnight('2026-10-20'::date), '${now}') as r`);
  assert.equal(r.extraDueNow, 150);
});

test("the payment card: account number and amount in every case", async () => {
  await sql(c, `delete from site_settings`);
  // Paybill setting missing: the seller is told details will come by SMS, nothing leaks.
  const missing = await instr(asA);
  assert.equal(missing.configured, false);
  assert.equal(missing.number, null);
  await rejects(c, asA, `select * from site_settings`, [], /permission denied|row-level/).catch(async () => {
    assert.equal((await tx(c, asA, (k) => sql(k, `select * from site_settings`))).length, 0);
  });
  await sql(c, `insert into site_settings (key, value) values ('mpesa', '${JSON.stringify(MPESA)}')`);

  // First payment: the application's pay reference and the price at submission (450), not today's plan price (500).
  const first = await instr(asA);
  assert.equal(first.purpose, "first");
  assert.equal(first.account, "EPM-2026-ABC234");
  assert.equal(first.amount_kes, 450);
  assert.equal(first.number, "247247");
  assert.equal(first.name, "EpicMKT Ltd");
  assert.equal(first.configured, true);

  // Renewal: the Seller ID and the CURRENT plan price.
  await setPaid(ids.bizA, 5);
  const renewal = await instr(asA);
  assert.deepEqual([renewal.purpose, renewal.account, renewal.amount_kes], ["renewal", "ES100001", 500]);
  const renewalB = await instr(asB, "renewal");
  assert.deepEqual([renewalB.account, renewalB.amount_kes], ["ES100002", 1500]);

  // Upgrade: prorated difference for the days left in the month.
  await setPaid(ids.bizA, 15);
  const up = await instr(asA, "upgrade", "premium");
  const [{ paid }] = await sql(c, `select paid_until::text as paid from businesses where id = '${ids.bizA}'`);
  const expectUp = categoryChangeQuote({ oldPrice: 500, newPrice: 1500, paidUntil: new Date(paid) }).extraDueNow;
  assert.equal(up.amount_kes, expectUp);
  assert.equal(up.account, "ES100001");
  assert.equal(up.plan_key, "premium");
  await rejects(c, asB, `select seller_payment_instructions('upgrade', 'premium')`, [], /invalid_upgrade/);

  // Category change: dearer costs the prorated difference, cheaper nothing now.
  const dearer = await instr(asA, "category_change", null, "salon");
  assert.equal(dearer.amount_kes, categoryChangeQuote({ oldPrice: 500, newPrice: 800, paidUntil: new Date(paid) }).extraDueNow);
  assert.equal((await instr(asA, "category_change", null, "kiosk")).amount_kes, 0);

  // The server and the JS builder agree.
  const js = buildPaymentInstructions({
    business: { sellerId: "ES100001", planKey: "standard", categoryId: "barber", paidUntil: new Date(paid), hasConfirmedPayment: true },
    priceOf: (cat, plan) => ({ barber: { standard: 500, premium: 1500 }, salon: { standard: 800, premium: 2000 }, kiosk: { standard: 300, premium: 900 } })[cat]?.[plan] ?? null,
    setting: MPESA, purpose: "upgrade", targetPlan: "premium",
  });
  assert.equal(js.amount, up.amount_kes);
  assert.equal(js.account, up.account);
});

test("upgrade and dearer category need an active subscription first", async () => {
  await setPaid(ids.bizA, -5);
  await rejects(c, asA, `select seller_payment_instructions('upgrade', 'premium')`, [], /renew_first/);
  await rejects(c, asA, `select seller_payment_instructions('category_change', null, 'salon')`, [], /renew_first/);
  await rejects(c, asA, `select seller_request_change('category_id', 'salon')`, [], /renew_first/);
  assert.equal((await instr(asA, "category_change", null, "kiosk")).amount_kes, 0);
  await setPaid(ids.bizA, 15);
});

test("I have paid: normalises the code, refuses a code used by another business", async () => {
  for (const bad of ["SHORT", "ABCDEFGHI!", "ABCDEFGHIJK", ""]) {
    await rejects(c, asA, `select seller_submit_payment($1)`, [bad], /invalid_code_format/);
  }
  const a = await submit(asA, " qwe1rty2uio ".trim().slice(0, 10));
  assert.equal(a.status, "submitted");
  assert.equal(a.mpesa_code, "QWE1RTY2UI");
  assert.equal(a.kind, "renewal");
  assert.equal(a.amount_kes, 500);
  assert.equal(a.account_ref, "ES100001");
  assert.equal(a.receipt_no, null);

  await rejects(c, asB, `select seller_submit_payment('QWE1RTY2UI')`, [], /code_already_used/);
  await rejects(c, asB, `select seller_submit_payment('qwe1rty2ui')`, [], /code_already_used/);
  assert.equal((await sql(c, `select count(*)::int as n from payments where mpesa_code = 'QWE1RTY2UI'`))[0].n, 1);

  const again = await submit(asA, "QWE1RTY2UI");
  assert.equal(again.id, a.id);
  await rejects(c, asA, `select seller_submit_payment('ZZZ1ZZZ2ZZ')`, [], /payment_already_submitted/);

  const err = await rejects(c, asB, `select seller_submit_payment('QWE1RTY2UI')`, [], /code_already_used/);
  assert.ok(!/ES100001|Shop A/.test(err.message), "the error must not reveal the other business");
  await rejects(c, asA, `insert into payments (business_id, amount_kes, status) values ('${ids.bizA}', 1, 'confirmed')`, [], /row-level security/);
  await rejects(c, asA, `update payments set status = 'confirmed'`, [], /./).catch(() => {});
  assert.equal((await tx(c, asA, (k) => k.query(`update payments set status = 'confirmed'`))).rowCount, 0);
});

test("a rejected code can be submitted again", async () => {
  const [{ id }] = await sql(c, `select id from payments where mpesa_code = 'QWE1RTY2UI'`);
  await rejects(c, asA, `select admin_reject_payment('${id}')`, [], /not_an_admin/);
  await tx(c, asAdmin, (k) => k.query(`select admin_reject_payment('${id}', 'No such transaction')`), { commit: true });
  const msg = await sql(c, `select subject, body from messages where business_id = '${ids.bizA}' and kind = 'payment' order by created_at desc limit 1`);
  assert.match(msg[0].subject, /could not match/);
  const retry = await submit(asA, "QWE1RTY2UI");
  assert.equal(retry.status, "submitted");
  assert.notEqual(retry.id, id);
});

test("confirmation: calendar month, grace, receipt number, one place for admin and auto", async () => {
  const [{ id }] = await sql(c, `select id from payments where business_id = '${ids.bizA}' and status = 'submitted'`);
  await rejects(c, asA, `select admin_confirm_payment('${id}')`, [], /not_an_admin/);
  await rejects(c, asA, `select payment_apply_confirmation('${id}')`, [], /permission denied/);

  // 31 Jan paid_until, renewed on 31 Jan: runs to 28 Feb.
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-01-31'::date) where id = '${ids.bizA}'`);
  const p = (await sql(c, `select * from payment_apply_confirmation('${id}', 'admin', '2026-01-31T09:00:00Z')`))[0];
  assert.equal(p.status, "confirmed");
  assert.equal(iso(p.period_start), "2026-01-31");
  assert.equal(iso(p.period_end), "2026-02-28");
  assert.match(p.receipt_no, /^EPM-R-\d{4}-\d{6}$/);
  assert.equal(p.confirmed_via, "admin");
  const [{ paid }] = await sql(c, `select public.nairobi_day(paid_until)::text as paid from businesses where id = '${ids.bizA}'`);
  assert.equal(paid, "2026-02-28");
  const same = (await sql(c, `select * from payment_apply_confirmation('${id}', 'admin', '2026-01-31T09:00:00Z')`))[0];
  assert.equal(same.receipt_no, p.receipt_no);
  assert.equal((await sql(c, `select count(*)::int as n from messages where dedupe_key = 'payment:${id}'`))[0].n, 1);
  await rejects(c, asAdmin, `update payments set status = 'submitted' where id = '${id}'`, [], /payment_already_confirmed/);
});

test("renewal during grace extends from paid_until, after expiry starts today, first payment goes live", async () => {
  const mk = async (biz, code, kind = "renewal") => (await sql(c, `insert into payments (business_id, amount_kes, status, kind, mpesa_code, source, submitted_at)
    values ('${biz}', 500, 'submitted', '${kind}', '${code}', 'seller', now()) returning id`))[0].id;
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-10-05'::date) where id = '${ids.bizB}'`);
  let id = await mk(ids.bizB, "GRACE00001");
  let p = (await sql(c, `select * from payment_apply_confirmation('${id}', 'admin', '2026-10-06T10:00:00Z')`))[0];
  assert.deepEqual([iso(p.period_start), iso(p.period_end)], ["2026-10-05", "2026-11-05"]);

  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-10-05'::date), status = 'expired' where id = '${ids.bizB}'`);
  id = await mk(ids.bizB, "EXPIRED001");
  p = (await sql(c, `select * from payment_apply_confirmation('${id}', 'auto', '2026-10-20T10:00:00Z')`))[0];
  assert.deepEqual([iso(p.period_start), iso(p.period_end)], ["2026-10-20", "2026-11-20"]);
  assert.equal(p.confirmed_via, "auto");
  assert.equal((await sql(c, `select status from businesses where id = '${ids.bizB}'`))[0].status, "live");

  await sql(c, `update businesses set paid_until = null, status = 'pending' where id = '${ids.bizB}'`);
  id = await mk(ids.bizB, "FIRST00001", "first");
  await sql(c, `select payment_apply_confirmation('${id}', 'admin', '2026-03-31T10:00:00Z')`);
  const [b] = await sql(c, `select status, public.nairobi_day(paid_until)::text as paid from businesses where id = '${ids.bizB}'`);
  assert.deepEqual([b.status, b.paid], ["live", "2026-04-30"]);
  const receipts = await sql(c, `select receipt_no from payments where receipt_no is not null`);
  assert.equal(new Set(receipts.map((r) => r.receipt_no)).size, receipts.length);
});

test("a suspended seller keeps the payment card, I have paid, and the upgrade", async () => {
  await setPaid(ids.bizA, 10, ", status = 'suspended'");
  assert.equal((await instr(asA)).configured, true);
  const p = await submit(asA, "SUSPEND001");
  assert.equal(p.status, "submitted");
  await tx(c, asService, (k) => k.query(`select payment_apply_confirmation('${p.id}')`), { commit: true });
  assert.equal((await sql(c, `select status from businesses where id = '${ids.bizA}'`))[0].status, "suspended");
  await sql(c, `update businesses set status = 'paused' where id = '${ids.bizA}'`);
  assert.equal((await instr(asA)).purpose, "renewal");
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
});

test("upgrade confirms into Premium without moving paid_until; category change waits for approval", async () => {
  await setPaid(ids.bizA, 12);
  const [{ before }] = await sql(c, `select paid_until::text as before from businesses where id = '${ids.bizA}'`);
  const up = await submit(asA, "UPGRADE001", "upgrade", "premium");
  assert.equal(up.kind, "upgrade");
  await tx(c, asAdmin, (k) => k.query(`select admin_confirm_payment('${up.id}')`), { commit: true });
  const [b] = await sql(c, `select plan_key, paid_until::text as after from businesses where id = '${ids.bizA}'`);
  assert.deepEqual([b.plan_key, b.after], ["premium", before]);
  await sql(c, `update businesses set plan_key = 'standard' where id = '${ids.bizA}'`);

  const ch = await tx(c, asA, async (k) => (await sql(k, `select * from seller_request_change('category_id', 'salon')`))[0], { commit: true });
  assert.equal(ch.status, "pending");
  assert.ok(ch.extra_due_kes > 0);
  assert.equal(ch.applies_from_next_renewal, true);
  assert.equal(ch.new_monthly_price, 800);
  await rejects(c, asA, `select seller_submit_payment('CATEGORY01', 'category_change', null, 'salon', null)`, [], /change_not_found/);
  const pay = await submit(asA, "CATEGORY01", "category_change", null, "salon", ch.id);
  assert.equal(pay.amount_kes, ch.extra_due_kes);
  await tx(c, asAdmin, (k) => k.query(`select admin_confirm_payment('${pay.id}')`), { commit: true });
  assert.equal((await sql(c, `select category_id from businesses where id = '${ids.bizA}'`))[0].category_id, "barber");
  assert.equal((await sql(c, `select status from change_requests where id = '${ch.id}'`))[0].status, "pending");
  await tx(c, asA, (k) => k.query(`select seller_cancel_change('${ch.id}')`), { commit: true });

  const cheaper = await tx(c, asA, async (k) => (await sql(k, `select * from seller_request_change('category_id', 'kiosk')`))[0], { commit: true });
  assert.equal(cheaper.extra_due_kes, 0);
  assert.equal(cheaper.applies_from_next_renewal, true);
  assert.equal(cheaper.new_monthly_price, 300);
  await rejects(c, asA, `select seller_submit_payment('CHEAPER001', 'category_change', null, 'kiosk', '${cheaper.id}')`, [], /nothing_to_pay/);
  await sql(c, `update change_requests set status = 'rejected', admin_note = 'Not allowed' where id = '${cheaper.id}'`);
  const note = await sql(c, `select subject, body from messages where kind = 'change' and business_id = '${ids.bizA}'`);
  assert.match(note[0].subject, /declined/);
  const quote = await tx(c, asA, async (k) => (await sql(k, `select seller_quote_category_change('salon') as q`))[0].q);
  assert.equal(quote.dearer, true);
  assert.equal(quote.newMonthlyPrice, 800);
});

test("automatic matching plugs in without touching the UI contract", async () => {
  await setPaid(ids.bizB, 10);
  const p = await submit(asB, "AUTOMATCH1");
  const low = (await sql(c, `select payment_match_incoming('AUTOMATCH1', 100, 'ES100002') as r`))[0].r;
  assert.deepEqual([low.matched, low.reason], [false, "amount_mismatch"]);
  const wrong = (await sql(c, `select payment_match_incoming('AUTOMATCH1', 1500, 'ES999999') as r`))[0].r;
  assert.equal(wrong.reason, "account_mismatch");
  assert.equal((await sql(c, `select payment_match_incoming('NOSUCHCODE', 1500) as r`))[0].r.reason, "no_submission");
  const ok = (await sql(c, `select payment_match_incoming('automatch1', 1500, 'es100002') as r`))[0].r;
  assert.equal(ok.matched, true);
  const [row] = await tx(c, asB, (k) => sql(k, `select status, confirmed_via, receipt_no from payments where id = '${p.id}'`));
  assert.deepEqual([row.status, row.confirmed_via], ["confirmed", "auto"]);
  await rejects(c, asB, `select payment_match_incoming('AUTOMATCH1', 1500)`, [], /permission denied/);
});

test("notifications: reminders at 7, 3 and 1 day, grace, expiry, each once", async () => {
  await sql(c, `delete from messages`);
  const at = async (offset) => {
    await setPaid(ids.bizA, offset);
    return (await sql(c, `select generate_billing_notices(now()) as n`))[0].n;
  };
  await sql(c, `update businesses set paid_until = null where id = '${ids.bizB}'`);
  for (const [off, kind] of [[7, "reminder"], [3, "reminder"], [1, "reminder"], [-1, "grace"], [-3, "expiry"]]) {
    assert.equal(await at(off), 1, `offset ${off}`);
    assert.equal(await at(off), 0, `offset ${off} repeated`);
    assert.ok((await sql(c, `select 1 from messages where business_id = '${ids.bizA}' and kind = '${kind}'`)).length >= 1);
  }
  assert.equal(await at(5), 0);
  assert.equal(await at(0), 0);
  const kinds = (await sql(c, `select kind, count(*)::int as n from messages where business_id = '${ids.bizA}' group by kind order by kind`));
  assert.deepEqual(kinds, [{ kind: "expiry", n: 1 }, { kind: "grace", n: 1 }, { kind: "reminder", n: 3 }]);
  await rejects(c, asA, `select generate_billing_notices()`, [], /permission denied/);
  await setPaid(ids.bizA, 20);
});

test("customer reports reach the seller without the reporter's identity", async () => {
  await sql(c, `delete from messages`);
  const [{ id: item }] = await sql(c, `insert into items (business_id, name, price) values ('${ids.bizA}', 'Fade cut', 300) returning id`);
  await sql(c, `insert into reports (business_id, item_id, reason, details, reporter_hash) values ('${ids.bizA}', '${item}', 'wrong-price', 'I am Jane Doe, 0712 000 000', 'hash-of-jane')`);
  await sql(c, `insert into reports (business_id, item_id, reason, reporter_hash) values ('${ids.bizA}', '${item}', 'wrong-price', 'another-hash')`);
  const msgs = await tx(c, asA, (k) => sql(k, `select * from messages where kind = 'report'`));
  assert.equal(msgs.length, 1, "same report on the same day is grouped");
  const text = JSON.stringify(msgs[0]);
  assert.match(msgs[0].subject, /wrong price reported/i);
  assert.match(msgs[0].body, /Fade cut/);
  for (const secret of ["Jane", "0712", "hash-of", "another-hash", "reporter"]) assert.ok(!text.includes(secret), secret);
  assert.equal((await tx(c, asB, (k) => sql(k, `select * from messages`))).length, 0);
});

test("approval, removal and change decisions notify; read state and mark all read", async () => {
  await sql(c, `delete from messages`);
  await sql(c, `update businesses set status = 'pending' where id = '${ids.bizA}'; update businesses set status = 'live' where id = '${ids.bizA}'`);
  const [{ id: item }] = await sql(c, `select id from items where business_id = '${ids.bizA}' limit 1`);
  await sql(c, `update items set removed_by_admin = true, admin_reason = 'Not allowed' where id = '${item}'`);
  const kinds = (await tx(c, asA, (k) => sql(k, `select kind from messages order by kind`))).map((r) => r.kind);
  assert.deepEqual(kinds, ["approval", "removal"]);

  await sql(c, `insert into messages (business_id, kind, subject, body) values ('${ids.bizA}', 'strike', 'Strike 1', 'x'), ('${ids.bizB}', 'strike', 'B', 'x')`);
  const [unread] = await tx(c, asA, (k) => sql(k, `select count(*)::int as n from messages where read_at is null`));
  assert.equal(unread.n, 3);
  const [{ id: one }] = await tx(c, asA, (k) => sql(k, `select id from messages where kind = 'strike'`));
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_mark_read(array['${one}']::uuid[]) as n`), { commit: true }))[0].n, 1);
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_mark_read(array['${one}']::uuid[]) as n`)))[0].n, 0, "already read");
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_mark_read() as n`), { commit: true }))[0].n, 2);
  assert.equal((await sql(c, `select count(*)::int as n from messages where business_id = '${ids.bizB}' and read_at is null`))[0].n, 1, "another seller's messages stay unread");
  await rejects(c, asA, `update messages set body = 'x'`, [], /./).catch(() => {});
  assert.equal((await tx(c, asA, (k) => k.query(`update messages set body = 'x'`))).rowCount, 0);
});

test("questions: reply rules, other seller's flag refused, proofs", async () => {
  await sql(c, `delete from messages; delete from flags`);
  const [{ id: item }] = await sql(c, `select id from items where business_id = '${ids.bizA}' limit 1`);
  const [{ id: faq }] = await sql(c, `insert into faqs (business_id, question, answer) values ('${ids.bizA}', 'Do you deliver?', 'Yes') returning id`);
  const mk = async (extra = "") => (await sql(c, `insert into flags (business_id, item_id, reason, seller_message, due_at ${extra ? ", " + extra.split("|")[0] : ""}) values ('${ids.bizA}', '${item}', 'check price', 'Please send proof of your price.', now() + interval '3 days' ${extra ? ", " + extra.split("|")[1] : ""}) returning id`))[0].id;
  const f1 = await mk();
  const qf = (await sql(c, `insert into flags (business_id, faq_id, reason, seller_message) values ('${ids.bizA}', '${faq}', 'faq', 'Is delivery really free?') returning id`))[0].id;
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from messages where kind = 'question'`))).length, 2);

  await rejects(c, asB, `select seller_reply_flag('${f1}', 'My answer')`, [], /not_found_or_not_open/);
  assert.equal((await tx(c, asB, (k) => sql(k, `select * from flags`))).length, 0);
  for (const bad of ["x", "y".repeat(501), "bad\u0007text", "   "]) await rejects(c, asA, `select seller_reply_flag($1, $2)`, [f1, bad], /invalid_reply/);

  const ok = await tx(c, asA, async (k) => (await sql(k, `select * from seller_reply_flag('${f1}', '${"a".repeat(500)}')`))[0], { commit: true });
  assert.equal(ok.status, "replied");
  assert.equal(ok.seller_reply.length, 500);
  await rejects(c, asA, `select seller_reply_flag('${f1}', 'twice')`, [], /not_found_or_not_open/);
  const plain = await tx(c, asA, async (k) => (await sql(k, `select * from seller_reply_flag('${qf}', '<b>Free</b> & fine')`))[0], { commit: true });
  assert.equal(plain.seller_reply, "<b>Free</b> & fine", "stored as plain text, rendered escaped by the UI");
});

test("proof attachments: limit of 3, no path for sellers, no storage access, pending blocks reply, retention", async () => {
  const [{ id: item }] = await sql(c, `select id from items where business_id = '${ids.bizA}' limit 1`);
  const flag = (await sql(c, `insert into flags (business_id, item_id, reason, seller_message) values ('${ids.bizA}', '${item}', 'proof', 'Send a receipt') returning id`))[0].id;
  const add = (n, status = "ready") => sql(c, `insert into flag_attachments (flag_id, business_id, path, original_name, mime, size_bytes, status)
    values ('${flag}', '${ids.bizA}', '${ids.bizA}/${flag}/file${n}.pdf', 'receipt${n}.pdf', 'application/pdf', 1000, '${status}')`);
  await add(1, "pending");
  await rejects(c, asA, `select seller_reply_flag('${flag}', 'Here it is')`, [], /attachments_pending/);
  await sql(c, `update flag_attachments set status = 'ready'`);
  await add(2); await add(3);
  await assert.rejects(add(4), /attachments_limit/);
  assert.equal((await sql(c, `select count(*)::int as n from flag_attachments where flag_id = '${flag}'`))[0].n, 3);

  const rows = await tx(c, asA, (k) => sql(k, `select id, original_name, mime, size_bytes from flag_attachments where flag_id = '${flag}' order by original_name`));
  assert.deepEqual(rows.map((r) => r.original_name), ["receipt1.pdf", "receipt2.pdf", "receipt3.pdf"]);
  await rejects(c, asA, `select path from flag_attachments`, [], /permission denied/);
  await rejects(c, asA, `select * from flag_attachments`, [], /permission denied/);
  assert.equal((await tx(c, asB, (k) => sql(k, `select id from flag_attachments`))).length, 0);
  await rejects(c, asA, `insert into flag_attachments (flag_id, business_id, path, original_name, mime, size_bytes) values ('${flag}', '${ids.bizA}', 'x', 'x.pdf', 'application/pdf', 1)`, [], /permission denied/);
  await rejects(c, asA, `delete from flag_attachments`, [], /permission denied/);

  // Sellers cannot read, list, write or delete proof objects.
  const [bucket] = await sql(c, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'seller-proofs'`);
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 8 * 1024 * 1024);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), ["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  await sql(c, `insert into storage.objects (bucket_id, name) values ('seller-proofs', '${ids.bizA}/${flag}/file2.pdf')`);
  assert.equal((await tx(c, asA, (k) => sql(k, `select name from storage.objects where bucket_id = 'seller-proofs'`))).length, 0);
  assert.equal((await tx(c, asB, (k) => sql(k, `select name from storage.objects where bucket_id = 'seller-proofs'`))).length, 0);
  await rejects(c, asA, `insert into storage.objects (bucket_id, name) values ('seller-proofs', '${ids.bizA}/${flag}/sneaky.pdf')`, [], /row-level security/);
  assert.equal((await tx(c, asA, (k) => k.query(`delete from storage.objects where bucket_id = 'seller-proofs'`))).rowCount, 0);
  assert.equal((await tx(c, asA, (k) => k.query(`update storage.objects set name = 'x' where bucket_id = 'seller-proofs'`))).rowCount, 0);

  // Reply with files works; retention is 90 days after the flag is resolved.
  await tx(c, asA, (k) => k.query(`select seller_reply_flag('${flag}', 'Receipt attached')`), { commit: true });
  assert.equal((await sql(c, `select count(*)::int as n from proofs_due_for_purge(now())`))[0].n, 0);
  await sql(c, `update flags set status = 'resolved' where id = '${flag}'`);
  assert.equal((await sql(c, `select count(*)::int as n from proofs_due_for_purge(now() + interval '89 days')`))[0].n, 0);
  assert.equal((await sql(c, `select count(*)::int as n from proofs_due_for_purge(now() + interval '91 days')`))[0].n, 3);
  await sql(c, `update flags set status = 'open' where id = '${flag}'`);
  assert.equal((await sql(c, `select count(*)::int as n from proofs_due_for_purge(now() + interval '400 days')`))[0].n, 0, "reopening clears the retention clock");
  await rejects(c, asA, `select * from proofs_due_for_purge()`, [], /permission denied/);
});

test("suspended and unlisted sellers can still reply and read notifications", async () => {
  for (const status of ["suspended", "paused", "expired"]) {
    await sql(c, `update businesses set status = '${status}' where id = '${ids.bizA}'`);
    const f = (await sql(c, `insert into flags (business_id, reason, seller_message) values ('${ids.bizA}', 'question', 'Still there?') returning id`))[0].id;
    const r = await tx(c, asA, async (k) => (await sql(k, `select * from seller_reply_flag('${f}', 'Yes, still here')`))[0], { commit: true });
    assert.equal(r.status, "replied", status);
    assert.ok((await tx(c, asA, (k) => sql(k, `select * from messages`))).length > 0);
    assert.equal(typeof (await tx(c, asA, (k) => sql(k, `select seller_mark_read() as n`)))[0].n, "number");
  }
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
});

test("realtime is on for the rows the page watches", async () => {
  const rows = await sql(c, `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
  for (const t of ["payments", "messages", "businesses", "flags", "flag_attachments"]) assert.ok(rows.some((r) => r.tablename === t), t);
});
