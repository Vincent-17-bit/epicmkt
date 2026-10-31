import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLoginDelivery } from "./loginDelivery.js";

const row = (channel, status, created_at) => ({ channel, status, created_at });

test("reports each channel and flags a failure", () => {
  const out = summarizeLoginDelivery([row("sms", "sent", "2026-10-01T10:00:00Z"), row("email", "failed", "2026-10-01T10:00:00Z")]);
  assert.equal(out.label, "Login sent: SMS ok / email failed");
  assert.deepEqual([out.sms, out.email, out.failed], ["ok", "failed", true]);
});

test("the newest row per channel wins, so a resend clears the flag", () => {
  const out = summarizeLoginDelivery([
    row("sms", "sent", "2026-10-02T10:00:00Z"), row("email", "sent", "2026-10-02T10:00:00Z"),
    row("sms", "failed", "2026-10-01T10:00:00Z"), row("email", "failed", "2026-10-01T10:00:00Z"),
  ]);
  assert.equal(out.label, "Login sent: SMS ok / email ok");
  assert.equal(out.failed, false);
});

test("no rows means nothing was recorded", () => {
  const out = summarizeLoginDelivery([]);
  assert.equal(out.label, "Login not sent yet");
  assert.deepEqual([out.sms, out.email, out.failed, out.sentAt], ["unknown", "unknown", false, null]);
});
