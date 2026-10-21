import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const asFinance = { sub: FINANCE };
const asReviewer = { sub: REVIEWER };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });
const PAID = "2026-03-10T00:00:00+03:00";
const at = (days) => new Date(new Date(PAID).getTime() + days * 86400000 + 12 * 3600000).toISOString();

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${FINANCE}', 'finance@test'), ('${REVIEWER}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${FINANCE}', 'finance', 'finance@test'), ('${REVIEWER}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
    update businesses set paid_until = '${PAID}' where id = '${ids.bizA}';
  `);
});
after(async () => { await c.end(); });

const state = async (days) => (await sql(c, `select listing_state(paid_until, $1, grace_days) as s from businesses where id = $2`, [at(days), ids.bizA]))[0].s;
const visible = async () => (await sql(c, `select business_is_visible(b) as v from businesses b where id = $1`, [ids.bizA]))[0].v;

test("everyone gets the default grace of one day", async () => {
  assert.equal(await state(0), "active");
  assert.equal(await state(1), "grace");
  assert.equal(await state(2), "expired");
  assert.equal((await sql(c, `select listing_state($1, $2) as s`, [PAID, at(1)]))[0].s, "grace");
});

test("the owner changes the default, and it is validated and audited", async () => {
  const saved = await call(asAdmin, `select admin_save_settings($1::jsonb, 'busy month') as r`,
    [JSON.stringify({ graceDays: 3, strikeThreshold: 4, smsSender: "EpicMKT", quietStart: "22:00", quietEnd: "06:00" })]);
  assert.deepEqual(saved, { graceDays: 3, strikeThreshold: 4, smsSender: "EpicMKT", quietStart: "22:00", quietEnd: "06:00" });
  assert.equal(await state(3), "grace");
  assert.equal(await state(4), "expired");
  assert.equal((await sql(c, `select in_quiet_hours($1) as q`, ["2026-03-10T23:30:00+03:00"]))[0].q, true);
  assert.equal((await sql(c, `select in_quiet_hours($1) as q`, ["2026-03-10T12:00:00+03:00"]))[0].q, false);

  const bad = [
    { graceDays: 99 }, { graceDays: -1 }, { strikeThreshold: 0 }, { smsSender: "no spaces" }, { smsSender: "ab" },
    { quietStart: "25:00" }, { quietStart: "22:00", quietEnd: "22:00" },
  ];
  for (const patch of bad) {
    await rejects(c, asAdmin, `select admin_save_settings($1::jsonb)`,
      [JSON.stringify({ graceDays: 3, strikeThreshold: 4, smsSender: "EpicMKT", quietStart: "22:00", quietEnd: "06:00", ...patch })], /invalid_/);
  }
  for (const who of [asFinance, asReviewer, asA]) {
    await rejects(c, who, `select admin_get_settings()`, [], /forbidden/);
    await rejects(c, who, `select admin_save_settings('{}'::jsonb)`, [], /forbidden/);
  }
  const log = await sql(c, `select action, before, after, reason from audit_log where action = 'settings.update'`);
  assert.equal(log.length, 1);
  assert.equal(log[0].before.graceDays, 1);
  assert.equal(log[0].after.graceDays, 3);
  assert.equal(log[0].reason, "busy month");
  await call(asAdmin, `select admin_save_settings($1::jsonb) as r`,
    [JSON.stringify({ graceDays: 1, strikeThreshold: 3, smsSender: "EpicMKT", quietStart: "21:00", quietEnd: "07:00" })]);
});

test("one business gets more days; null goes back to the default; only finance and the owner may", async () => {
  await rejects(c, asReviewer, `select admin_set_business_grace($1, 5, 'asked')`, [ids.bizA], /forbidden/);
  await rejects(c, asFinance, `select admin_set_business_grace($1, 5, '  ')`, [ids.bizA], /reason_required/);
  await rejects(c, asFinance, `select admin_set_business_grace($1, 91, 'x')`, [ids.bizA], /invalid_grace_days/);
  await rejects(c, asFinance, `select admin_set_business_grace($1, 5, 'x')`, ["99999999-0000-0000-0000-000000000000"], /target_not_found/);

  const r = await call(asFinance, `select admin_set_business_grace($1, 5, 'Mama Njeri asked, pays Friday') as r`, [ids.bizA]);
  assert.equal(r.effective, 5);
  assert.equal(await state(5), "grace");
  assert.equal(await state(6), "expired");
  const other = await sql(c, `select listing_state(paid_until, $1, grace_days) as s from businesses where id = $2`, [at(2), ids.bizB]);
  assert.equal(other[0].s, "none");

  const log = await sql(c, `select actor_email, business_id, after from audit_log where action = 'business.grace'`);
  assert.equal(log.length, 1);
  assert.equal(log[0].actor_email, "finance@test");
  assert.equal(log[0].business_id, ids.bizA);
  assert.equal(log[0].after.graceDays, 5);

  const detail = await call(asAdmin, `select admin_business_detail($1) as r`, [ids.bizA]);
  assert.equal(detail.business.grace_days, 5);
  assert.equal(detail.business.grace_default, 1);
});

test("after grace the shop is hidden from customers, and a confirmed payment brings it back", async () => {
  await sql(c, `update businesses set grace_days = null where id = $1`, [ids.bizA]);
  assert.equal(await state(2), "expired");

  await sql(c, `update businesses set paid_until = now() - interval '5 days' where id = $1`, [ids.bizA]);
  assert.equal(await visible(), false, "expired: hidden");
  const [pay] = await sql(c, `insert into payments (business_id, amount_kes, method, status, kind, mpesa_code)
    values ($1, 500, 'mpesa', 'submitted', 'renewal', 'GRACE00001') returning id`, [ids.bizA]);
  await sql(c, `select payment_apply_confirmation($1, 'auto')`, [pay.id]);
  assert.equal(await visible(), true, "paid: live again");
  const [b] = await sql(c, `select status, listing_state(paid_until, now(), grace_days) as s from businesses where id = $1`, [ids.bizA]);
  assert.equal(b.status, "live");
  assert.equal(b.s, "active");
});

test("paying inside a longer grace carries on from the old date", async () => {
  await sql(c, `update businesses set paid_until = '${PAID}', grace_days = 5 where id = $1`, [ids.bizA]);
  const [pay] = await sql(c, `insert into payments (business_id, amount_kes, method, status, kind, mpesa_code)
    values ($1, 500, 'mpesa', 'submitted', 'renewal', 'GRACE00002') returning id`, [ids.bizA]);
  await sql(c, `select payment_apply_confirmation($1, 'admin', $2)`, [pay.id, at(4)]);
  const [row] = await sql(c, `select to_char(nairobi_day(paid_until), 'YYYY-MM-DD') as d from businesses where id = $1`, [ids.bizA]);
  assert.equal(row.d, "2026-04-10");
  await sql(c, `update businesses set paid_until = '${PAID}', grace_days = null where id = $1`, [ids.bizA]);
});

test("grace and expiry notices follow the business's own grace days", async () => {
  await sql(c, `update businesses set grace_days = 3 where id = $1`, [ids.bizA]);
  await sql(c, `select queue_billing_notices($1)`, [at(1)]);
  const grace = await sql(c, `select subject, body from messages where business_id = $1 and kind = 'grace' and channel = 'sms'`, [ids.bizA]);
  assert.equal(grace.length, 1);
  assert.match(grace[0].subject, /3 days of grace/);
  await sql(c, `select queue_billing_notices($1)`, [at(3)]);
  assert.equal((await sql(c, `select 1 from messages where business_id = $1 and kind = 'expiry'`, [ids.bizA])).length, 0, "still inside grace");
  await sql(c, `select queue_billing_notices($1)`, [at(4)]);
  assert.ok((await sql(c, `select 1 from messages where business_id = $1 and kind = 'expiry'`, [ids.bizA])).length > 0);
  await sql(c, `update businesses set grace_days = 0 where id = $1`, [ids.bizA]);
  assert.equal(await state(1), "expired", "no grace at all");
});
