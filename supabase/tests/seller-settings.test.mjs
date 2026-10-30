import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const save = (who, patch, opts) => tx(c, who ?? asA, async (k) => (await sql(k, `select seller_save_settings($1::jsonb) as s`, [JSON.stringify(patch)]))[0].s, opts);
const reset = () => sql(c, `delete from seller_settings; update businesses set status = 'live', status_reason = null where id in ('${ids.bizA}', '${ids.bizB}')`);


test("saving settings merges groups, keeps saved views and audits the change", async () => {
  await reset();
  await sql(c, `insert into seller_settings (business_id, settings) values ('${ids.bizA}', '{"saved_views":[{"id":"v1","name":"One","params":"sort=name_asc"}]}')`);
  await save(asA, { appearance: { theme: "dark" } }, { commit: true });
  const out = await save(asA, { appearance: { density: "compact" }, idle_minutes: 30 }, { commit: true });
  assert.equal(out.appearance.theme, "dark");
  assert.equal(out.appearance.density, "compact");
  assert.equal(out.idle_minutes, 30);
  assert.equal(out.saved_views.length, 1);
  const audit = await sql(c, `select data from audit_log where business_id = '${ids.bizA}' and action = 'settings_updated'`);
  assert.equal(audit.length, 2);
});

test("settings can never change status, plan, visibility or other seller data", async () => {
  await reset();
  const before = (await sql(c, `select status, plan_key, featured, verification_level, slug from businesses where id = '${ids.bizA}'`))[0];
  for (const key of ["status", "plan_key", "featured", "verification_level", "visible", "hidden_by_admin", "slug", "name", "saved_views", "language", "locale"]) {
    await rejects(c, asA, `select seller_save_settings($1::jsonb)`, [JSON.stringify({ [key]: "x" })], /field_not_allowed/);
  }
  await save(asA, { business: { show_closes_chip: false }, catalog: { start_visible: false } }, { commit: true });
  const after = (await sql(c, `select status, plan_key, featured, verification_level, slug from businesses where id = '${ids.bizA}'`))[0];
  assert.deepEqual(after, before);
});

test("invalid values are rejected by the function and by direct writes", async () => {
  await reset();
  const bad = [
    [{ idle_minutes: 45 }, /invalid_idle_minutes/],
    [{ appearance: { theme: "blue" } }, /invalid_appearance/],
    [{ appearance: { text_size: "giant" } }, /invalid_appearance/],
    [{ appearance: { density: "tight" } }, /invalid_appearance/],
    [{ appearance: { reduce_motion: "yes" } }, /invalid_appearance/],
    [{ catalog: { price_reminder_days: 45 } }, /invalid_catalog/],
    [{ catalog: { low_stock_threshold: -1 } }, /invalid_catalog/],
    [{ catalog: { low_stock_threshold: 5000 } }, /invalid_catalog/],
    [{ catalog: { default_availability: "gone" } }, /invalid_catalog/],
    [{ catalog: { default_units: { drinks: ["x".repeat(21)] } } }, /invalid_catalog/],
    [{ notifications: { quiet_hours: { start: "25:00" } } }, /invalid_quiet_hours/],
    [{ notifications: { quiet_hours: { start: "21:00", end: "21:00" } } }, /invalid_quiet_hours/],
    [{ notifications: { events: { nonsense: { sms: true } } } }, /invalid_notifications/],
    [{ notifications: { events: { expiry: { sms: "yes" } } } }, /invalid_notifications/],
    [{ messaging: { whatsapp_greeting: "Visit https://example.com" } }, /invalid_greeting/],
    [{ messaging: { whatsapp_greeting: "Call 0712 345 678" } }, /invalid_greeting/],
    [{ messaging: { whatsapp_greeting: "Hi {name}" } }, /invalid_greeting/],
    [{ messaging: { whatsapp_greeting: "x".repeat(161) } }, /invalid_greeting/],
    [{ messaging: { closure_reasons: [{ id: "a", label: "Call +254712345678", message: "" }] } }, /invalid_closure_reasons/],
    [{ messaging: { closure_reasons: [{ id: "a", label: "A", message: "m" }, { id: "a", label: "B", message: "m" }] } }, /invalid_closure_reasons/],
    [{ business: { partial_closure_message: "see www.shop.co.ke" } }, /invalid_business_prefs/],
    [{ onboarding: { status: "maybe" } }, /invalid_onboarding/]
  ];
  for (const [patch, pattern] of bad) {
    await rejects(c, asA, `select seller_save_settings($1::jsonb)`, [JSON.stringify(patch)], pattern);
    await rejects(c, asA, `insert into seller_settings (business_id, settings) values ('${ids.bizA}', $1::jsonb)`, [JSON.stringify(patch)], pattern);
  }
  await rejects(c, asA, `select seller_save_settings('[]'::jsonb)`, [], /invalid_patch/);
});

test("critical notification events keep in-app on", async () => {
  await reset();
  for (const event of ["expiry", "payment", "admin_question", "suspension"]) {
    await rejects(c, asA, `select seller_save_settings($1::jsonb)`, [JSON.stringify({ notifications: { events: { [event]: { in_app: false } } } })], /critical_in_app_required/);
  }
  const out = await save(asA, { notifications: { events: { expiry: { sms: false, email: true }, customer_report: { in_app: false } } } }, { commit: true });
  assert.equal(out.notifications.events.expiry.sms, false);
  assert.equal(out.notifications.events.customer_report.in_app, false);
});

test("announcement defaults are Premium only", async () => {
  await reset();
  await rejects(c, asA, `select seller_save_settings($1::jsonb)`, [JSON.stringify({ business: { announcement: { enabled: true, text: "Sale", days: 7 } } })], /premium_only/);
  const out = await save(asB, { business: { announcement: { enabled: true, text: "Sale", days: 7 } } });
  assert.equal(out.business.announcement.enabled, true);
});

test("the greeting is mirrored to the public profile and other sellers cannot see settings", async () => {
  await reset();
  await save(asA, { messaging: { whatsapp_greeting: "Hello, is {item} at {price} still there?" } }, { commit: true });
  const [b] = await sql(c, `select profile from businesses where id = '${ids.bizA}'`);
  assert.equal(b.profile.whatsapp_greeting, "Hello, is {item} at {price} still there?");
  await save(asA, { business: { show_closes_chip: false, partial_closure_message: "Salon chairs are full." } }, { commit: true });
  const [b2] = await sql(c, `select profile from businesses where id = '${ids.bizA}'`);
  assert.equal(b2.profile.show_closes_chip, false);
  assert.equal(b2.profile.partial_closure_message, "Salon chairs are full.");
  assert.equal(b2.profile.whatsapp_greeting, "Hello, is {item} at {price} still there?", "earlier profile values are kept");
  assert.equal((await tx(c, asB, (k) => sql(k, `select * from seller_settings`))).length, 0);
  assert.equal((await tx(c, asB, (k) => k.query(`update seller_settings set settings = '{}'`))).rowCount, 0);
});

test("login events are readable only by their owner", async () => {
  await sql(c, `delete from login_events`);
  await sql(c, `insert into login_events (business_id, success, user_agent) values ('${ids.bizA}', true, 'Chrome Android'), ('${ids.bizA}', false, 'Firefox'), ('${ids.bizB}', true, 'Safari')`);
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from login_events`))).length, 2);
  assert.equal((await tx(c, asB, (k) => sql(k, `select * from login_events`))).length, 1);
  await rejects(c, asA, `insert into login_events (business_id, success) values ('${ids.bizA}', true)`, [], /permission denied/);
});

test("imports start from the saved catalog defaults", async () => {
  await reset();
  await sql(c, `delete from items where business_id = '${ids.bizB}'`);
  await save(asB, { catalog: { low_stock_threshold: 8, show_only_n_left: false } }, { commit: true });
  await tx(c, asB, (k) => sql(k, `select seller_import_items('[{"name":"Item One","price":100,"price_type":"fixed"}]'::jsonb)`), { commit: true });
  const [row] = await sql(c, `select low_stock_threshold, show_stock_count, visible, draft from items where business_id = '${ids.bizB}' and name = 'Item One'`);
  assert.deepEqual(row, { low_stock_threshold: 8, show_stock_count: false, visible: false, draft: true });
  await reset();
  await tx(c, asB, (k) => sql(k, `select seller_import_items('[{"name":"Item Two","price":100,"price_type":"fixed"}]'::jsonb)`), { commit: true });
  const [d] = await sql(c, `select low_stock_threshold, show_stock_count from items where business_id = '${ids.bizB}' and name = 'Item Two'`);
  assert.deepEqual(d, { low_stock_threshold: 3, show_stock_count: true });
});

test("a suspended seller cannot save settings", async () => {
  await reset();
  await sql(c, `update businesses set status = 'suspended', status_reason = 'test' where id = '${ids.bizA}'`);
  await rejects(c, asA, `select seller_save_settings($1::jsonb)`, [JSON.stringify({ appearance: { theme: "dark" } })], /suspended|forbidden|not_active/);
  await reset();
});
