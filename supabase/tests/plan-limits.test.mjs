import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";
import { PLAN_LIMIT_RULES, checkPlanLimits } from "../../shared/src/planLimits.js";

// 0111_plan_limits_switches.sql
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const save = (who, plan, limits, reason = "Starter plan gets fewer combinations") =>
  tx(c, who, async (k) => (await sql(k, `select admin_save_plan_limits($1, $2::jsonb, $3) as r`, [plan, JSON.stringify(limits), reason]))[0].r, { commit: true });
const read = () => tx(c, asReviewer, async (k) => (await sql(k, `select admin_plan_limits() as r`))[0].r);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_plan_limits" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
  `);
});
after(async () => { await c?.end(); });

test("any admin reads the limits; a seller cannot", async () => {
  const got = await read();
  assert.equal(got.standard.galleryPhotos, 5);
  assert.equal(got.premium.flashSalesPerMonth, 10);
  await rejects(c, asA, `select admin_plan_limits()`, [], /forbidden/);
});

test("owner and finance save; a reviewer and a seller cannot", async () => {
  await rejects(c, asReviewer, `select admin_save_plan_limits('standard', '{}'::jsonb, 'Some reason here')`, [], /forbidden/);
  await rejects(c, asA, `select admin_save_plan_limits('standard', '{}'::jsonb, 'Some reason here')`, [], /forbidden/);
  const r = await save(asFinance, "standard", { options: { axes: 2, variants: 24 }, threeD: { models: 1 }, features: { demand: false } });
  assert.deepEqual(r.options, { axes: 2, variants: 24 });
  assert.deepEqual(r.threeD, { models: 1 });
  assert.deepEqual(r.features, { demand: false });
});

test("the plan's other limits (photos, offers, flash) are untouched, and the other plan is too", async () => {
  const got = await read();
  assert.equal(got.standard.galleryPhotos, 5);
  assert.equal(got.standard.activeOffers, 8);
  assert.equal(got.standard.flashSalesPerMonth, 3);
  assert.equal(got.premium.options, undefined);
  assert.equal(got.premium.features, undefined);
});

test("saving again replaces the three keys: a limit set back to its hard cap, or a switch turned back on, is no longer stored", async () => {
  const r = await save(asAdmin, "standard", { options: { axes: 3, values: 12 }, features: { demand: true, threeD: false } });
  assert.deepEqual(r.options, { values: 12 });
  assert.equal(r.threeD, undefined);
  assert.deepEqual(r.features, { threeD: false });
  assert.equal(r.galleryPhotos, 5);
});

test("a change needs a reason; no change needs none and writes nothing", async () => {
  await rejects(c, asAdmin, `select admin_save_plan_limits('premium', '{"options":{"axes":2}}'::jsonb, '')`, [], /reason_required/);
  await rejects(c, asAdmin, `select admin_save_plan_limits('premium', '{"options":{"axes":2}}'::jsonb, 'x')`, [], /reason_required/);
  const before = (await sql(c, `select count(*)::int as n from audit_log where action = 'plan.limits'`))[0].n;
  await save(asAdmin, "premium", {}, "");
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where action = 'plan.limits'`))[0].n, before);
});

test("every change is audited with the before, the after and the reason", async () => {
  const rows = await sql(c, `select target_id, reason, before, after from audit_log where action = 'plan.limits' order by created_at`);
  assert.ok(rows.length >= 2);
  const first = rows[0];
  assert.equal(first.target_id, "standard");
  assert.equal(first.reason, "Starter plan gets fewer combinations");
  assert.deepEqual(first.after.options, { axes: 2, variants: 24 });
});

test("bad input is refused and nothing is stored", async () => {
  const stored = JSON.stringify(await read());
  for (const bad of [
    { options: { axes: 4 } }, { options: { axes: 0 } }, { options: { values: 41 } }, { options: { variants: 1.5 } }, { options: { variants: "9" } },
    { threeD: { spinFrames: 11 } }, { threeD: { models: -1 } }, { features: { teleport: false } }, { features: { threeD: "no" } }, { galleryPhotos: 1 }, []
  ]) {
    await rejects(c, asAdmin, `select admin_save_plan_limits('standard', $1::jsonb, 'A good reason')`, [JSON.stringify(bad)], /invalid_limits/);
  }
  await rejects(c, asAdmin, `select admin_save_plan_limits('gold', '{}'::jsonb, 'A good reason')`, [], /invalid_plan/);
  assert.equal(JSON.stringify(await read()), stored);
});

test("the database and shared/src/planLimits.js agree on every limit: the lowest and highest are accepted, one outside is refused", async () => {
  for (const [group, fields] of Object.entries(PLAN_LIMIT_RULES)) {
    for (const [key, rule] of Object.entries(fields)) {
      for (const [value, ok] of [[rule.min, true], [rule.max, true], [rule.min - 1, false], [rule.max + 1, false]]) {
        const input = { [group]: { [key]: value } };
        assert.equal(checkPlanLimits(input).ok, ok, `shared ${group}.${key}=${value}`);
        const run = save(asAdmin, "premium", input, "Checking the rules agree");
        if (ok) await run; else await assert.rejects(run, /invalid_limits/, `db ${group}.${key}=${value}`);
      }
    }
  }
});
