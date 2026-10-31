import { test } from "node:test";
import assert from "node:assert/strict";
import { toApiError } from "./errors.js";
import { cancelBroadcast, deleteTemplate, getMessageDetail, listMessageLog, listPendingBroadcasts, listTemplates, sendBroadcast, setTemplateEnabled } from "./mockMessaging.js";

const sms = { sms: true, email: false, inApp: false };

test("a scheduled broadcast waits in the list and cancelling reports the split", async () => {
  const before = (await listPendingBroadcasts()).length;
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const sent = await sendBroadcast({ target: { segment: "expiring_7d" }, channels: sms, body: "Offer", scheduledAt: later, idempotencyKey: "batch-test-1", preview: false });
  assert.equal(sent.batchId, "batch-test-1");
  const waiting = await listPendingBroadcasts();
  assert.equal(waiting.length, before + 1);
  const batch = waiting.find((b) => b.batch_id === "batch-test-1");
  assert.equal(batch.pending, sent.queued);

  const result = await cancelBroadcast({ batchId: "batch-test-1", reason: "Wrong audience" });
  assert.deepEqual(result, { cancelled: sent.queued, sent: 0, failed: 0, inFlight: 0, total: sent.queued });
  assert.equal((await listPendingBroadcasts()).some((b) => b.batch_id === "batch-test-1"), false);
});

test("an immediate broadcast never appears as waiting, and an unknown broadcast is refused", async () => {
  const before = (await listPendingBroadcasts()).length;
  await sendBroadcast({ target: { segment: "all_live" }, channels: sms, body: "Now", preview: false });
  assert.equal((await listPendingBroadcasts()).length, before);
  await assert.rejects(cancelBroadcast({ batchId: "nope" }), { code: "broadcast_not_found" });
  await assert.rejects(cancelBroadcast({ batchId: null }), { code: "invalid_input" });
});

test("a template can be disabled, is then refused for a broadcast, and can be enabled again", async () => {
  assert.equal(await setTemplateEnabled({ key: "newsletter", enabled: false }), true);
  assert.equal(await setTemplateEnabled({ key: "newsletter", enabled: false }), false);
  const row = (await listTemplates()).find((t) => t.key === "newsletter");
  assert.ok(row.disabled_at);
  await assert.rejects(sendBroadcast({ target: { segment: "all_live" }, channels: { sms: false, email: true, inApp: false }, templateKey: "newsletter", preview: true }), { code: "template_disabled" });
  assert.equal(await setTemplateEnabled({ key: "newsletter", enabled: true }), true);
  await assert.rejects(setTemplateEnabled({ key: "missing", enabled: true }), { code: "template_not_found" });
});

test("system templates cannot be deleted, ordinary ones can", async () => {
  assert.equal((await listTemplates()).find((t) => t.key === "welcome").system, true);
  await assert.rejects(deleteTemplate("welcome"), { code: "template_in_use" });
  await assert.rejects(deleteTemplate("missing"), { code: "template_not_found" });
  assert.equal(await deleteTemplate("renew_7d"), true);
  assert.equal((await listTemplates()).some((t) => t.key === "renew_7d"), false);
});

test("the log names applicants and the detail returns the full message", async () => {
  const { rows } = await listMessageLog({});
  const applicant = rows.find((r) => r.application_id);
  assert.equal(applicant.application_name, "Kamau Cuts");
  assert.equal("body" in applicant, false, "the list stays light");
  const detail = await getMessageDetail(applicant.id);
  assert.match(detail.body, /review your documents/);
  assert.equal(detail.applicant_name, "Wanjiku Kamau");
  await assert.rejects(getMessageDetail("nope"), { code: "message_not_found" });
});

test("server refusals read as plain sentences", () => {
  assert.match(toApiError({ message: "broadcast_not_found" }).message, /no longer exists/);
  assert.match(toApiError({ message: "template_not_found" }).message, /no longer exists/);
  assert.match(toApiError({ message: "template_in_use" }).message, /Disable it instead/);
  assert.equal(toApiError({ message: "template_in_use" }).code, "template_in_use");
});
