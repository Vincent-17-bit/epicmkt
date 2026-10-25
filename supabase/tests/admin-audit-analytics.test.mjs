import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0028_admin_audit_analytics.sql
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_0028" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
    update businesses set monthly_price = 500 where id = '${ids.bizA}';
    update businesses set monthly_price = 1300 where id = '${ids.bizB}';
    insert into audit_log (business_id, actor_role, actor_email, action, target_type, target_id, reason, created_at) values
      ('${ids.bizA}', 'admin', 'owner@test', 'payment.confirm', 'payment', 'p1', 'Matched M-Pesa code', now() - interval '2 days'),
      ('${ids.bizA}', 'admin', 'reviewer@test', 'item.hide', 'item', 'i1', 'Misleading photo', now() - interval '1 day'),
      ('${ids.bizB}', 'admin', 'reviewer@test', 'item.unhide', 'item', 'i2', null, now() - interval '1 hour'),
      (null, 'admin', 'owner@test', 'plan.update', 'plan', 'barber:standard', 'Price rise', now() - interval '40 days');
    insert into payments (business_id, amount_kes, method, status, kind, mpesa_code, confirmed_at, created_at) values
      ('${ids.bizA}', 500, 'mpesa', 'confirmed', 'renewal', 'AAA1111111', now() - interval '1 day', now() - interval '1 day'),
      ('${ids.bizB}', 1300, 'mpesa', 'confirmed', 'renewal', 'BBB2222222', now() - interval '3 days', now() - interval '3 days'),
      ('${ids.bizB}', 900, 'mpesa', 'submitted', 'renewal', 'CCC3333333', null, now());
  `);
});
after(async () => { await c.end(); });

test("any admin reads the audit log, newest first; a seller cannot", async () => {
  for (const who of [asAdmin, asReviewer, asFinance]) {
    const r = await call(who, `select admin_audit_query() as r`);
    assert.ok(r.total >= 4);
    assert.equal(r.rows[0].action, "item.unhide");
  }
  await rejects(c, asA, `select admin_audit_query()`, [], /forbidden/);
  await rejects(c, asA, `select admin_audit_groups()`, [], /forbidden/);
});

test("filters: action or action group, actor, search text, business name and date range", async () => {
  const q = (...args) => call(asAdmin, `select admin_audit_query($1, $2, $3, $4, $5) as r`, args);
  assert.equal((await q(null, "item", null, null, null)).total, 2, "a group matches every action under it");
  assert.equal((await q(null, "item.hide", null, null, null)).total, 1, "an exact action matches only itself");
  assert.equal((await q(null, null, "reviewer", null, null)).total, 2);
  assert.equal((await q("misleading", null, null, null, null)).total, 1);
  assert.equal((await q("shop b", null, null, null, null)).total, 1, "search reaches the business name");
  const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  assert.equal((await q(null, "plan", null, from, null)).total, 0, "the 40-day-old entry is outside the range");
  assert.equal((await q(null, "plan", null, null, null)).total, 1);
  await rejects(c, asAdmin, `select admin_audit_query(null, null, null, '2026-02-02', '2026-02-01')`, [], /invalid_range/);
});

test("paging and the group list", async () => {
  const page = await call(asAdmin, `select admin_audit_query(null, null, null, null, null, 2, 1) as r`);
  assert.equal(page.rows.length, 2);
  assert.ok(page.total >= 4);
  const groups = await call(asReviewer, `select admin_audit_groups() as r`);
  assert.deepEqual(groups.find((g) => g.group === "item"), { group: "item", n: 2 });
});

test("analytics: money for owner and finance, application funnel for owner and reviewer", async () => {
  const owner = await call(asAdmin, `select admin_analytics(30) as r`);
  assert.equal(owner.days, 30);
  assert.equal(owner.revenue_by_day.length, 30);
  assert.equal(Number(owner.revenue_total), 1800, "only confirmed payments count");
  assert.equal(Number(owner.mrr_kes), 1800);
  assert.equal(owner.businesses.live, 2);
  assert.equal(owner.businesses.premium_live, 1);
  assert.equal(owner.new_businesses_by_day.length, 30);
  const barber = owner.by_category.find((x) => x.id === "barber");
  assert.equal(barber.live, 2);
  assert.equal(Number(barber.monthly_kes), 1800);

  const fin = await call(asFinance, `select admin_analytics(30) as r`);
  assert.equal(Number(fin.revenue_total), 1800);
  assert.deepEqual(fin.funnel, {}, "finance does not see applications");

  const rev = await call(asReviewer, `select admin_analytics(30) as r`);
  assert.equal(rev.revenue_total, null);
  assert.deepEqual(rev.revenue_by_day, []);
  assert.equal(rev.mrr_kes, null);
  assert.equal(Number(rev.by_category.find((x) => x.id === "barber").monthly_kes), 0, "no money in the category table either");
  assert.equal(typeof rev.funnel.submitted, "number");
  await rejects(c, asA, `select admin_analytics(30)`, [], /forbidden/);
});

test("analytics windows are clamped and daily series are complete", async () => {
  assert.equal((await call(asAdmin, `select admin_analytics(1) as r`)).days, 7);
  assert.equal((await call(asAdmin, `select admin_analytics(9999) as r`)).days, 365);
  const r = await call(asAdmin, `select admin_analytics(7) as r`);
  assert.equal(r.revenue_by_day.length, 7);
  assert.equal(r.revenue_by_day.reduce((s, d) => s + Number(d.kes), 0), 1800);
});

// ---- time zone independence -----------------------------------------------------------------------------------------
// PostgREST lets a client choose the session zone ("Prefer: timezone=..."). The day series must not care. A 365 day window
// always spans 8 March, when Havana skips 00:00 to 01:00; unpinned, generate_series(date, date, interval) then drops the
// last day, which is today.
const withZone = (zone, days) => tx(c, asAdmin, async (k) => {
  await k.query(`select set_config('TimeZone', $1, true)`, [zone]);
  return (await sql(k, `select admin_analytics($1) as r`, [days]))[0].r;
}, { commit: true });

const ZONES = ["UTC", "America/Havana", "America/New_York", "America/Sao_Paulo", "America/St_Johns", "Europe/London",
  "Asia/Kathmandu", "Australia/Lord_Howe", "Pacific/Chatham", "Pacific/Apia", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

test("analytics returns the same complete day series whatever the session zone", async () => {
  for (const days of [7, 30, 365]) {
    const base = await withZone("UTC", days);
    assert.equal(base.revenue_by_day.length, days);
    assert.equal(base.revenue_by_day.at(-1).day, base.to, "the last day is today in Nairobi");
    for (const zone of ZONES) {
      const r = await withZone(zone, days);
      assert.deepEqual(r.revenue_by_day, base.revenue_by_day, `${zone} ${days}d revenue_by_day`);
      assert.deepEqual(r, base, `${zone} ${days}d whole result`);
    }
  }
});

test("control: without the pin the same query loses today in a midnight DST zone (so the pin is what protects us)", async () => {
  await sql(c, `alter function public.admin_analytics(integer) reset timezone`);
  try {
    const r = await withZone("America/Havana", 365);
    assert.ok(r.revenue_by_day.length < 365, `expected the unpinned series to drop a day, got ${r.revenue_by_day.length}`);
  } finally {
    await sql(c, `alter function public.admin_analytics(integer) set timezone to 'UTC'`);
  }
  assert.equal((await withZone("America/Havana", 365)).revenue_by_day.length, 365);
});
