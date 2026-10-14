import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA, asB } from "./db.mjs";

// 0008_admin.sql does not apply after 0007 (its tables clash with 0004), so these tests build the schema
// the same way production has it: 0001-0007 plus 0009. Drop the skip once 0008 is fixed.
let c;
before(async () => {
  c = await connect(await createDatabase({ skip: ["0008_admin.sql"], database: "epicmkt_messaging_test" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from messages; delete from admin_notifications`);
  await sql(c, `update businesses set paid_until = null, email = null`);
});

// Nairobi is UTC+3. 23:30 Nairobi is inside the default quiet hours (21:00 to 07:00).
const NIGHT = "2026-10-14T20:30:00Z";        // 23:30 Nairobi, Wed
const SMALL_HOURS = "2026-10-15T00:30:00Z";  // 03:30 Nairobi, Thu
const MORNING = "2026-10-15T04:00:01Z";      // 07:00:01 Nairobi, Thu
const MIDDAY = "2026-10-14T09:00:00Z";       // 12:00 Nairobi

const queue = async (channel, { transactional = true, at = "2026-10-14T00:00:00Z", biz = ids.bizA } = {}) =>
  (await sql(c, `
    insert into messages (business_id, channel, subject, body, to_address, status, transactional, scheduled_at, read_at)
    values ($1, $2, 'S', 'B', $3, 'queued', $4, $5, now()) returning id`,
    [biz, channel, channel === "sms" ? "+254712345678" : channel === "email" ? "a@x.test" : null, transactional, at]))[0].id;

const claim = async (at, limit = 50) => (await sql(c, `select id from claim_due_messages($1::timestamptz, $2)`, [at, limit])).map((r) => r.id);
const record = async (id, ok, at, extra = {}) =>
  (await sql(c, `select record_message_result($1, $2, $3, $4, null, $5::timestamptz) as r`, [id, ok, extra.provider ?? null, extra.error ?? null, at]))[0].r;
const row = async (id) => (await sql(c, `select * from messages where id = $1`, [id]))[0];
const at = (iso, plusMinutes) => new Date(new Date(iso).getTime() + plusMinutes * 60_000).toISOString();

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------
test("quiet hours: boundaries are 21:00 (in) and 07:00 (out) Nairobi time", async () => {
  const q = async (iso) => (await sql(c, `select in_quiet_hours($1::timestamptz) as r`, [iso]))[0].r;
  assert.equal(await q("2026-10-14T17:59:59Z"), false); // 20:59:59
  assert.equal(await q("2026-10-14T18:00:00Z"), true);  // 21:00:00
  assert.equal(await q("2026-10-14T21:00:00Z"), true);  // 00:00
  assert.equal(await q("2026-10-15T03:59:59Z"), true);  // 06:59:59
  assert.equal(await q("2026-10-15T04:00:00Z"), false); // 07:00:00
});

test("quiet hours delay promotional SMS and email but not transactional or in-app messages", async () => {
  const promoSms = await queue("sms", { transactional: false });
  const promoEmail = await queue("email", { transactional: false });
  const txSms = await queue("sms", { transactional: true });
  const promoInApp = await queue("in_app", { transactional: false });

  const got = await claim(NIGHT);
  assert.deepEqual(got.sort(), [txSms, promoInApp].sort(), "only transactional SMS and the silent in-app message go out at night");

  // The held-back messages are still queued, now waiting for 07:00 Nairobi (04:00 UTC), and not failed or attempted.
  for (const id of [promoSms, promoEmail]) {
    const m = await row(id);
    assert.equal(m.status, "queued");
    assert.equal(m.attempts, 0);
    assert.equal(m.scheduled_at.toISOString(), "2026-10-15T04:00:00.000Z");
  }

  // Settle the two that were sent, then the morning run picks up the held-back pair.
  await record(txSms, true, NIGHT, { provider: "p1" });
  await record(promoInApp, true, NIGHT);
  assert.deepEqual((await claim(at(NIGHT, 60))).length, 0, "still quiet an hour later");
  assert.deepEqual((await claim(MORNING)).sort(), [promoSms, promoEmail].sort());
});

test("quiet hours after midnight hold promotional messages until 07:00 the same morning", async () => {
  const promo = await queue("sms", { transactional: false, at: "2026-10-14T00:00:00Z" });
  assert.deepEqual(await claim(SMALL_HOURS), []);
  assert.equal((await row(promo)).scheduled_at.toISOString(), "2026-10-15T04:00:00.000Z");
});

test("outside quiet hours promotional and transactional messages go out together, transactional first", async () => {
  const promo = await queue("sms", { transactional: false, at: "2026-10-14T00:00:00Z" });
  const trans = await queue("sms", { transactional: true, at: "2026-10-14T01:00:00Z" });
  assert.deepEqual(await claim(MIDDAY), [trans, promo]);
});

test("a promotional message scheduled for the daytime is not touched by a night run", async () => {
  const later = await queue("sms", { transactional: false, at: "2026-10-15T08:00:00Z" });
  await claim(NIGHT);
  assert.equal((await row(later)).scheduled_at.toISOString(), "2026-10-15T08:00:00.000Z");
});

test("a malformed quiet_hours setting never blocks sending", async () => {
  await sql(c, `update site_settings set value = '{"start":"bad","end":"worse"}' where key = 'quiet_hours'`);
  try {
    const promo = await queue("sms", { transactional: false });
    assert.deepEqual(await claim(NIGHT), [promo]);
  } finally {
    await sql(c, `update site_settings set value = '{"start":"21:00","end":"07:00"}' where key = 'quiet_hours'`);
  }
});

// ---------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------
test("a failing message is retried up to 3 attempts, then marked failed with one admin notification", async () => {
  const id = await queue("sms");
  const t0 = MIDDAY;

  assert.deepEqual(await claim(t0), [id]);
  assert.equal(await record(id, false, t0, { error: "sms_http_500" }), "retry");
  let m = await row(id);
  assert.equal(m.status, "queued");
  assert.equal(m.attempts, 1);
  assert.equal(m.error, "sms_http_500");
  assert.equal(m.scheduled_at.toISOString(), at(t0, 5), "first retry after 5 minutes");
  assert.equal((await sql(c, `select count(*)::int as n from admin_notifications`))[0].n, 0, "no notification while retries remain");

  assert.deepEqual(await claim(at(t0, 4)), [], "not due yet");
  assert.deepEqual(await claim(at(t0, 5)), [id]);
  assert.equal(await record(id, false, at(t0, 5), { error: "sms_http_500" }), "retry");
  m = await row(id);
  assert.equal(m.attempts, 2);
  assert.equal(m.scheduled_at.toISOString(), at(t0, 20), "second retry after 15 minutes");

  assert.deepEqual(await claim(at(t0, 19)), []);
  assert.deepEqual(await claim(at(t0, 20)), [id]);
  assert.equal(await record(id, false, at(t0, 20), { error: "sms_timeout" }), "failed");
  m = await row(id);
  assert.equal(m.status, "failed");
  assert.equal(m.attempts, 3);
  assert.equal(m.error, "sms_timeout");

  const notes = await sql(c, `select kind, business_id, data from admin_notifications`);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].kind, "message_failed");
  assert.equal(notes[0].business_id, ids.bizA);
  assert.equal(notes[0].data.message_id, id);
  assert.equal(notes[0].data.channel, "sms");
  assert.equal(notes[0].data.attempts, 3);

  // Terminal: never claimed again, a late duplicate result changes nothing and adds no second notification.
  assert.deepEqual(await claim(at(t0, 24 * 60)), []);
  assert.equal(await record(id, false, at(t0, 25), { error: "late" }), "noop");
  assert.equal(await record(id, true, at(t0, 25), { provider: "late" }), "noop");
  assert.equal((await row(id)).status, "failed");
  assert.equal((await sql(c, `select count(*)::int as n from admin_notifications`))[0].n, 1);
});

test("a message that succeeds on a retry is sent, with no failure notification", async () => {
  const id = await queue("email");
  await claim(MIDDAY);
  assert.equal(await record(id, false, MIDDAY, { error: "email_http_502" }), "retry");
  await claim(at(MIDDAY, 5));
  assert.equal(await record(id, true, at(MIDDAY, 5), { provider: "resend-123" }), "sent");
  const m = await row(id);
  assert.equal(m.status, "sent");
  assert.equal(m.attempts, 2);
  assert.equal(m.provider_id, "resend-123");
  assert.equal(m.error, null);
  assert.equal(m.sent_at.toISOString(), at(MIDDAY, 5));
  assert.equal((await sql(c, `select count(*)::int as n from admin_notifications`))[0].n, 0);
});

test("a claimed message is leased: an overlapping run does not pick it up, an expired lease does", async () => {
  const id = await queue("sms");
  assert.deepEqual(await claim(MIDDAY), [id]);
  assert.deepEqual(await claim(at(MIDDAY, 1)), [], "second dispatcher run sees nothing");
  assert.deepEqual(await claim(at(MIDDAY, 6)), [id], "worker died; lease expired after 5 minutes");
});

test("dev-mode result shape: in-app delivery records 'delivered', external sends record the provider id", async () => {
  const inApp = await queue("in_app");
  const sms = await queue("sms");
  await claim(MIDDAY);
  await sql(c, `select record_message_result($1, true, 'in_app', null, null, $2::timestamptz, 3, 'delivered')`, [inApp, MIDDAY]);
  await sql(c, `select record_message_result($1, true, 'dev', null, null, $2::timestamptz)`, [sms, MIDDAY]);
  assert.equal((await row(inApp)).status, "delivered");
  const m = await row(sms);
  assert.equal(m.status, "sent");
  assert.equal(m.provider_id, "dev");
});

// ---------------------------------------------------------------------------
// Reminders (7 / 3 / 1 days) are idempotent through dedupe_key
// ---------------------------------------------------------------------------
const notices = async (iso) => (await sql(c, `select queue_billing_notices($1::timestamptz) as r`, [iso]))[0].r;
const keys = async (biz = ids.bizA) =>
  (await sql(c, `select dedupe_key from messages where business_id = $1 and dedupe_key is not null order by dedupe_key`, [biz])).map((r) => r.dedupe_key);

test("reminders at 7, 3 and 1 days are created once each, however often the job runs", async () => {
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-11-10'), email = 'a@shop.test' where id = $1`, [ids.bizA]);

  // [Nairobi day, expected new in-app rows, expected new SMS+email rows]
  const days = [
    ["2026-11-02", 0, 0], // 8 days left
    ["2026-11-03", 1, 2], // 7
    ["2026-11-04", 0, 0],
    ["2026-11-06", 0, 0], // 4
    ["2026-11-07", 1, 2], // 3
    ["2026-11-08", 0, 0], // 2
    ["2026-11-09", 1, 2], // 1
    ["2026-11-10", 0, 0], // expires today
  ];
  for (const [d, inApp, queued] of days) {
    const first = await notices(`${d}T05:00:00Z`);   // 08:00 Nairobi
    assert.deepEqual(first, { inApp, queued }, `${d} first run`);
    for (const later of [`${d}T05:00:00Z`, `${d}T05:01:00Z`, `${d}T15:00:00Z`]) {
      assert.deepEqual(await notices(later), { inApp: 0, queued: 0 }, `${d} re-run at ${later} creates nothing`);
    }
  }

  assert.deepEqual(await keys(), [
    "reminder:1:2026-11-10", "reminder:1:2026-11-10:email", "reminder:1:2026-11-10:sms",
    "reminder:3:2026-11-10", "reminder:3:2026-11-10:email", "reminder:3:2026-11-10:sms",
    "reminder:7:2026-11-10", "reminder:7:2026-11-10:email", "reminder:7:2026-11-10:sms",
  ]);
  const days_left = (await sql(c, `select data->>'days_left' as d from messages where dedupe_key like 'reminder:%' and channel = 'in_app' order by 1`)).map((r) => r.d);
  assert.deepEqual(days_left, ["1", "3", "7"]);
});

test("the unique key itself rejects a duplicate reminder, not just the job's own check", async () => {
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-11-10') where id = $1`, [ids.bizA]);
  await notices("2026-11-03T05:00:00Z");
  await assert.rejects(
    sql(c, `insert into messages (business_id, channel, subject, body, dedupe_key) values ($1, 'sms', 's', 'b', 'reminder:7:2026-11-10:sms')`, [ids.bizA]),
    /duplicate key|messages_dedupe_key/,
  );
});

test("grace and expiry notices are also created once, and a renewal starts a fresh set of keys", async () => {
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-11-10') where id = $1`, [ids.bizA]);
  for (const d of ["2026-11-11", "2026-11-12"]) {
    await notices(`${d}T05:00:00Z`);
    assert.deepEqual(await notices(`${d}T05:00:00Z`), { inApp: 0, queued: 0 });
  }
  assert.deepEqual((await keys()).filter((k) => !k.startsWith("reminder")), [
    "expiry:2026-11-10", "expiry:2026-11-10:sms", "grace:2026-11-10", "grace:2026-11-10:sms",
  ]);

  // Renewed for another month: new paid_until, so a new 7-day reminder is allowed even though one was sent before.
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-12-10') where id = $1`, [ids.bizA]);
  assert.deepEqual(await notices("2026-12-03T05:00:00Z"), { inApp: 1, queued: 1 });
  assert.ok((await keys()).includes("reminder:7:2026-12-10:sms"));
});

test("reminder copies are transactional: they still go out at night, and they never count as unread inbox items", async () => {
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-11-10'), email = 'a@shop.test' where id = $1`, [ids.bizA]);
  await notices("2026-11-03T05:00:00Z");
  const copies = await sql(c, `select channel, transactional, read_at is not null as read from messages where channel in ('sms', 'email')`);
  assert.equal(copies.length, 2);
  assert.ok(copies.every((m) => m.transactional && m.read));
  assert.equal((await sql(c, `select count(*)::int as n from messages where read_at is null`))[0].n, 1, "only the in-app reminder is unread");

  const got = await sql(c, `select channel from claim_due_messages('2026-11-03T20:30:00Z'::timestamptz)`);
  assert.deepEqual(got.map((r) => r.channel).sort(), ["email", "sms"], "23:30 Nairobi");
});

test("a business that lapsed long ago is not texted when the job first runs", async () => {
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-09-01') where id = $1`, [ids.bizB]);
  await notices("2026-10-14T05:00:00Z");
  assert.equal((await sql(c, `select count(*)::int as n from messages where business_id = $1 and channel in ('sms','email')`, [ids.bizB]))[0].n, 0);
});

// ---------------------------------------------------------------------------
// Audience segments and the seller inbox
// ---------------------------------------------------------------------------
test("message_segment resolves known segments and rejects unknown ones", async () => {
  const list = async (s, now = MIDDAY) => (await sql(c, `select message_segment($1, $2::timestamptz) as id`, [s, now])).map((r) => r.id).sort();
  assert.deepEqual(await list("all_live"), [ids.bizA, ids.bizB].sort());
  assert.deepEqual(await list("category:barber"), [ids.bizA, ids.bizB].sort());
  assert.deepEqual(await list("category:nope"), []);
  await sql(c, `update businesses set paid_until = public.nairobi_midnight('2026-10-17') where id = $1`, [ids.bizA]);
  assert.deepEqual(await list("expiring_7d"), [ids.bizA]);
  await assert.rejects(list("everyone"), /unknown_segment/);
});

test("sellers see only their own delivered in-app messages, never queued ones or SMS/email delivery records", async () => {
  await sql(c, `
    insert into messages (business_id, channel, subject, body, status) values
      ('${ids.bizA}', 'in_app', 'delivered', 'b', 'delivered'),
      ('${ids.bizA}', 'in_app', 'queued for next week', 'b', 'queued'),
      ('${ids.bizA}', 'sms', 'an sms record', 'b', 'sent'),
      ('${ids.bizB}', 'in_app', 'for B', 'b', 'delivered')`);
  const seen = async (who) => (await tx(c, who, (k) => sql(k, `select subject from messages order by subject`))).map((r) => r.subject);
  assert.deepEqual(await seen(asA), ["delivered"]);
  assert.deepEqual(await seen(asB), ["for B"]);
});

test("an applicant-only message needs an application and dedupes per application", async () => {
  await assert.rejects(sql(c, `insert into messages (channel, subject, body) values ('sms', 's', 'b')`), /messages_target_check/);
  const app = "30000000-0000-0000-0000-0000000000a9";
  await sql(c, `
    insert into applications (id, reference_no, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
      phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, status)
    values ('${app}', 'EPM-2026-ZZZ999', 'barber', 'standard', 450, '{}', 'X', 'national_id', '1', '+254700000001', 'x@x.co', 'Applicant Co', false, 2020, 'S1', '2030-01-01',
      'Kisumu', 'Kisumu', 'Main', 0, 0, '+254700000001', '1', '1', true, 'submitted')`);
  const ins = () => sql(c, `insert into messages (application_id, channel, subject, body, status, dedupe_key) values ($1, 'sms', 's', 'b', 'queued', 'admin:abc12345:x:sms')`, [app]);
  await ins();
  await assert.rejects(ins(), /duplicate key|messages_application_dedupe_key/);
});
