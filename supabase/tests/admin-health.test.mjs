// Business health score (0069_business_health.sql): the formula, the bug fixes, the caps, tuning, snapshots and permissions.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin, asService } from "./db.mjs";

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const asReviewer = { sub: REVIEWER };

const day = (offset) => `public.nairobi_midnight(public.nairobi_today() + (${offset}))`;
const list = (args = {}, who = asAdmin) =>
  tx(c, who, async (k) => {
    const a = { tab: "all", search: null, sort: "name", dir: "asc", filters: {}, limit: 50, offset: 0, ...args };
    return (await sql(k, `select admin_businesses_query($1, $2, $3, $4, $5::jsonb, $6, $7) as r`,
      [a.tab, a.search, a.sort, a.dir, JSON.stringify(a.filters), a.limit, a.offset]))[0].r;
  });
const health = async (id) => (await sql(c, `select health from public.business_health_v where business_id = $1`, [id]))[0].health;
const save = (config, who = asAdmin) =>
  tx(c, who, async (k) => (await sql(k, `select admin_save_health_config($1::jsonb, 'test') as r`, [JSON.stringify(config)]))[0].r, { commit: true });
const current = () => tx(c, asAdmin, async (k) => (await sql(k, `select admin_get_health_config() as r`))[0].r);

// Every test starts from the same two bare businesses: 60 days old, live and paid, nothing filled in, never logged in.
const reset = () => sql(c, `
  delete from public.items;
  delete from public.flags;
  delete from public.reports;
  delete from public.business_health_snapshots;
  delete from public.site_settings where key = 'health_config';
  update public.businesses
     set strikes = 0, status = 'live', deleted_at = null, paid_until = ${day(30)}, created_at = now() - interval '60 days',
         last_login_at = null, last_edit_at = null, tagline = null, description = null, logo_path = null, cover_path = null,
         address = null, whatsapp = null, hours = '{}'::jsonb
   where id in ('${ids.bizA}', '${ids.bizB}')`);
const fillProfile = (id) => sql(c, `
  update public.businesses set tagline = 'Fresh cuts', description = 'The best cuts in town', logo_path = 'logo', cover_path = 'cover',
         address = 'Moi Avenue', whatsapp = '+254712345678', hours = '{"mon": [["08:00", "17:00"]]}'::jsonb where id = '${id}'`);
const addItems = (id, n) => sql(c, `insert into public.items (business_id, name, price) select '${id}', 'Item ' || g, 100 from generate_series(1, ${n}) g`);
// Backdating has to bypass the touch and price-stamp triggers, which would otherwise reset both timestamps to now.
const backdate = (where, days) => sql(c, `
  set session_replication_role = replica;
  update public.items set price_confirmed_at = now() - interval '${days} days', updated_at = now() - interval '${days} days' where ${where};
  set session_replication_role = origin`);
const touched = (id, login, edit) => sql(c, `
  update public.businesses set last_login_at = ${login === null ? "null" : `now() - interval '${login} days'`},
         last_edit_at = ${edit === null ? "null" : `now() - interval '${edit} days'`} where id = '${id}'`);
// A business that earns 100: full profile, all prices confirmed today, active today, clean record.
const perfect = async (id) => {
  await fillProfile(id);
  await addItems(id, 3);
  await touched(id, 0, 0);
};

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    update public.businesses set plan_key = 'premium' where id = '${ids.bizA}'`);   // premium allows enough items for these tests
});
after(async () => { await c.end(); });
beforeEach(reset);

test("a business with no items is no longer rewarded for price freshness", async () => {
  const h = await health(ids.bizB);
  assert.equal(h.subs.freshness, 0);
  assert.ok(h.reasons.some((r) => r.part === "freshness" && /No items listed/.test(r.text)));
  const [{ price_age_days }] = await sql(c, `select price_age_days from public.business_health_inputs_v where business_id = $1`, [ids.bizB]);
  assert.equal(price_age_days, null);   // it used to be 0, which scored 100
});

test("a new business is neutral on freshness and activity, then counts as 0 once the grace is over", async () => {
  await sql(c, `update public.businesses set created_at = now() - interval '2 days' where id = '${ids.bizB}'`);
  let h = await health(ids.bizB);
  assert.equal(h.grace, true);
  assert.deepEqual([h.subs.freshness, h.subs.activity], [70, 70]);
  assert.equal(h.band, "watch");                      // nothing wrong: it is just new. It is not "At risk".
  assert.equal(h.score, 62);                          // (20*0 + 25*70 + 35*70 + 20*100) / 100
  assert.ok(h.reasons.some((r) => r.part === "grace" && /New business/.test(r.text)));

  await sql(c, `update public.businesses set created_at = now() - interval '60 days' where id = '${ids.bizB}'`);
  h = await health(ids.bizB);
  assert.equal(h.grace, false);
  assert.deepEqual([h.subs.freshness, h.subs.activity], [0, 0]);
  assert.equal(h.band, "at_risk");
  assert.equal(h.score, 20);
});

test("activity is the latest of login, business edit, item edit and price confirmation", async () => {
  await touched(ids.bizB, 40, null);                  // logged in 40 days ago, nothing since
  assert.equal((await health(ids.bizB)).subs.activity, 0);

  await addItems(ids.bizB, 1);                        // a price confirmed today (WhatsApp sellers never log in)
  await touched(ids.bizB, 40, null);
  assert.equal((await health(ids.bizB)).subs.activity, 100);

  await sql(c, `delete from public.items`);
  await touched(ids.bizB, 40, 10);                    // an edit 10 days ago: 100 * (30 - 10) / (30 - 3)
  assert.equal((await health(ids.bizB)).subs.activity, 74);

  await touched(ids.bizB, 2, 20);                     // a login 2 days ago is inside the full-marks window
  assert.equal((await health(ids.bizB)).subs.activity, 100);
});

test("freshness is the share of items confirmed recently, not the stalest item", async () => {
  await addItems(ids.bizB, 4);
  await backdate(`business_id = '${ids.bizB}' and name = 'Item 1'`, 100);
  const h = await health(ids.bizB);
  assert.equal(h.subs.freshness, 75);                 // one stale item out of four; it used to zero the whole part
  assert.ok(h.reasons.some((r) => r.part === "freshness" && /3 of 4 prices confirmed in the last 14 days/.test(r.text)));
});

test("the freshness window can differ per category", async () => {
  await addItems(ids.bizB, 2);
  await backdate(`business_id = '${ids.bizB}'`, 5);
  assert.equal((await health(ids.bizB)).subs.freshness, 100);   // default window: 14 days
  await save({ ...(await current()), freshness_days_by_category: { barber: 3 } });
  assert.equal((await health(ids.bizB)).subs.freshness, 0);     // barbers must confirm within 3 days
  const h = await health(ids.bizB);
  assert.ok(h.reasons.some((r) => r.part === "freshness" && /last 3 days/.test(r.text)));
});

test("flags, reports and strikes cost trust points, each capped", async () => {
  const add = (table, n, extra = "") => sql(c, `insert into public.${table} (business_id, reason${extra ? ", " + extra.split("=")[0] : ""}) select '${ids.bizB}', 'wrong prices'${extra ? ", " + extra.split("=")[1] : ""} from generate_series(1, ${n})`);
  assert.equal((await health(ids.bizB)).subs.trust, 100);
  await add("flags", 1);
  assert.equal((await health(ids.bizB)).subs.trust, 75);        // 25 per flag
  await add("reports", 1);
  assert.equal((await health(ids.bizB)).subs.trust, 60);        // 15 per report
  await add("flags", 5);
  await add("reports", 5);
  await sql(c, `update public.businesses set strikes = 1 where id = '${ids.bizB}'`);
  assert.equal((await health(ids.bizB)).subs.trust, 0);         // 50 + 30 + 20: flags and reports stop at their caps
  const h = await health(ids.bizB);
  assert.ok(h.reasons.some((r) => r.part === "trust" && /6 open flags, 6 open reports, 1 strike/.test(r.text)));
});

test("hard caps: one critical failure cannot be averaged away", async () => {
  await perfect(ids.bizB);
  let h = await health(ids.bizB);
  assert.deepEqual([h.score, h.band, h.capped, h.weakest], [100, "healthy", false, null]);

  await sql(c, `update public.businesses set status = 'suspended' where id = '${ids.bizB}'`);
  h = await health(ids.bizB);
  assert.deepEqual([h.score, h.band, h.capped], [39, "at_risk", true]);
  assert.equal(h.reasons[0].part, "cap");               // the cap is listed first
  assert.match(h.reasons[0].text, /Suspended/);

  await sql(c, `update public.businesses set status = 'live', paid_until = ${day(-5)} where id = '${ids.bizB}'`);
  h = await health(ids.bizB);
  assert.deepEqual([h.score, h.capped], [39, true]);    // expired
  assert.match(h.reasons[0].text, /Expired/);

  await sql(c, `update public.businesses set paid_until = ${day(30)} where id = '${ids.bizB}'`);
  assert.equal((await health(ids.bizB)).score, 100);

  // A flag the business has not answered for more than a week is serious. A fresh one, or one it has answered, is not.
  await sql(c, `insert into public.flags (business_id, reason, status, created_at) values ('${ids.bizB}', 'wrong prices', 'open', now() - interval '3 days')`);
  h = await health(ids.bizB);
  assert.deepEqual([h.score, h.capped], [95, false]);   // only the trust penalty
  await sql(c, `update public.flags set created_at = now() - interval '10 days'`);
  h = await health(ids.bizB);
  assert.deepEqual([h.score, h.capped], [39, true]);
  assert.match(h.reasons[0].text, /unanswered for over 7 days/);
  await sql(c, `update public.flags set status = 'replied'`);
  assert.equal((await health(ids.bizB)).capped, false);

  await sql(c, `delete from public.flags`);
  await sql(c, `update public.businesses set strikes = 3 where id = '${ids.bizB}'`);   // the default strike threshold
  h = await health(ids.bizB);
  assert.deepEqual([h.score, h.capped], [39, true]);
  assert.match(h.reasons[0].text, /Strike threshold reached/);
});

test("the number, the band and the sort order come from one formula and follow the configuration", async () => {
  await perfect(ids.bizA);                              // Shop A is complete, Shop B is bare
  let { rows } = await list({ sort: "healthScore", dir: "desc" });
  assert.deepEqual(rows.map((r) => r.name), ["Shop A", "Shop B"]);
  for (const r of rows) {
    assert.equal(r.healthScore, r.health.score);
    assert.equal(r.healthBand, r.health.band);
  }
  assert.equal(rows[0].healthScore, 100);

  // Weight only the profile: both numbers move, and the sort still agrees with them, with no code change anywhere.
  await save({ ...(await current()), weights: { profile: 100, freshness: 0, activity: 0, trust: 0 } });
  ({ rows } = await list({ sort: "healthScore", dir: "asc" }));
  assert.deepEqual(rows.map((r) => [r.name, r.healthScore, r.completeness]), [["Shop B", 0, 0], ["Shop A", 100, 100]]);
});

test("a bad value in site_settings falls back to the default instead of breaking the list", async () => {
  const baseline = (await health(ids.bizB)).score;
  for (const value of ['"oops"', '{"weights": {"profile": "x"}, "bands": {"healthy": 5, "watch": 90}, "neutral": 1e9}', "[1, 2]", "null"]) {
    await sql(c, `insert into public.site_settings (key, value) values ('health_config', '${value}'::jsonb)
                  on conflict (key) do update set value = excluded.value`);
    const { rows } = await list();
    assert.equal(rows.length, 2, value);
    assert.ok(Number.isInteger(rows[0].healthScore), value);
  }
  await sql(c, `delete from public.site_settings where key = 'health_config'`);
  assert.equal((await health(ids.bizB)).score, baseline);
});

test("filtering by band", async () => {
  await perfect(ids.bizA);
  const healthy = await list({ filters: { health: "healthy" } });
  assert.deepEqual(healthy.rows.map((r) => r.name), ["Shop A"]);
  const risky = await list({ filters: { health: "at_risk" } });
  assert.deepEqual(risky.rows.map((r) => r.name), ["Shop B"]);
});

test("a deleted business has no score and is not snapshotted", async () => {
  await sql(c, `update public.businesses set deleted_at = now() where id = '${ids.bizB}'`);
  const h = await health(ids.bizB);
  assert.deepEqual([h.score, h.band, h.label], [null, "none", "No score"]);
  const { rows } = await list({ tab: "deleted" });
  assert.equal(rows[0].healthScore, null);
  const n = await tx(c, asService, async (k) => (await sql(k, `select snapshot_business_health() as n`))[0].n);
  assert.equal(n, 1);
});

test("the daily snapshot is idempotent, service-only, and drives the 7-day trend", async () => {
  await rejects(c, asAdmin, `select snapshot_business_health()`, [], /permission denied/);
  await rejects(c, asA, `select snapshot_business_health()`, [], /permission denied/);

  const run = () => tx(c, asService, async (k) => (await sql(k, `select snapshot_business_health() as n`))[0].n, { commit: true });
  assert.equal(await run(), 2);
  assert.equal(await run(), 2);                         // the same day again refreshes, never duplicates
  const rows = await sql(c, `select * from public.business_health_snapshots where day = public.nairobi_today() order by business_id`);
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.business_id === ids.bizA);
  const h = await health(ids.bizA);
  assert.deepEqual([a.score, a.band, a.profile, a.freshness, a.activity, a.trust], [h.score, h.band, h.subs.profile, h.subs.freshness, h.subs.activity, h.subs.trust]);

  // No snapshot from a week ago yet: no trend. Then one 8 days old at 5 points higher gives -5.
  let { rows: list1 } = await list();
  assert.equal(list1.find((r) => r.name === "Shop A").healthTrend, null);
  await sql(c, `insert into public.business_health_snapshots (business_id, day, score, band, state, profile, freshness, activity, trust)
                values ('${ids.bizA}', public.nairobi_today() - 8, ${h.score + 5}, 'watch', 'live', 0, 0, 0, 100)`);
  ({ rows: list1 } = await list());
  assert.equal(list1.find((r) => r.name === "Shop A").healthTrend, -5);
  // Anything newer than 7 days is not "a week ago".
  await sql(c, `delete from public.business_health_snapshots where day = public.nairobi_today() - 8`);
  await sql(c, `insert into public.business_health_snapshots (business_id, day, score, band, state, profile, freshness, activity, trust)
                values ('${ids.bizA}', public.nairobi_today() - 3, 1, 'at_risk', 'live', 0, 0, 0, 0)`);
  ({ rows: list1 } = await list());
  assert.equal(list1.find((r) => r.name === "Shop A").healthTrend, null);
});

test("one business: the live breakdown and its history", async () => {
  await perfect(ids.bizA);
  await tx(c, asService, async (k) => { await sql(k, `select snapshot_business_health()`); }, { commit: true });
  const r = await tx(c, asAdmin, async (k) => (await sql(k, `select admin_business_health($1) as r`, [ids.bizA]))[0].r);
  assert.equal(r.current.score, 100);
  assert.deepEqual(r.current.weights, { profile: 20, freshness: 25, activity: 35, trust: 20 });
  assert.equal(r.history.length, 1);
  assert.deepEqual([r.history[0].score, r.history[0].band], [100, "healthy"]);
  await rejects(c, asA, `select admin_business_health($1)`, [ids.bizA], /forbidden/);
  await rejects(c, { role: "anon" }, `select admin_business_health($1)`, [ids.bizA], /permission denied/);
});

test("the owner tunes the configuration; it is validated and audited; nobody else can", async () => {
  const before = await current();
  assert.equal("strike_threshold" in before, false);   // that setting lives on the Settings page already
  assert.deepEqual(before.weights, { profile: 20, freshness: 25, activity: 35, trust: 20 });
  assert.deepEqual(before.bands, { healthy: 70, watch: 40 });

  const next = { ...before, weights: { profile: 10, freshness: 30, activity: 40, trust: 20 }, grace_days: 21, bands: { healthy: 80, watch: 50 } };
  const saved = await save(next);
  assert.deepEqual(saved.weights, next.weights);
  assert.equal(saved.grace_days, 21);
  // Earlier tests also saved the configuration (and committed), so take this save's row: the newest one.
  const log = await sql(c, `select action, target_id, before, after, reason from audit_log
                             where action = 'settings.update' and target_id = 'health' order by created_at desc limit 1`);
  assert.equal(log.length, 1);
  assert.equal(log[0].before.weights.activity, 35);
  assert.equal(log[0].after.weights.activity, 40);
  assert.equal(log[0].reason, "test");

  const bad = (patch, pattern) => rejects(c, asAdmin, `select admin_save_health_config($1::jsonb)`, [JSON.stringify({ ...before, ...patch })], pattern);
  await bad({ weights: { profile: 0, freshness: 0, activity: 0, trust: 0 } }, /invalid_health_weights/);
  await bad({ bands: { healthy: 40, watch: 40 } }, /invalid_health_bands/);
  await bad({ activity_full_days: 30, activity_zero_days: 30 }, /invalid_health_activity/);
  await bad({ weights: { ...before.weights, profile: 12.5 } }, /invalid_health_config/);
  await bad({ weights: { ...before.weights, profile: 101 } }, /invalid_health_config/);
  await bad({ grace_days: -1 }, /invalid_health_config/);
  await bad({ freshness_days: 0 }, /invalid_health_config/);
  await bad({ freshness_days_by_category: { Bakery: 3 } }, /invalid_health_config/);
  await bad({ freshness_days_by_category: { bakery: 0 } }, /invalid_health_config/);
  await bad({ freshness_days_by_category: [] }, /invalid_health_config/);
  await rejects(c, asAdmin, `select admin_save_health_config('[]'::jsonb)`, [], /invalid_health_config/);
  assert.equal(JSON.stringify(await current()), JSON.stringify(saved));   // nothing was half-saved

  for (const who of [asReviewer, asA, { role: "anon" }]) {
    await rejects(c, who, `select admin_get_health_config()`, [], /forbidden|permission denied/);
    await rejects(c, who, `select admin_save_health_config($1::jsonb)`, [JSON.stringify(before)], /forbidden|permission denied/);
  }
});

test("the migration can be re-run", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "0069_business_health.sql");
  await c.query(readFileSync(file, "utf8"));
  assert.equal((await health(ids.bizB)).band, "at_risk");   // reset() left Shop B bare and 60 days old
});
