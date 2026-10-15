import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketDaily, bucketMonthly, compactNumber, dayKeys, durationText, eatDayKey, eatDayLabel, formatKes, monthKeys, monthStartIso, niceMax, statusSlices, weekTrend } from "./series.js";
import { buildBrief } from "./brief.js";
import { attentionItems } from "./attention.js";
import { describeNotification } from "./notify.js";
import { buildDashboard } from "../api/dashboard.js";

const NOW = new Date("2026-10-15T09:00:00Z"); // 12:00 in Nairobi

test("days and months are Nairobi days and months, not UTC", () => {
  assert.equal(eatDayKey("2026-10-14T21:30:00Z"), "2026-10-15"); // 00:30 EAT
  assert.equal(eatDayKey("2026-10-14T20:59:00Z"), "2026-10-14");
  assert.equal(eatDayLabel(NOW), "Thu 15 Oct");
  assert.deepEqual(dayKeys(3, NOW), ["2026-10-13", "2026-10-14", "2026-10-15"]);
  assert.deepEqual(dayKeys(3, NOW, "forward"), ["2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.deepEqual(monthKeys(3, NOW).map((m) => m.key), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(monthKeys(2, new Date("2026-01-10T00:00:00Z")).map((m) => m.key), ["2025-12", "2026-01"]);
  assert.equal(monthStartIso("2026-10"), "2026-09-30T21:00:00.000Z");
});

test("bucketing counts rows, sums values and ignores bad dates", () => {
  const keys = dayKeys(3, NOW);
  const rows = [
    { at: "2026-10-15T01:00:00Z", v: 100 }, { at: "2026-10-15T08:00:00Z", v: 50 },
    { at: "2026-10-13T10:00:00Z", v: 5 }, { at: "2026-10-01T10:00:00Z", v: 9 }, { at: null, v: 7 }, { at: "garbage", v: 7 },
  ];
  assert.deepEqual(bucketDaily(rows, "at", keys), [1, 0, 2]);
  assert.deepEqual(bucketDaily(rows, "at", keys, "v"), [5, 0, 150]);
  assert.deepEqual(bucketMonthly(rows, "at", monthKeys(2, NOW), "v"), [0, 164]);
  assert.deepEqual(bucketDaily(undefined, "at", keys), [0, 0, 0]);
});

test("weekTrend compares the last 7 values with the 7 before", () => {
  assert.deepEqual(weekTrend([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]), { current: 14, previous: 7, change: 7 });
  assert.deepEqual(weekTrend([]), { current: 0, previous: 0, change: 0 });
});

test("status slices split the visible total so nothing is counted twice", () => {
  const slices = statusSlices({ live: 100, expiring_7d: 6, in_grace: 2, expired: 9, suspended: 1 });
  assert.deepEqual(slices.map((s) => s.value), [92, 6, 2, 9, 1]);
  assert.equal(statusSlices({ live: 1, expiring_7d: 5, in_grace: 5 })[0].value, 0);
});

test("number formatting", () => {
  assert.equal(formatKes(12400), "KES 12,400");
  assert.equal(compactNumber(12400), "12.4k");
  assert.equal(compactNumber(1_250_000), "1.3M");
  assert.equal(compactNumber(900), "900");
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(37), 50);
  assert.equal(niceMax(120), 200);
  assert.equal(durationText(10 * 60_000), "10 min");
  assert.equal(durationText(26 * 3_600_000), "26 h");
  assert.equal(durationText(60 * 3_600_000), "2 days");
});

test("the brief reads like the example and is always the same for the same counts", () => {
  const counts = { submitted: 4, unconfirmed_payments: 2, expiring_7d: 6 };
  const brief = buildBrief(counts);
  assert.equal(brief.text, "4 applications are waiting, 2 payments need confirming and 6 sellers expire within 7 days.");
  assert.equal(brief.tone, "busy");
  assert.deepEqual(brief.actions.map((a) => a.label), ["Review queue", "Confirm payments", "See expiring sellers"]);
  assert.equal(brief.actions[0].primary, true);
  assert.deepEqual(buildBrief(counts), brief);
});

test("the brief handles singular, urgent, overflow and empty cases", () => {
  assert.equal(buildBrief({ submitted: 1 }).text, "1 application is waiting.");
  assert.equal(buildBrief({ submitted: 1, unconfirmed_payments: 1 }).text, "1 application is waiting and 1 payment needs confirming.");
  const urgent = buildBrief({ submitted: 3 }, { waitingOver24h: 2 });
  assert.equal(urgent.text, "3 applications are waiting (2 for over 24 hours).");
  assert.equal(urgent.tone, "urgent");
  assert.equal(buildBrief({ failed_messages: 3 }).tone, "urgent");
  const many = buildBrief({ submitted: 1, unconfirmed_payments: 1, expiring_7d: 1, failed_messages: 1, open_flags: 1, pending_changes: 1 });
  assert.match(many.text, /\. 3 more areas need a look\.$/);
  assert.equal(many.actions.length, 3);
  const calm = buildBrief({});
  assert.equal(calm.tone, "calm");
  assert.equal(calm.total, 0);
  assert.match(calm.text, /all caught up/);
  assert.ok(calm.actions.length <= 3);
});

test("the brief never mentions or links to what a role cannot open", () => {
  const finance = (permission) => ["payments.view", "payments.confirm", "businesses.view", "messages.view"].includes(permission);
  const brief = buildBrief({ submitted: 9, unconfirmed_payments: 2 }, { can: finance });
  assert.equal(brief.text, "2 payments need confirming.");
  assert.ok(brief.actions.every((a) => !a.to.includes("applications")));
  const viewOnly = buildBrief({ unconfirmed_payments: 2 }, { can: (p) => p === "payments.view" });
  assert.equal(viewOnly.actions[0].label, "View payments");
});

test("attention rows: urgent first, role-filtered, with the right inline action", () => {
  const counts = { submitted: 4, under_review: 1, unconfirmed_payments: 2, failed_messages: 3, open_flags: 1, open_reports: 2, expiring_7d: 6, in_grace: 2, pending_changes: 0 };
  const oldest = { applications: { id: "app-1", at: "2026-10-14T06:00:00Z" }, payments: "2026-10-15T07:00:00Z", expiry: "2026-10-16T09:00:00Z" };
  const rows = attentionItems(counts, oldest, { now: NOW });
  assert.deepEqual(rows.map((r) => r.id), ["applications", "failed", "expiring", "payments", "moderation"]);
  const apps = rows[0];
  assert.equal(apps.tone, "danger"); // waited 27 hours
  assert.match(apps.detail, /Oldest has waited 27 h/);
  assert.deepEqual([apps.action.kind, apps.action.applicationId], ["startReview", "app-1"]);
  assert.equal(rows.find((r) => r.id === "expiring").count, 8);
  assert.equal(rows.find((r) => r.id === "moderation").count, 3);

  const finance = attentionItems(counts, oldest, { now: NOW, can: (p) => ["payments.view", "payments.confirm", "messages.view"].includes(p) });
  assert.deepEqual(finance.map((r) => r.id), ["failed", "payments"]);
  const noDecide = attentionItems(counts, oldest, { now: NOW, can: (p) => p === "applications.view" });
  assert.equal(noDecide[0].action.kind, "link");
});

test("snoozed rows are flagged until the snooze ends", () => {
  const counts = { failed_messages: 1 };
  const until = NOW.getTime() + 60_000;
  assert.equal(attentionItems(counts, {}, { now: NOW, snoozed: { failed: until } })[0].snoozed, true);
  assert.equal(attentionItems(counts, {}, { now: new Date(until + 1), snoozed: { failed: until } })[0].snoozed, false);
});

test("notifications become words and a destination", () => {
  const app = describeNotification({ kind: "application_submitted", data: { business_name: "Mara Mart", reference_no: "EPM-2026-0042" } });
  assert.deepEqual([app.title, app.detail], ["New application", "Mara Mart · EPM-2026-0042"]);
  const pay = describeNotification({ kind: "payment_submitted", data: { kind: "renewal" }, business: { name: "Umoja Hardware" } });
  assert.deepEqual([pay.title, pay.to], ["Renewal payment", "/admin/payments?status=submitted"]);
  assert.match(describeNotification({ kind: "change_request", data: { field: "pin" } }).detail, /KRA PIN/);
  const odd = describeNotification({ kind: "something_new", data: {} });
  assert.equal(odd.title, "Something new");
  assert.equal(describeNotification(null).title, "Notification");
});

test("the dashboard shape has 14 daily points, 6 months and keeps nulls out of the maths", () => {
  const d = buildDashboard({
    waitingOver24h: 2,
    oldest: { applications: { id: "a", at: "2026-10-14T00:00:00Z" } },
    applications: [{ submitted_at: "2026-10-15T05:00:00Z" }, { submitted_at: "2026-10-15T06:00:00Z" }],
    payments: [{ created_at: "2026-10-14T05:00:00Z" }],
    confirmed: [{ confirmed_at: "2026-10-10T05:00:00Z", amount_kes: 2500 }, { confirmed_at: "2026-09-10T05:00:00Z", amount_kes: 1000 }],
    activations: [{ first_paid_at: "2026-10-12T05:00:00Z" }],
    lapses: [{ paid_until: "2026-09-20T05:00:00Z" }],
    upcoming: [{ paid_until: "2026-10-17T05:00:00Z" }],
  }, NOW);
  assert.equal(d.series.applications.length, 14);
  assert.equal(d.series.applications.at(-1), 2);
  assert.equal(d.series.payments.at(-2), 1);
  assert.equal(d.series.expiries.length, 14);
  assert.equal(d.series.expiries[2], 1); // two days from now
  assert.equal(d.series.revenue.at(-6), 2500);
  assert.deepEqual(d.revenue.map((m) => m.label), ["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
  assert.deepEqual(d.revenue.slice(-2).map((m) => m.kes), [1000, 2500]);
  assert.deepEqual(d.newVsLapsed.slice(-2).map((m) => [m.added, m.lapsed]), [[0, 1], [1, 0]]);
  assert.equal(d.waitingOver24h, 2);
  const empty = buildDashboard({}, NOW);
  assert.equal(empty.revenue.every((m) => m.kes === 0), true);
  assert.equal(empty.oldest.payments, null);
});
