import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService } from "./db.mjs";
import { CHANNELS, EVENT_KEYS, deliveryDecision } from "../../shared/src/seller/settings.js";

let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const save = (who, patch, opts) => tx(c, who ?? asA, async (k) => (await sql(k, `select seller_save_settings($1::jsonb) as s`, [JSON.stringify(patch)]))[0].s, opts);
const reset = () => sql(c, `delete from seller_settings; delete from message_outbox; delete from messages; delete from reminder_log; update businesses set email = null, override = null, paid_until = null`);

// 22:00 in Nairobi (UTC+3) is 19:00 UTC. 12:00 in Nairobi is 09:00 UTC.
const NIGHT = "2026-10-11T19:00:00Z";
const DAY = "2026-10-11T09:00:00Z";

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

test("the SQL delivery plan matches the shared policy for every event, channel, kind and time", async () => {
  const variants = [
    {},
    { notifications: { quiet_hours: { enabled: false } } },
    { notifications: { quiet_hours: { enabled: true, start: "13:00", end: "14:00" } } },
    { notifications: { events: { change_decision: { sms: false }, customer_report: { sms: true, email: true }, closure_reminder: { in_app: false } } } }
  ];
  const times = ["2026-10-11T18:00:00Z", "2026-10-11T18:30:00Z", "2026-10-11T21:30:00Z", "2026-10-12T03:59:00Z", "2026-10-12T04:00:00Z", "2026-10-11T09:30:00Z", "2026-10-11T10:30:00Z"];
  for (const settings of variants) {
    for (const event of EVENT_KEYS) {
      for (const channel of CHANNELS) {
        for (const kind of ["normal", "transactional", "critical"]) {
          for (const t of times) {
            const [row] = await sql(c, `select action, until from seller_delivery_plan($1::jsonb, $2, $3, $4, $5::timestamptz)`, [JSON.stringify(settings), event, channel, kind, t]);
            const want = deliveryDecision({ event, channel, kind, settings, now: new Date(t) });
            assert.equal(row.action, want.action, `${event}/${channel}/${kind}@${t} ${JSON.stringify(settings)}`);
            if (want.action === "delay") assert.equal(row.until.toISOString(), want.until.toISOString(), `until ${event}@${t}`);
          }
        }
      }
    }
  }
  const [bad] = await sql(c, `select action from seller_delivery_plan('{}', 'nope', 'sms', 'normal', now())`);
  assert.equal(bad.action, "skip");
});

test("notify delays only non-critical SMS during quiet hours and always keeps critical in-app", async () => {
  await reset();
  await sql(c, `update businesses set email = 'a@shop.test' where id = '${ids.bizA}'`);
  await sql(c, `select seller_notify('${ids.bizA}', 'change_decision', 'Decision', 'Your change was approved', 'normal', '${NIGHT}')`);
  let [row] = await sql(c, `select channel, status, deliver_after from message_outbox where channel = 'sms'`);
  assert.equal(row.deliver_after.toISOString(), "2026-10-12T04:00:00.000Z");
  assert.equal((await sql(c, `select id from message_outbox where channel = 'email'`)).length, 0);
  assert.equal((await sql(c, `select id from messages`)).length, 1);

  await reset();
  await sql(c, `select seller_notify('${ids.bizA}', 'change_decision', 'Decision', 'Approved', 'normal', '${DAY}')`);
  [row] = await sql(c, `select deliver_after from message_outbox where channel = 'sms'`);
  assert.equal(row.deliver_after.toISOString(), DAY.replace("Z", ".000Z"));

  await reset();
  for (const event of ["expiry", "payment", "admin_question", "suspension"]) {
    await sql(c, `select seller_notify('${ids.bizA}', '${event}', 'Critical', 'Act now', 'normal', '${NIGHT}')`);
  }
  const sms = await sql(c, `select deliver_after from message_outbox where channel = 'sms'`);
  assert.equal(sms.length, 4);
  for (const r of sms) assert.equal(r.deliver_after.toISOString(), NIGHT.replace("Z", ".000Z"));
  assert.equal((await sql(c, `select id from messages`)).length, 4);

  await reset();
  await sql(c, `select seller_notify('${ids.bizA}', 'removal', 'Removed', 'Item removed', 'transactional', '${NIGHT}')`);
  [row] = await sql(c, `select deliver_after from message_outbox where channel = 'sms'`);
  assert.equal(row.deliver_after.toISOString(), NIGHT.replace("Z", ".000Z"));
});

test("disabled channels are skipped, email needs an address, quiet hours can be turned off", async () => {
  await reset();
  await sql(c, `insert into seller_settings (business_id, settings) values ('${ids.bizA}', '${JSON.stringify({ notifications: { events: { customer_report: { in_app: false, sms: true, email: true }, expiry: { sms: false } }, quiet_hours: { enabled: false } } })}')`);
  const r1 = (await sql(c, `select seller_notify('${ids.bizA}', 'customer_report', 'Report', 'A customer reported an item', 'normal', '${NIGHT}') as r`))[0].r;
  assert.deepEqual(r1, { in_app: "skip", sms: "send", email: "send" });
  assert.equal((await sql(c, `select id from messages`)).length, 0);
  assert.equal((await sql(c, `select id from message_outbox where channel = 'email'`)).length, 0, "no email address on file");
  const sms = await sql(c, `select deliver_after from message_outbox where channel = 'sms'`);
  assert.equal(sms[0].deliver_after.toISOString(), NIGHT.replace("Z", ".000Z"), "quiet hours are off");
  const r2 = (await sql(c, `select seller_notify('${ids.bizA}', 'expiry', 'Expiry', 'Soon', 'normal', '${DAY}') as r`))[0].r;
  assert.equal(r2.sms, "skip");
  assert.equal(r2.in_app, "send");
});

test("reminder jobs honour preferences, send once, and never delay critical SMS", async () => {
  await reset();
  await sql(c, `update businesses set paid_until = '2026-10-14T09:00:00Z' where id = '${ids.bizA}'`);
  assert.equal((await sql(c, `select seller_run_reminders('${NIGHT}') as n`))[0].n, 1);
  assert.equal((await sql(c, `select seller_run_reminders('${NIGHT}') as n`))[0].n, 0, "second run sends nothing");
  const msg = await sql(c, `select subject from messages`);
  assert.equal(msg.length, 1);
  assert.match(msg[0].subject, /expires in 3 days/);
  const sms = await sql(c, `select deliver_after from message_outbox where channel = 'sms'`);
  assert.equal(sms[0].deliver_after.toISOString(), NIGHT.replace("Z", ".000Z"), "expiry is critical, quiet hours do not apply");

  await reset();
  await sql(c, `insert into seller_settings (business_id, settings) values ('${ids.bizA}', '{"notifications":{"events":{"expiry":{"sms":false}}}}')`);
  await sql(c, `update businesses set paid_until = '2026-10-11T20:00:00Z' where id = '${ids.bizA}'`);
  assert.equal((await sql(c, `select seller_run_reminders('${DAY}') as n`))[0].n, 1);
  assert.equal((await sql(c, `select id from message_outbox where channel = 'sms'`)).length, 0, "SMS preference is respected");
  assert.equal((await sql(c, `select id from messages`)).length, 1, "in-app stays on");

  await reset();
  await sql(c, `update businesses set override = '{"type":"closed","startsAt":"2026-10-11T08:00:00Z","endsAt":"2026-10-11T19:30:00Z"}' where id = '${ids.bizA}'`);
  assert.equal((await sql(c, `select seller_run_reminders('${NIGHT}') as n`))[0].n, 1);
  const [closure] = await sql(c, `select deliver_after from message_outbox where channel = 'sms'`).then((r) => (r.length ? r : [{ deliver_after: null }]));
  assert.equal(closure.deliver_after, null, "closure reminders are in-app by default, so no SMS is queued");
  assert.equal((await sql(c, `select id from messages where subject = 'Your closure ends soon'`)).length, 1);
});

test("the outbox is claimed with a lease and only the service role can use it", async () => {
  await reset();
  await sql(c, `select seller_notify('${ids.bizA}', 'expiry', 'Expiry', 'Soon', 'normal', now() - interval '1 minute')`);
  const rows = await tx(c, asService, (k) => sql(k, `select * from outbox_claim(10)`), { commit: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "expiry");
  assert.equal((await tx(c, asService, (k) => sql(k, `select * from outbox_claim(10)`), { commit: true })).length, 0, "leased rows are not handed out twice");
  await tx(c, asService, (k) => k.query(`select outbox_finish($1, 'sent')`, [rows[0].id]), { commit: true });
  assert.equal((await sql(c, `select status from message_outbox`))[0].status, "sent");
  for (const fn of ["outbox_claim(10)", `seller_run_reminders(now())`, `seller_notify('${ids.bizA}', 'expiry', 's', 'b')`]) {
    await rejects(c, asA, `select ${fn}`, [], /permission denied/);
    await rejects(c, { role: "anon" }, `select ${fn}`, [], /permission denied/);
  }
  await rejects(c, asA, `select * from message_outbox`, [], /permission denied/);
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
