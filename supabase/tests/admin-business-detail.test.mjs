import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0023_admin_business_detail.sql: the business detail page's reads, hiding an item, and internal notes.
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const asSupport = { sub: SUPPORT };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });
const item = "20000000-0000-0000-0000-0000000000e1";

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test'), ('${SUPPORT}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'),
      ('${FINANCE}', 'finance', 'finance@test'), ('${SUPPORT}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
    update businesses set owner_name = 'Alice Njeri', strikes = 1 where id = '${ids.bizA}';
    insert into items (id, business_id, name, price, price_type) values ('${item}', '${ids.bizA}', 'Chocolate cake', 1800, 'fixed');
    insert into flags (business_id, item_id, reason) values ('${ids.bizA}', '${item}', 'Photo does not match');
    insert into reports (business_id, item_id, reason, details, reporter_hash) values ('${ids.bizA}', '${item}', 'wrong_price', 'Cheaper elsewhere', 'abc');
    insert into payments (business_id, amount_kes, method, status, kind, mpesa_code, confirmed_at, created_at) values
      ('${ids.bizA}', 1300, 'mpesa', 'confirmed', 'renewal', 'AAA1111111', now() - interval '2 days', now() - interval '2 days'),
      ('${ids.bizA}', 1300, 'mpesa', 'submitted', 'renewal', 'BBB2222222', null, now() - interval '1 hour');
  `);
});
after(async () => { await c.end(); });

test("any admin reads the overview; a seller and an unknown id are refused", async () => {
  for (const who of [asAdmin, asReviewer, asFinance, asSupport]) {
    const r = await call(who, `select admin_business_detail($1) as r`, [ids.bizA]);
    assert.equal(r.business.id, ids.bizA);
    assert.equal(r.business.owner_name, "Alice Njeri");
    assert.equal(r.business.strikes, 1);
  }
  const r = await call(asAdmin, `select admin_business_detail($1) as r`, [ids.bizA]);
  assert.equal(r.stats.items, 1);
  assert.equal(r.stats.open_flags, 1);
  assert.equal(r.stats.open_reports, 1);
  assert.equal(r.stats.paid_total_kes, 1300, "only confirmed money counts");
  assert.equal(r.stats.payments_waiting, 1);
  await rejects(c, asA, `select admin_business_detail($1)`, [ids.bizA], /forbidden/);
  await rejects(c, asAdmin, `select admin_business_detail($1)`, ["99999999-0000-0000-0000-000000000000"], /not_found/);
});

test("payments come newest first, and finance may read them", async () => {
  const rows = await call(asFinance, `select admin_business_payments($1) as r`, [ids.bizA]);
  assert.deepEqual(rows.map((p) => p.mpesa_code), ["BBB2222222", "AAA1111111"]);
  await rejects(c, asA, `select admin_business_payments($1)`, [ids.bizA], /forbidden/);
});

test("items and flags are for moderators only: finance is refused", async () => {
  assert.equal((await call(asReviewer, `select admin_business_items($1) as r`, [ids.bizA])).length, 1);
  assert.equal((await call(asSupport, `select admin_business_flags($1) as r`, [ids.bizA])).flags.length, 1);
  const f = await call(asSupport, `select admin_business_flags($1) as r`, [ids.bizA]);
  assert.equal(f.flags[0].item_name, "Chocolate cake");
  assert.equal(f.reports[0].reason, "wrong_price");
  await rejects(c, asFinance, `select admin_business_items($1)`, [ids.bizA], /forbidden/);
  await rejects(c, asFinance, `select admin_business_flags($1)`, [ids.bizA], /forbidden/);
});

test("hiding an item needs a reason, is audited, tells the seller, and unhiding clears it", async () => {
  await rejects(c, asReviewer, `select admin_set_item_hidden($1, true, '')`, [item], /reason_required/);
  await rejects(c, asReviewer, `select admin_set_item_hidden($1, true, 'bad')`, [item], /reason_required/);
  await rejects(c, asFinance, `select admin_set_item_hidden($1, true, 'Misleading photo')`, [item], /forbidden/);

  await call(asReviewer, `select admin_set_item_hidden($1, true, 'Misleading photo') as r`, [item]);
  let row = (await sql(c, `select hidden_by_admin, admin_hide_reason from items where id = $1`, [item]))[0];
  assert.deepEqual(row, { hidden_by_admin: true, admin_hide_reason: "Misleading photo" });
  const audit = await sql(c, `select action, actor_email, reason, business_id from audit_log where target_id = $1 order by id`, [item]);
  assert.deepEqual(audit.map((a) => a.action), ["item.hide"]);
  assert.equal(audit[0].actor_email, "reviewer@test");
  assert.equal(audit[0].business_id, ids.bizA);
  const msg = await sql(c, `select kind, body from messages where business_id = $1 and kind = 'removal' and channel = 'in_app'`, [ids.bizA]);
  assert.equal(msg.length, 1);
  assert.match(msg[0].body, /Chocolate cake/, "the existing items trigger tells the seller, once");

  await call(asReviewer, `select admin_set_item_hidden($1, true, 'Misleading photo') as r`, [item]);
  assert.equal((await sql(c, `select count(*) n from audit_log where target_id = $1`, [item]))[0].n, "1", "hiding twice changes nothing and adds no audit row");

  await call(asSupport, `select admin_set_item_hidden($1, false) as r`, [item]);
  row = (await sql(c, `select hidden_by_admin, admin_hide_reason from items where id = $1`, [item]))[0];
  assert.deepEqual(row, { hidden_by_admin: false, admin_hide_reason: null });
  assert.deepEqual((await sql(c, `select action from audit_log where target_id = $1 order by id`, [item])).map((a) => a.action), ["item.hide", "item.unhide"]);
});

test("the activity tab shows this business's audit entries, newest first", async () => {
  const rows = await call(asFinance, `select admin_business_activity($1) as r`, [ids.bizA]);
  assert.deepEqual(rows.slice(0, 2).map((a) => a.action), ["item.unhide", "item.hide"]);
  assert.equal(rows[0].actor_email, "support@test");
});

test("notes: any admin adds, pinned come first, only the author or the owner deletes", async () => {
  const mine = await call(asFinance, `select admin_add_business_note($1, '  Called about renewal  ', false) as r`, [ids.bizA]);
  const other = await call(asSupport, `select admin_add_business_note($1, 'Prefers WhatsApp', true) as r`, [ids.bizA]);
  await rejects(c, asFinance, `select admin_add_business_note($1, '   ')`, [ids.bizA], /invalid_input/);
  await rejects(c, asA, `select admin_add_business_note($1, 'hi')`, [ids.bizA], /forbidden/);

  let notes = await call(asReviewer, `select admin_business_notes($1) as r`, [ids.bizA]);
  assert.deepEqual(notes.map((n) => n.body), ["Prefers WhatsApp", "Called about renewal"], "pinned first, and the text is trimmed");
  assert.equal(notes[1].author_email, "finance@test");

  await call(asReviewer, `select admin_set_business_note_pinned($1, true) as r`, [mine]);
  notes = await call(asReviewer, `select admin_business_notes($1) as r`, [ids.bizA]);
  assert.equal(notes.every((n) => n.pinned), true);

  await rejects(c, asFinance, `select admin_delete_business_note($1)`, [other], /forbidden/);
  await call(asFinance, `select admin_delete_business_note($1) as r`, [mine]);
  await call(asAdmin, `select admin_delete_business_note($1) as r`, [other]);
  assert.deepEqual(await call(asAdmin, `select admin_business_notes($1) as r`, [ids.bizA]), []);
  await rejects(c, asAdmin, `select admin_delete_business_note($1)`, [mine], /not_found/);
});

test("the notes table cannot be read or written directly", async () => {
  await rejects(c, asAdmin, `select * from business_notes`, [], /permission denied/);
});
