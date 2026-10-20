import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0024_admin_moderation_approvals.sql: moderation, catalogue, approvals and the expiry radar.
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const asSupport = { sub: SUPPORT };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });
const item1 = "20000000-0000-0000-0000-0000000000e1";
const item2 = "20000000-0000-0000-0000-0000000000e2";
const flag1 = "30000000-0000-0000-0000-0000000000f1";
const report1 = "40000000-0000-0000-0000-0000000000a1";
const chPhone = "50000000-0000-0000-0000-0000000000c1";
const chCat = "50000000-0000-0000-0000-0000000000c2";

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_0024" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test'), ('${SUPPORT}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'),
      ('${FINANCE}', 'finance', 'finance@test'), ('${SUPPORT}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
    insert into public.categories (id, name, grp, tier, sort) values ('salon', 'Salon', 'Beauty', 'A', 2);
    insert into items (id, business_id, name, price, price_type) values
      ('${item1}', '${ids.bizA}', 'Chocolate cake', 1800, 'fixed'), ('${item2}', '${ids.bizB}', 'Haircut', 300, 'fixed');
    insert into flags (id, business_id, item_id, reason, due_at) values ('${flag1}', '${ids.bizA}', '${item1}', 'Photo does not match', now() - interval '1 day');
    insert into reports (id, business_id, item_id, reason, details, reporter_hash) values ('${report1}', '${ids.bizA}', '${item1}', 'wrong_price', 'Cheaper elsewhere', 'abc');
    insert into change_requests (id, business_id, field, old_value, new_value) values
      ('${chPhone}', '${ids.bizA}', 'phone', '+254712345678', '+254700000001'),
      ('${chCat}', '${ids.bizB}', 'category_id', 'barber', 'salon');
  `);
});
after(async () => { await c.end(); });

test("moderation lists are for owner, reviewer and support; finance and sellers are refused", async () => {
  for (const who of [asAdmin, asReviewer, asSupport]) {
    const f = await call(who, `select admin_flags_query('open') as r`);
    assert.equal(f.total, 1);
    assert.equal(f.rows[0].business_name, "Shop A");
    assert.equal(f.rows[0].overdue, true, "a flag past its due date is overdue");
    const r = await call(who, `select admin_reports_query('open') as r`);
    assert.equal(r.total, 1);
    assert.equal(r.rows[0].open_for_business, 1);
  }
  await rejects(c, asFinance, `select admin_flags_query('open')`, [], /forbidden/);
  await rejects(c, asFinance, `select admin_moderation_counts()`, [], /forbidden/);
  await rejects(c, asA, `select admin_reports_query('open')`, [], /forbidden/);
  await rejects(c, asAdmin, `select admin_flags_query('bogus')`, [], /invalid_status/);
});

test("search narrows flags, and counts report what needs attention", async () => {
  assert.equal((await call(asAdmin, `select admin_flags_query('all', 'shop a') as r`)).total, 1);
  assert.equal((await call(asAdmin, `select admin_flags_query('all', 'nothing like this') as r`)).total, 0);
  const n = await call(asSupport, `select admin_moderation_counts() as r`);
  assert.equal(n.flags_open, 1);
  assert.equal(n.flags_overdue, 1);
  assert.equal(n.reports_open, 1);
});

test("a report can be reviewed or dismissed, and each change is audited once", async () => {
  await call(asSupport, `select admin_set_report_status($1, 'dismissed', 'Price is fine') as r`, [report1]);
  assert.equal((await call(asAdmin, `select admin_reports_query('open') as r`)).total, 0);
  assert.equal((await call(asAdmin, `select admin_reports_query('dismissed') as r`)).total, 1);
  await call(asSupport, `select admin_set_report_status($1, 'dismissed') as r`, [report1]); // same state: no second audit row
  const [{ n }] = await sql(c, `select count(*)::int as n from audit_log where action = 'report.status' and target_id = '${report1}'`);
  assert.equal(n, 1);
  await rejects(c, asFinance, `select admin_set_report_status($1, 'open')`, [report1], /forbidden/);
  await rejects(c, asAdmin, `select admin_set_report_status($1, 'bogus')`, [report1], /invalid_status/);
  await rejects(c, asAdmin, `select admin_set_report_status($1, 'open')`, ["99999999-0000-0000-0000-000000000000"], /not_found/);
});

test("raising a flag asks the seller a question with a due date", async () => {
  const id = await call(asReviewer, `select admin_raise_flag($1, $2, 'Missing photo', 'Please add a clear photo of this item.', 5) as r`, [ids.bizB, item2]);
  const [row] = await sql(c, `select seller_message, status, due_at > now() + interval '4 days' as due_ok from flags where id = '${id}'`);
  assert.equal(row.status, "open");
  assert.equal(row.due_ok, true);
  assert.match(row.seller_message, /clear photo/);
  await rejects(c, asReviewer, `select admin_raise_flag($1, $2, 'ab', 'Please add a photo.', 3)`, [ids.bizB, item2], /invalid_input/);
  await rejects(c, asReviewer, `select admin_raise_flag($1, $2, 'Wrong item', 'Please add a photo.', 3)`, [ids.bizB, item1], /not_found/); // item1 is shop A's
  await rejects(c, asReviewer, `select admin_raise_flag($1, null, 'Reason', 'Please add a photo.', 99)`, [ids.bizB], /invalid_input/);
  await rejects(c, asFinance, `select admin_raise_flag($1, null, 'Reason', 'Please add a photo.', 3)`, [ids.bizB], /forbidden/);
});

test("the catalogue lists items across businesses and filters by state", async () => {
  const all = await call(asSupport, `select admin_catalog_query() as r`);
  assert.equal(all.total, 2);
  const flagged = await call(asSupport, `select admin_catalog_query(null, 'flagged') as r`);
  // The previous test put a question to the seller about the haircut, so both items carry an open flag.
  assert.deepEqual(flagged.rows.map((r) => r.name).sort(), ["Chocolate cake", "Haircut"]);
  await sql(c, `update flags set status = 'resolved' where item_id = '${item2}'`);
  const stillFlagged = await call(asSupport, `select admin_catalog_query(null, 'flagged') as r`);
  assert.deepEqual(stillFlagged.rows.map((r) => r.name), ["Chocolate cake"]);
  assert.equal((await call(asSupport, `select admin_catalog_query('haircut') as r`)).total, 1);
  assert.equal((await call(asSupport, `select admin_catalog_query(null, 'all', 'salon') as r`)).total, 0);
  await rejects(c, asFinance, `select admin_catalog_query()`, [], /forbidden/);
  await rejects(c, asAdmin, `select admin_catalog_query(null, 'bogus')`, [], /invalid_state/);
});

test("bulk hide reuses the single-item rules: reason needed, audited per item", async () => {
  await rejects(c, asSupport, `select admin_bulk_set_items_hidden(array[$1::uuid, $2::uuid], true, 'x')`, [item1, item2], /reason_required/);
  const n = await call(asSupport, `select admin_bulk_set_items_hidden(array[$1::uuid, $2::uuid], true, 'Breaks listing rules') as r`, [item1, item2]);
  assert.equal(n, 2);
  assert.equal((await call(asSupport, `select admin_catalog_query(null, 'hidden') as r`)).total, 2);
  const [{ k }] = await sql(c, `select count(*)::int as k from audit_log where action = 'item.hide'`);
  assert.equal(k, 2);
  await call(asSupport, `select admin_bulk_set_items_hidden(array[$1::uuid, $2::uuid], false) as r`, [item1, item2]);
  assert.equal((await call(asSupport, `select admin_catalog_query(null, 'hidden') as r`)).total, 0);
  await rejects(c, asSupport, `select admin_bulk_set_items_hidden(array[]::uuid[], true, 'reason here')`, [], /invalid_input/);
  await rejects(c, asFinance, `select admin_bulk_set_items_hidden(array[$1::uuid], true, 'reason here')`, [item1], /forbidden/);
});

test("approvals are for owner and reviewer, pending first, with category names", async () => {
  for (const who of [asAdmin, asReviewer]) {
    const q = await call(who, `select admin_change_requests_query('pending') as r`);
    assert.equal(q.total, 2);
    const cat = q.rows.find((r) => r.field === "category_id");
    assert.equal(cat.old_label, "Barber");
    assert.equal(cat.new_label, "Salon");
  }
  await rejects(c, asSupport, `select admin_change_requests_query('pending')`, [], /forbidden/);
  await rejects(c, asFinance, `select admin_decide_change_request($1, true)`, [chPhone], /forbidden/);
  await rejects(c, asA, `select admin_change_requests_query('pending')`, [], /forbidden/);
});

test("approving applies the change, audits it and tells the seller; it cannot be decided twice", async () => {
  await call(asReviewer, `select admin_decide_change_request($1, true) as r`, [chPhone]);
  const [b] = await sql(c, `select phone from businesses where id = '${ids.bizA}'`);
  assert.equal(b.phone, "+254700000001");
  const [ch] = await sql(c, `select status, decided_at is not null as decided from change_requests where id = '${chPhone}'`);
  assert.deepEqual(ch, { status: "approved", decided: true });
  const [{ n }] = await sql(c, `select count(*)::int as n from audit_log where action = 'change.approve' and target_id = '${chPhone}'`);
  assert.equal(n, 1);
  const [{ m }] = await sql(c, `select count(*)::int as m from messages where business_id = '${ids.bizA}' and kind = 'change' and dedupe_key = 'change:${chPhone}'`);
  assert.equal(m, 1);
  await rejects(c, asReviewer, `select admin_decide_change_request($1, false, 'Changed my mind')`, [chPhone], /already_decided/);
});

test("rejecting needs a reason and leaves the business untouched; an inactive category is refused", async () => {
  await rejects(c, asReviewer, `select admin_decide_change_request($1, false, 'no')`, [chCat], /reason_required/);
  await call(asReviewer, `select admin_decide_change_request($1, false, 'Please apply again with your licence.') as r`, [chCat]);
  const [b] = await sql(c, `select category_id from businesses where id = '${ids.bizB}'`);
  assert.equal(b.category_id, "barber");

  const again = "50000000-0000-0000-0000-0000000000c3";
  await sql(c, `update categories set active = false where id = 'salon';
    insert into change_requests (id, business_id, field, old_value, new_value) values ('${again}', '${ids.bizB}', 'category_id', 'barber', 'salon')`);
  await rejects(c, asReviewer, `select admin_decide_change_request($1, true)`, [again], /invalid_category/);
});

test("the expiry radar lists lapsing and lapsed listings, nearest first, for any admin", async () => {
  await sql(c, `update businesses set paid_until = now() + interval '3 days' where id = '${ids.bizA}';
                update businesses set paid_until = now() - interval '2 days', status = 'expired' where id = '${ids.bizB}'`);
  for (const who of [asAdmin, asFinance, asSupport]) {
    const r = await call(who, `select admin_expiry_radar(30) as r`);
    assert.deepEqual(r.map((x) => x.name), ["Shop B", "Shop A"]);
    assert.equal(r[0].state, "expired");
    assert.equal(r[1].state, "active");
    assert.equal(r[1].days_left, 3);
  }
  const narrow = await call(asAdmin, `select admin_expiry_radar(1) as r`);
  assert.deepEqual(narrow.map((x) => x.name), ["Shop B"], "only listings due within the window are listed");
  await rejects(c, asA, `select admin_expiry_radar(30)`, [], /forbidden/);
});
