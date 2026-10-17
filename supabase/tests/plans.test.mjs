import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asAdmin } from "./db.mjs";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let c;

const U = {
  finance: "00000000-0000-0000-0000-0000000000d2",
  reviewer: "00000000-0000-0000-0000-0000000000d1",
};
const as = { finance: { sub: U.finance }, reviewer: { sub: U.reviewer }, owner: asAdmin };
const BENEFITS = `'["a","b","c"]'::jsonb`;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${U.finance}', 'finance@test'), ('${U.reviewer}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${U.finance}', 'finance', 'finance@test'), ('${U.reviewer}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into public.categories (id, name, grp, tier) values ('zz-plan', 'Plan test', 'G', 'A');
    insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
      ('zz-plan', 'standard', 300, 15, ${BENEFITS}), ('zz-plan', 'premium', 800, 40, ${BENEFITS});
  `);
});
after(async () => { await c.end(); });

const save = (who, patch, reason = null, plan = "standard") =>
  tx(c, who, async (k) => (await sql(k, `select * from public.save_plan('zz-plan', '${plan}', $1::jsonb, $2)`, [JSON.stringify(patch), reason]))[0], { commit: true });

test("migration 0012 can be re-run", async () => {
  await c.query(readFileSync(join(migrations, "0012_plans_admin.sql"), "utf8"));
});

test("trial_days defaults to 0 and is limited to 0..90", async () => {
  const [row] = await sql(c, `select trial_days from public.plans where category_id = 'zz-plan' and plan_key = 'standard'`);
  assert.equal(row.trial_days, 0);
  await assert.rejects(sql(c, `update public.plans set trial_days = 91 where category_id = 'zz-plan' and plan_key = 'standard'`), /check/i);
});

test("finance can save a plan: values change, a version and an audit row are written", async () => {
  const row = await save(as.finance, { price_kes: 350, trial_days: 7 }, "Quarterly review");
  assert.equal(row.price_kes, 350);
  assert.equal(row.trial_days, 7);
  const [v] = await sql(c, `select * from public.plan_versions where kind = 'plan' and category_id = 'zz-plan' and plan_key = 'standard' order by id desc limit 1`);
  assert.equal(v.reason, "Quarterly review");
  assert.equal(v.snapshot.price_kes, 350);
  assert.equal(v.changed_by, U.finance);
  const [a] = await sql(c, `select * from public.audit_log where action = 'plan.update' and target_id = 'zz-plan:standard' order by id desc limit 1`);
  assert.equal(a.reason, "Quarterly review");
  assert.equal(a.before.price_kes, 300);
  assert.equal(a.after.price_kes, 350);
});

test("a price change needs a reason; other changes do not", async () => {
  await assert.rejects(save(as.finance, { price_kes: 360 }, null), /reason_required/);
  await assert.rejects(save(as.finance, { price_kes: 360 }, "   "), /reason_required/);
  const row = await save(as.finance, { items_limit: 20 }, null);
  assert.equal(row.items_limit, 20);
});

test("badge can be cleared and set; top_benefits must keep exactly 3 lines", async () => {
  assert.equal((await save(as.finance, { badge: "Popular" }, null, "premium")).badge, "Popular");
  assert.equal((await save(as.finance, { badge: "" }, null, "premium")).badge, null);
  await assert.rejects(save(as.finance, { top_benefits: ["a", "b"] }, null), /check/i);
});

test("only finance and owner can save; reviewer and anon cannot", async () => {
  await assert.rejects(save(as.reviewer, { items_limit: 21 }), /forbidden/);
  await assert.rejects(save(null, { items_limit: 21 }), /permission denied|forbidden/i);
  assert.equal((await save(as.owner, { items_limit: 22 })).items_limit, 22);
});

test("plan_versions is append-only for every browser role", async () => {
  for (const who of [as.finance, as.owner]) {
    await rejects(c, who, `update public.plan_versions set reason = 'x'`, [], /permission denied/i);
    await rejects(c, who, `delete from public.plan_versions`, [], /permission denied/i);
    await rejects(c, who, `insert into public.plan_versions (kind, snapshot) values ('plan', '{}')`, [], /permission denied/i);
  }
  const visible = await tx(c, as.reviewer, async (k) => sql(k, `select id from public.plan_versions`));
  assert.equal(visible.length, 0, "reviewer cannot read version history");
  const finance = await tx(c, as.finance, async (k) => sql(k, `select id from public.plan_versions`));
  assert.ok(finance.length > 0);
});

test("global limits save writes a version and an audit row", async () => {
  const [{ standard, premium }] = await sql(c, `select standard, premium from public.global_limits where id = 1`);
  const next = { ...standard, faqs: 9 };
  await tx(c, as.finance, async (k) => sql(k, `select * from public.save_global_limits($1::jsonb, $2::jsonb, 'More FAQs')`, [JSON.stringify(next), JSON.stringify(premium)]), { commit: true });
  const [v] = await sql(c, `select * from public.plan_versions where kind = 'global_limits' order by id desc limit 1`);
  assert.equal(v.reason, "More FAQs");
  assert.equal(v.snapshot.standard.faqs, 9);
  const [a] = await sql(c, `select * from public.audit_log where action = 'global_limits.update' order by id desc limit 1`);
  assert.equal(a.after.standard.faqs, 9);
  await assert.rejects(tx(c, as.reviewer, async (k) => sql(k, `select * from public.save_global_limits($1::jsonb, $2::jsonb)`, [JSON.stringify(standard), JSON.stringify(premium)])), /forbidden/);
});

test("coupons: finance manages them, others cannot, and the constraints hold", async () => {
  const ins = (code, kind = "percent", value = 10, extra = "") =>
    tx(c, as.finance, async (k) => k.query(`insert into public.coupons (code, kind, value ${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, $3 ${extra ? ", " + extra.split("=")[1] : ""})`, [code, kind, value]), { commit: true });
  await ins("LAUNCH-10");
  await assert.rejects(ins("LAUNCH-10"), /duplicate key/i);
  await assert.rejects(ins("BIG", "percent", 101), /check/i);
  await assert.rejects(ins("ab"), /check/i);
  await assert.rejects(ins("has space"), /check/i);
  await ins("FIXED-200", "fixed", 200);
  await assert.rejects(tx(c, as.finance, async (k) => k.query(`insert into public.coupons (code, kind, value, valid_from, valid_until) values ('BADDATES', 'fixed', 5, '2026-11-02', '2026-11-01')`)), /check/i);
  await rejects(c, as.reviewer, `insert into public.coupons (code, kind, value) values ('NOPE-1', 'fixed', 5)`, [], /row-level security|permission denied/i);
  const seen = await tx(c, as.reviewer, async (k) => sql(k, `select code from public.coupons`));
  assert.equal(seen.length, 0);
  const anon = await tx(c, { role: "anon" }, async (k) => k.query(`select code from public.coupons`).catch((e) => e));
  assert.ok(anon instanceof Error, "anon has no access to coupons");
});
