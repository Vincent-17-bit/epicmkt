import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0026_admin_plans.sql
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });
const benefits = (a = "Listed on EpicMKT") => JSON.stringify([a, "Contact buttons", "Opening hours"]);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_0026" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
    update businesses set monthly_price = 500 where id = '${ids.bizA}';
    update businesses set monthly_price = 1300 where id = '${ids.bizB}';
  `);
});
after(async () => { await c.end(); });

test("any admin lists plans with how many live businesses are on each; sellers cannot", async () => {
  const rows = await call(asReviewer, `select admin_plans_list() as r`);
  const std = rows.find((r) => r.plan_key === "standard");
  const prem = rows.find((r) => r.plan_key === "premium");
  assert.equal(std.live_businesses, 1);
  assert.equal(Number(std.live_monthly_kes), 500);
  assert.equal(prem.live_businesses, 1);
  assert.equal(Number(prem.live_monthly_kes), 1300);
  assert.ok(std.versions >= 1, "the seed wrote the first snapshot");
  await rejects(c, asA, `select admin_plans_list()`, [], /forbidden/);
});

test("owner and finance save plans; reviewers cannot", async () => {
  await rejects(c, asReviewer, `select admin_save_plan('barber', 'standard', 600, $1::jsonb, null, 'Inflation adjustment')`, [benefits()], /forbidden/);
  await call(asFinance, `select admin_save_plan('barber', 'standard', 600, $1::jsonb, 'Popular', 'Inflation adjustment') as r`, [benefits()]);
  const rows = await call(asAdmin, `select admin_plans_list() as r`);
  const std = rows.find((r) => r.plan_key === "standard");
  assert.equal(std.price_kes, 600);
  assert.equal(std.badge, "Popular");
});

test("a price change needs a reason; other edits do not; saving nothing writes nothing", async () => {
  await rejects(c, asFinance, `select admin_save_plan('barber', 'standard', 700, $1::jsonb, 'Popular', 'no')`, [benefits()], /reason_required/);
  const [{ before: v0 }] = await sql(c, `select count(*)::int as before from plan_versions where category_id = 'barber' and plan_key = 'standard'`);
  assert.equal(await call(asFinance, `select admin_save_plan('barber', 'standard', 600, $1::jsonb, 'Popular') as r`, [benefits()]), 0, "unchanged: no new version");
  await call(asFinance, `select admin_save_plan('barber', 'standard', 600, $1::jsonb, 'Popular') as r`, [benefits("Appear first in search")]);
  const [{ after: v1 }] = await sql(c, `select count(*)::int as after from plan_versions where category_id = 'barber' and plan_key = 'standard'`);
  assert.equal(v1, v0 + 1);
});

test("validation: price range, badge, exactly three sensible benefits, known plan", async () => {
  const reason = "'Reason given'";
  await rejects(c, asFinance, `select admin_save_plan('barber', 'standard', -1, $1::jsonb, null, ${reason})`, [benefits()], /invalid_price/);
  await rejects(c, asFinance, `select admin_save_plan('barber', 'standard', 100001, $1::jsonb, null, ${reason})`, [benefits()], /invalid_price/);
  await rejects(c, asFinance, `select admin_save_plan('barber', 'standard', 600, $1::jsonb, 'Cheapest', ${reason})`, [benefits()], /invalid_badge/);
  await rejects(c, asFinance, `select admin_save_plan('barber', 'standard', 600, '["one","two"]'::jsonb, null, ${reason})`, [], /three_benefits_required/);
  await rejects(c, asFinance, `select admin_save_plan('barber', 'standard', 600, '["ok one","x","ok three"]'::jsonb, null, ${reason})`, [], /invalid_benefit/);
  await rejects(c, asFinance, `select admin_save_plan('nowhere', 'standard', 600, $1::jsonb, null, ${reason})`, [benefits()], /plan_not_found/);
});

test("history keeps every version with its reason and who made it, newest first", async () => {
  await call(asAdmin, `select admin_save_plan('barber', 'premium', 1400, $1::jsonb, 'Best value', 'Added priority support') as r`, [benefits()]);
  const h = await call(asReviewer, `select admin_plan_history('barber', 'premium') as r`);
  assert.equal(h[0].price_kes, 1400);
  assert.equal(h[0].reason, "Added priority support");
  assert.equal(h[0].changed_by_email, "owner@test");
  assert.ok(h.length >= 2);
  assert.ok(h[1].price_kes !== 1400, "the earlier price is still on record");
  await rejects(c, asA, `select admin_plan_history('barber', 'premium')`, [], /forbidden/);
  await rejects(c, asFinance, `select * from plan_versions`, [], /permission denied/);
});

test("the audit log records plan changes with before and after", async () => {
  const [row] = await sql(c, `select before->>'price_kes' as b, after->>'price_kes' as a, reason from audit_log where action = 'plan.update' and target_id = 'barber:premium'`);
  assert.equal(row.a, "1400");
  assert.ok(row.b);
  assert.equal(row.reason, "Added priority support");
});
