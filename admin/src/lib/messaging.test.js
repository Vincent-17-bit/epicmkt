import test from "node:test";
import assert from "node:assert/strict";
import { ago, automationHealth, buildBroadcast, cancelOutcome, isSystemTemplate, missingVariables, samePayload, segmentKey, smsInfo, templateVariables } from "./messaging.js";

const NOW = Date.parse("2026-10-21T09:00:00Z");
const iso = (minutesBack) => new Date(NOW - minutesBack * 60000).toISOString();

test("SMS length reports segments and the four-segment limit", () => {
  assert.deepEqual(smsInfo(""), { length: 0, segments: 0, over: false });
  assert.equal(smsInfo("a".repeat(160)).segments, 1);
  assert.equal(smsInfo("a".repeat(161)).segments, 2);
  assert.equal(smsInfo("a".repeat(306)).segments, 2);
  assert.equal(smsInfo("a".repeat(307)).segments, 3);
  assert.equal(smsInfo("a".repeat(612)).over, false);
  assert.equal(smsInfo("a".repeat(613)).over, true);
});

test("template variables are found once each, in order, and built-ins are never 'missing'", () => {
  assert.deepEqual(templateVariables("Hi {{business_name}}, pay by {{ paid_until }}", "{{business_name}} {{offer}}"), ["business_name", "paid_until", "offer"]);
  assert.deepEqual(templateVariables(null, "no variables"), []);
  assert.deepEqual(missingVariables(["business_name", "offer", "code"], { code: "X1" }), ["offer"]);
});

test("segments: category and town need a value", () => {
  assert.equal(segmentKey("all_live"), "all_live");
  assert.equal(segmentKey("category", " barber "), "category:barber");
  assert.equal(segmentKey("category", ""), "");
  assert.equal(segmentKey("town", "Kisumu"), "town:Kisumu");
  assert.equal(segmentKey("everyone"), "");
});

test("a broadcast request is built only from a complete form", () => {
  const ok = { segment: "expiring_7d", sms: true, body: "Renew today", lang: "en" };
  const { payload } = buildBroadcast(ok, { preview: true, idempotencyKey: "abcdef12" });
  assert.deepEqual(payload, { target: { segment: "expiring_7d" }, channels: { sms: true, email: false, inApp: false }, lang: "en", variables: {}, preview: true, body: "Renew today", idempotencyKey: "abcdef12" });

  assert.match(buildBroadcast({ ...ok, segment: "town", segmentValue: "" }).error, /who should receive/);
  assert.match(buildBroadcast({ ...ok, sms: false }).error, /at least one channel/);
  assert.match(buildBroadcast({ ...ok, body: " " }).error, /Write a message/);
  assert.match(buildBroadcast({ ...ok, sms: false, email: true }).error, /subject/);
  assert.match(buildBroadcast({ ...ok, body: "a".repeat(613) }).error, /612/);
  assert.match(buildBroadcast({ ...ok, scheduledAt: "not a date" }).error, /not valid/);

  const tpl = buildBroadcast({ segment: "all_live", email: true, templateKey: "newsletter", lang: "sw", transactional: false, scheduledAt: "2026-10-22T07:00:00Z" }).payload;
  assert.equal(tpl.templateKey, "newsletter");
  assert.equal(tpl.body, undefined, "a template supplies its own text");
  assert.equal(tpl.lang, "sw");
  assert.equal(tpl.transactional, false);
  assert.equal(tpl.scheduledAt, "2026-10-22T07:00:00.000Z");
});

test("a send must match what was previewed", () => {
  const a = buildBroadcast({ segment: "all_live", sms: true, body: "Hi" }, { preview: true }).payload;
  const b = buildBroadcast({ segment: "all_live", sms: true, body: "Hi" }, { idempotencyKey: "abcdef12" }).payload;
  const c = buildBroadcast({ segment: "all_live", sms: true, body: "Hi!" }).payload;
  assert.equal(samePayload(a, b), true);
  assert.equal(samePayload(a, c), false);
  assert.equal(samePayload(null, a), false);
});

const healthyStatus = () => ({
  cron_installed: true, expected: ["dispatch-messages", "daily-lifecycle"],
  jobs: [
    { name: "dispatch-messages", active: true, last_run: { status: "succeeded", started_at: iso(1) } },
    { name: "daily-lifecycle", active: true, last_run: { status: "succeeded", started_at: iso(300) } },
  ],
  queue: { queued: 0, due_now: 0, oldest_due_at: null, failed_7d: 0 },
});

test("automation health: everything running", () => {
  assert.deepEqual(automationHealth(healthyStatus(), NOW), { level: "healthy", problems: [] });
  assert.equal(automationHealth(null).level, "checking");
});

test("automation health: the silent failures are named, with the fix", () => {
  const none = automationHealth({ ...healthyStatus(), cron_installed: false, jobs: [] }, NOW);
  assert.equal(none.level, "down");
  assert.match(none.problems[0].text, /pg_cron/);
  assert.match(none.problems[0].fix, /schedule\.sql/);

  const missing = healthyStatus(); missing.jobs.pop();
  const m = automationHealth(missing, NOW);
  assert.equal(m.level, "down");
  assert.match(m.problems[0].text, /Daily reminders and expiry.*not scheduled/);

  const paused = healthyStatus(); paused.jobs[0].active = false;
  assert.match(automationHealth(paused, NOW).problems[0].text, /paused/);

  const failed = healthyStatus(); failed.jobs[0].last_run = { status: "failed", started_at: iso(1), message: "401 unauthorized" };
  const f = automationHealth(failed, NOW);
  assert.equal(f.level, "degraded");
  assert.match(f.problems[0].text, /failed: 401 unauthorized/);
});

test("automation health: a backed-up queue means sending has stopped even if the job looks fine", () => {
  const s = healthyStatus(); s.queue = { queued: 12, due_now: 12, oldest_due_at: iso(40), failed_7d: 0 };
  const h = automationHealth(s, NOW);
  assert.equal(h.level, "down");
  assert.match(h.problems[0].text, /12 messages have been waiting to send for 40 minutes/);
  s.queue.oldest_due_at = iso(3);
  assert.equal(automationHealth(s, NOW).level, "healthy", "a few minutes of backlog is normal");
  s.queue = { queued: 1, due_now: 1, oldest_due_at: iso(180), failed_7d: 0 };
  assert.match(automationHealth(s, NOW).problems[0].text, /3 hours/);
});

test("automation health: daily job that has not run for a day, failed messages, and ordering of problems", () => {
  const s = healthyStatus(); s.jobs[1].last_run.started_at = iso(27 * 60); s.queue.failed_7d = 1;
  const h = automationHealth(s, NOW);
  assert.equal(h.level, "degraded");
  assert.equal(h.problems.length, 2);
  const never = healthyStatus(); never.jobs[1].last_run = null;
  assert.match(automationHealth(never, NOW).problems[0].text, /has not run yet/);
  const mixed = healthyStatus(); mixed.queue.failed_7d = 2; mixed.jobs[0].active = false;
  assert.equal(automationHealth(mixed, NOW).problems[0].level, "down", "the worst problem is listed first");
});

test("relative times", () => {
  assert.equal(ago(null, NOW), "never");
  assert.equal(ago(iso(0), NOW), "just now");
  assert.equal(ago(iso(5), NOW), "5 min ago");
  assert.equal(ago(iso(180), NOW), "3 h ago");
  assert.equal(ago(iso(60 * 24 * 5), NOW), "5 days ago");
});

test("cancelling a broadcast says how many were cancelled and how many had already gone", () => {
  assert.equal(cancelOutcome({ cancelled: 6, sent: 2, inFlight: 0 }), "6 cancelled, 2 already sent.");
  assert.equal(cancelOutcome({ cancelled: 4, sent: 0, inFlight: 3 }), "4 cancelled, 0 already sent, 3 on the way.");
  assert.equal(cancelOutcome({ cancelled: 0, sent: 5, inFlight: 0 }), "Nothing left to cancel: 5 already sent.");
});

test("the templates the system writes are protected, ordinary ones are not", () => {
  for (const key of ["welcome", "login_details", "application.approve", "billing_reminder"]) assert.equal(isSystemTemplate(key), true, key);
  for (const key of ["renew_7d", "newsletter", "billing", "applications"]) assert.equal(isSystemTemplate(key), false, key);
});
