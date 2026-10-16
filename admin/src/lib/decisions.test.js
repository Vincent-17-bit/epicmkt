import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRequest, buildSession, canDo, channelAvailable, defaultChannels, nextOpen, progress, smsSegments, step, validateDecision,
} from "./decisions.js";
import mock from "../api/mock.js";

const app = { id: "x", status: "submitted", phone: "+254700", email: null, flags: [], verificationLevel: "unverified", price: 3200 };
const draft = (over) => ({ action: "approve", channels: { sms: true, email: false, inApp: false }, ...over });

test("reject needs a reason, approve does not", () => {
  assert.equal(validateDecision(app, draft({ action: "reject" })).errors.reason, "A reason is required to reject.");
  assert.ok(validateDecision(app, draft({ action: "approve" })).ok);
});

test("request_changes needs an open flag or a note", () => {
  assert.ok(validateDecision(app, draft({ action: "request_changes" })).errors.note);
  assert.ok(validateDecision(app, draft({ action: "request_changes", note: "Fix permit" })).ok);
  const flagged = { ...app, flags: [{ status: "open" }] };
  assert.ok(validateDecision(flagged, draft({ action: "request_changes" })).ok);
});

test("price override needs a whole-number price and a reason", () => {
  assert.ok(validateDecision(app, draft({ priceOverride: "12.5", reason: "x" })).errors.priceOverride);
  assert.ok(validateDecision(app, draft({ priceOverride: "1000" })).errors.reason);
  assert.ok(validateDecision(app, draft({ priceOverride: "1000", reason: "Launch discount" })).ok);
});

test("unavailable channels are refused", () => {
  assert.ok(validateDecision(app, draft({ channels: { sms: false, email: true, inApp: false } })).errors.channels);
  assert.ok(validateDecision(app, draft({ channels: { sms: false, email: false, inApp: true } })).errors.channels);
  assert.equal(channelAvailable(app, "sms"), true);
  assert.deepEqual(defaultChannels(app), { sms: true, email: false, inApp: false });
});

test("actions follow the server's status table", () => {
  assert.equal(canDo("approve", "changes_requested"), false);
  assert.equal(canDo("reject", "changes_requested"), true);
  assert.equal(canDo("return_to_queue", "submitted"), false);
});

test("request body matches the edge function contract", () => {
  const body = buildRequest(app, draft({ priceOverride: "1000", reason: " Launch ", verificationLevel: "verified" }));
  assert.deepEqual(body, {
    applicationId: "x", action: "approve", channels: { sms: true, email: false, inApp: false },
    preview: false, reason: "Launch", verificationLevel: "verified", priceOverride: 1000,
  });
});

test("sms segments", () => {
  assert.equal(smsSegments(""), 0);
  assert.equal(smsSegments("a".repeat(160)), 1);
  assert.equal(smsSegments("a".repeat(161)), 2);
});

test("session, stepping and progress", () => {
  const apps = [{ id: "1", status: "submitted" }, { id: "2", status: "approved" }, { id: "3", status: "under_review" }, { id: "4", status: "submitted" }];
  const s = buildSession(apps);
  assert.deepEqual(s.ids, ["1", "3", "4"]);
  const decided = new Set(["3"]);
  assert.equal(step(s.ids, decided, "1", 1), "4");
  assert.equal(step(s.ids, decided, "1", -1), "1");
  assert.equal(nextOpen(s.ids, decided, "1"), "4");
  assert.equal(nextOpen(s.ids, new Set(s.ids), "1"), null);
  assert.equal(progress(s.ids, decided, "4").label, "3 of 3");
  assert.equal(progress(s.ids, new Set(), "3").label, "2 of 3");
  assert.equal(progress(s.ids, new Set(s.ids), null).clear, true);
  assert.equal(progress([], new Set(), null).clear, false);
});

test("mock API: preview sends nothing, decide changes status, errors match the server", async () => {
  mock.resetMock();
  const [first] = await mock.getApplications();
  const before = { applicationId: first.id, action: "approve", channels: { sms: true, email: true, inApp: false } };
  const preview = await mock.decideApplication({ ...before, preview: true });
  assert.match(preview.messages.sms.body, /Pay KES 3200 to M-Pesa Till 523456/);
  assert.equal((await mock.getApplications())[0].status, "submitted");

  const done = await mock.decideApplication(before);
  assert.deepEqual(done.queued, ["sms", "email"]);
  assert.equal((await mock.getApplications())[0].status, "approved");

  await assert.rejects(mock.decideApplication({ ...before }), { code: "invalid_status" });
  await assert.rejects(mock.decideApplication({ applicationId: "a4444444-4444-4444-8444-444444444444", action: "reject", channels: {} }), { code: "reason_required" });
});
