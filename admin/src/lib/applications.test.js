import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_TABS, availableActions, canReview, describeError, eventLabel, flagPathLabel, formatBytes, isOverdue,
  maskValue, phoneNeedle, searchFilter, searchTerm, slotLabel, statusMeta, tabById, tabCounts, tabSortAscending,
} from "./applications.js";
import { normalizeCounts } from "./counts.js";
import { timeAgo } from "./time.js";

test("every status an application can have has a label, and unknown ones do not crash", () => {
  for (const s of ["submitted", "under_review", "changes_requested", "approved", "payment_confirming", "activated", "rejected"]) {
    assert.notEqual(statusMeta(s).label, s, s);
  }
  assert.equal(statusMeta("something_new").label, "something_new");
  assert.equal(statusMeta(undefined).label, "Unknown");
});

test("the tabs cover every reviewable status exactly once", () => {
  const all = APPLICATION_TABS.flatMap((t) => t.statuses).sort();
  assert.deepEqual(all, ["activated", "approved", "changes_requested", "payment_confirming", "rejected", "submitted", "under_review"]);
  assert.equal(new Set(all).size, all.length);
  assert.equal(tabById("nope").id, "submitted");
});

test("tab counts come from the same numbers as the sidebar", () => {
  const counts = tabCounts(normalizeCounts({ submitted: 4, under_review: 3, changes_requested: 2, awaiting_payment: 5, payment_confirming: 2 }));
  assert.deepEqual(counts, { submitted: 4, under_review: 3, changes_requested: 2, approved: 5, payment_confirming: 2, closed: undefined });
  assert.equal(tabCounts(undefined), undefined);
});

test("the live queue is oldest first and finished work newest first", () => {
  assert.equal(tabSortAscending("submitted"), true);
  assert.equal(tabSortAscending("payment_confirming"), true);
  assert.equal(tabSortAscending("closed"), false);
});

test("offered actions mirror what admin-decide-application accepts from each status", () => {
  assert.deepEqual(availableActions("submitted"), ["approve", "request_changes", "reject", "set_verification"]);
  assert.deepEqual(availableActions("under_review"), ["approve", "request_changes", "reject", "set_verification", "return_to_queue"]);
  assert.deepEqual(availableActions("changes_requested"), ["reject", "set_verification"]);
  assert.deepEqual(availableActions("approved"), ["set_verification"]);
  for (const s of ["payment_confirming", "activated", "rejected", "uploading"]) assert.deepEqual(availableActions(s), [], s);
});

test("only owner and reviewer can review applications", () => {
  assert.equal(canReview("owner"), true);
  assert.equal(canReview("reviewer"), true);
  for (const role of ["finance", "support", "", undefined, null]) assert.equal(canReview(role), false, String(role));
});

test("overdue means submitted and untouched for more than 24 hours", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const ago = (h) => new Date(now.getTime() - h * 3600_000).toISOString();
  assert.equal(isOverdue({ status: "submitted", submittedAt: ago(25) }, now), true);
  assert.equal(isOverdue({ status: "submitted", submittedAt: ago(23) }, now), false);
  assert.equal(isOverdue({ status: "under_review", submittedAt: ago(48) }, now), false);
  assert.equal(isOverdue({ status: "submitted", submittedAt: null }, now), false);
});

test("search input cannot break out of the PostgREST or() filter", () => {
  assert.equal(searchTerm('a,b(c)"d%e*f\\g'), "a b c d e f g");
  assert.equal(searchTerm("  Lakeside   Provisions  "), "Lakeside Provisions");
  assert.equal(searchTerm("x".repeat(200)).length, 60);
  assert.equal(searchFilter(""), "");
  assert.equal(searchFilter("a"), "");
  assert.equal(searchFilter("),status.eq.activated,("), "reference_no.ilike.%status.eq.activated%,business_name.ilike.%status.eq.activated%,owner_full_name.ilike.%status.eq.activated%,phone.ilike.%status.eq.activated%,email.ilike.%status.eq.activated%");
});

test("a local phone number also matches the stored international form", () => {
  assert.equal(phoneNeedle("0712 345 678"), "712345678");
  assert.equal(phoneNeedle("+254712345678"), "712345678");
  assert.equal(phoneNeedle("254712345678"), "712345678");
  assert.equal(phoneNeedle("Mara"), "");
  assert.equal(phoneNeedle("123"), "");
  assert.match(searchFilter("0712345678"), /phone\.ilike\.%712345678%$/);
  assert.doesNotMatch(searchFilter("Mara"), /phone\.ilike\.%Mara%,phone/);
});

test("document slots use the labels of the real upload slots", () => {
  assert.equal(slotLabel("owner_id_front"), "Owner ID or passport (front)");
  assert.equal(slotLabel("sbp"), "Single business permit");
  assert.equal(slotLabel("kra_pin_cert"), "KRA PIN certificate");
  assert.equal(slotLabel("cat_ppb_premises_licence"), "Ppb premises licence");
  assert.equal(slotLabel(""), "Document");
});

test("flag paths read the way a reviewer thinks of the field", () => {
  assert.equal(flagPathLabel("business.sbpNumber"), "Permit number");
  assert.equal(flagPathLabel("owner.fullName"), "Owner name");
  assert.equal(flagPathLabel("documents.sbp"), "Single business permit");
  assert.equal(flagPathLabel("templateValues.shop_size"), "Shop size");
  assert.equal(flagPathLabel("phone"), "Phone");
  assert.equal(flagPathLabel(undefined), "");
});

test("timeline events have readable labels, with a fallback for new event types", () => {
  assert.equal(eventLabel({ type: "submitted", data: {} }), "Application submitted");
  assert.equal(eventLabel({ type: "submitted", data: { resubmitted: true } }), "Resubmitted by the applicant");
  assert.equal(eventLabel({ type: "approve" }), "Approved");
  assert.equal(eventLabel({ type: "return_to_queue" }), eventLabel({ type: "returned_to_queue" }));
  assert.equal(eventLabel({ type: "document_viewed", data: { slot: "sbp" } }), "Document viewed: Single business permit");
  assert.equal(eventLabel({ type: "brand_new_thing" }), "Brand new thing");
});

test("sensitive numbers are masked down to their last characters", () => {
  assert.equal(maskValue("12345678"), "•••••678");
  assert.equal(maskValue("ab"), "••");
  assert.equal(maskValue(""), "");
  assert.equal(maskValue(null), "");
  assert.ok(!maskValue("A012345678Z").includes("0123"));
});

test("file sizes are readable", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
  assert.equal(formatBytes(undefined), "");
});

test("edge function error codes become actionable text, and raw codes never leak to the screen", () => {
  assert.match(describeError({ code: "mpesa_not_configured" }), /Settings/);
  assert.match(describeError({ code: "invalid_status" }), /different status/);
  assert.match(describeError({ code: "flag_or_note_required" }), /note/);
  assert.match(describeError({ code: "some_unknown_code" }), /went wrong/);
  assert.match(describeError(new Error("network_down")), /went wrong/);
  assert.equal(describeError(new Error("Failed to fetch")), "Failed to fetch");
});

test("timeAgo", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(timeAgo(ago(20_000), now), "just now");
  assert.equal(timeAgo(ago(5 * 60_000), now), "5m ago");
  assert.equal(timeAgo(ago(3 * 3600_000), now), "3h ago");
  assert.equal(timeAgo(ago(2 * 86400_000), now), "2d ago");
  assert.match(timeAgo(ago(30 * 86400_000), now), /2026/);
  assert.equal(timeAgo(null, now), "");
  assert.equal(timeAgo("garbage", now), "");
});

import { buildDecisionPayload, validateDecision } from "./applications.js";

const ID = "00000000-0000-4000-8000-000000002041";

test("a decision payload carries only the fields that action uses", () => {
  const p = buildDecisionPayload({
    applicationId: ID, action: "reject", reason: "  Permit expired ", note: "ignored", verificationLevel: "verified", priceOverride: "100",
    channels: { sms: true, email: false },
  });
  assert.deepEqual(p, { applicationId: ID, action: "reject", reason: "Permit expired", channels: { sms: true, email: false, inApp: false }, preview: false });
});

test("approve can carry a verification level and a price override with its reason", () => {
  const p = buildDecisionPayload({
    applicationId: ID, action: "approve", reason: "Discount agreed by phone", verificationLevel: "verified", priceOverride: "1200",
    channels: { sms: true, email: true }, preview: true,
  });
  assert.equal(p.priceOverride, 1200);
  assert.equal(p.verificationLevel, "verified");
  assert.equal(p.reason, "Discount agreed by phone");
  assert.equal(p.preview, true);
});

test("empty fields are left out so the server's own validation decides", () => {
  const p = buildDecisionPayload({ applicationId: ID, action: "request_changes", note: "   ", channels: {} });
  assert.deepEqual(p, { applicationId: ID, action: "request_changes", channels: { sms: false, email: false, inApp: false }, preview: false });
  assert.equal("priceOverride" in buildDecisionPayload({ applicationId: ID, action: "approve", priceOverride: "abc", channels: {} }), false);
});

test("long text is cut to what the function accepts", () => {
  assert.equal(buildDecisionPayload({ applicationId: ID, action: "reject", reason: "x".repeat(900), channels: {} }).reason.length, 500);
  assert.equal(buildDecisionPayload({ applicationId: ID, action: "request_changes", note: "x".repeat(2000), channels: {} }).note.length, 1000);
});

test("validation matches the edge function's rules", () => {
  assert.match(validateDecision({ action: "reject", reason: " " }), /reason/);
  assert.equal(validateDecision({ action: "reject", reason: "Expired permit" }), "");
  assert.match(validateDecision({ action: "request_changes", note: "" }, { openFlags: 0 }), /note/);
  assert.equal(validateDecision({ action: "request_changes", note: "" }, { openFlags: 2 }), "");
  assert.equal(validateDecision({ action: "request_changes", note: "Blurry photo" }), "");
  assert.match(validateDecision({ action: "set_verification" }), /verification/);
  assert.equal(validateDecision({ action: "set_verification", verificationLevel: "verified" }), "");
  assert.equal(validateDecision({ action: "approve" }), "");
  assert.match(validateDecision({ action: "approve", priceOverride: "1200" }), /reason/);
  assert.match(validateDecision({ action: "approve", priceOverride: "-5", reason: "x" }), /whole number/);
  assert.match(validateDecision({ action: "approve", priceOverride: "1.5", reason: "x" }), /whole number/);
  assert.match(validateDecision({ action: "approve", priceOverride: "100001", reason: "x" }), /whole number/);
  assert.equal(validateDecision({ action: "approve", priceOverride: "1200", reason: "Agreed" }), "");
  assert.equal(validateDecision({ action: "return_to_queue" }), "");
});

test("a status-code request shows when its SMS failed or was never really sent", () => {
  assert.equal(eventLabel({ type: "otp_requested", data: {} }), "Applicant requested a status code");
  assert.equal(eventLabel({ type: "otp_requested", data: { sms: "sent" } }), "Applicant requested a status code");
  assert.equal(
    eventLabel({ type: "otp_requested", data: { sms: "failed", error: "at_InsufficientBalance" } }),
    "Applicant requested a status code, but the SMS failed (at_InsufficientBalance)",
  );
  assert.match(eventLabel({ type: "otp_requested", data: { sms: "mock" } }), /mock mode/);
});
