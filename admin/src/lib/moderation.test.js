import test from "node:test";
import assert from "node:assert/strict";
import {
  changeCost, changeFieldLabel, changeValue, dueLabel, groupRadar, radarBucket, reportReasonLabel, revenueAtRisk, whatsappLink, daysLeftLabel,
} from "./moderation.js";

const NOW = Date.parse("2026-10-21T09:00:00Z");
const DAY = 86400000;

test("report reasons read as words, and unknown ones are cleaned up", () => {
  assert.equal(reportReasonLabel("wrong_price"), "Wrong price");
  assert.equal(reportReasonLabel("fake-listing"), "Fake listing");
  assert.equal(reportReasonLabel(""), "No reason given");
});

test("due labels: overdue, today, future, resolved and missing", () => {
  assert.equal(dueLabel({ status: "open", due_at: new Date(NOW - 2 * DAY - 1000).toISOString() }, NOW), "Overdue by 3 days");
  assert.equal(dueLabel({ status: "open", due_at: new Date(NOW - 60 * 1000).toISOString() }, NOW), "Overdue by 1 day");
  assert.equal(dueLabel({ status: "open", due_at: new Date(NOW + 3 * 3600000).toISOString() }, NOW), "Due today");
  assert.equal(dueLabel({ status: "replied", due_at: new Date(NOW + 2 * DAY + 3600000).toISOString() }, NOW), "Due in 2 days");
  assert.equal(dueLabel({ status: "open", due_at: new Date(NOW + DAY + 3600000).toISOString() }, NOW), "Due in 1 day");
  assert.equal(dueLabel({ status: "resolved", due_at: new Date(NOW - DAY).toISOString() }, NOW), "");
  assert.equal(dueLabel({ status: "open", due_at: null }, NOW), "");
  assert.equal(dueLabel(null, NOW), "");
});

test("change requests show names for categories, a dash for empty values, and the cost of a dearer category", () => {
  assert.equal(changeFieldLabel("pin"), "KRA PIN");
  assert.equal(changeFieldLabel("mystery"), "mystery");
  assert.equal(changeValue({ old_value: "barber", old_label: "Barber" }, "old"), "Barber");
  assert.equal(changeValue({ new_value: "+254700000001" }, "new"), "+254700000001");
  assert.equal(changeValue({ old_value: null }, "old"), "–");
  assert.equal(changeCost({ field: "phone", extra_due_kes: 500 }), "");
  assert.equal(changeCost({ field: "category_id", extra_due_kes: 0, new_monthly_price: null }), "");
  assert.equal(
    changeCost({ field: "category_id", extra_due_kes: 650, new_monthly_price: 1500, applies_from_next_renewal: true }),
    "The seller owes KES 650 now; new monthly price KES 1,500 from the next renewal.",
  );
});

test("radar buckets follow the database's state and days left", () => {
  assert.equal(radarBucket({ state: "expired", days_left: -5 }), "expired");
  assert.equal(radarBucket({ state: "grace", days_left: -1 }), "grace");
  assert.equal(radarBucket({ state: "active", days_left: 0 }), "today");
  assert.equal(radarBucket({ state: "active", days_left: 7 }), "week");
  assert.equal(radarBucket({ state: "active", days_left: 8 }), "month");
});

test("grouping keeps every bucket, sorts nearest first, and totals revenue still to be collected", () => {
  const rows = [
    { name: "B", state: "active", days_left: 5, monthly_price: 1000 },
    { name: "A", state: "active", days_left: 2, monthly_price: 1300 },
    { name: "C", state: "expired", days_left: -3, monthly_price: 800, payment_waiting: true },
    { name: "D", state: "active", days_left: 20, monthly_price: 500 },
  ];
  const groups = groupRadar(rows);
  assert.deepEqual(groups.map((g) => g.id), ["expired", "grace", "today", "week", "month"]);
  assert.deepEqual(groups.find((g) => g.id === "week").rows.map((r) => r.name), ["A", "B"]);
  assert.equal(groups.find((g) => g.id === "grace").rows.length, 0);
  assert.equal(revenueAtRisk(rows), 2800, "a payment already waiting to be confirmed is not at risk");
  assert.equal(revenueAtRisk(), 0);
});

test("days-left labels", () => {
  assert.equal(daysLeftLabel({ state: "expired", days_left: -1 }), "Lapsed 1 day ago");
  assert.equal(daysLeftLabel({ state: "expired", days_left: -4 }), "Lapsed 4 days ago");
  assert.equal(daysLeftLabel({ state: "grace", days_left: -1 }), "In grace");
  assert.equal(daysLeftLabel({ state: "active", days_left: 0 }), "Ends today");
  assert.equal(daysLeftLabel({ state: "active", days_left: 1 }), "Ends tomorrow");
  assert.equal(daysLeftLabel({ state: "active", days_left: 6 }), "6 days left");
});

test("WhatsApp links accept Kenyan local and international numbers and refuse junk", () => {
  assert.equal(whatsappLink("0712 345 678"), "https://wa.me/254712345678");
  assert.equal(whatsappLink("+254 722 345 678", "Hi there"), "https://wa.me/254722345678?text=Hi%20there");
  assert.equal(whatsappLink("254112345678"), "https://wa.me/254112345678");
  assert.equal(whatsappLink("+447911123456"), "https://wa.me/447911123456");
  assert.equal(whatsappLink("12345"), null);
  assert.equal(whatsappLink(null), null);
});
