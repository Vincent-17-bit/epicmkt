import { test } from "node:test";
import assert from "node:assert/strict";
import { toApiError } from "./errors.js";
import { bulkBusinessAction } from "./mockBusinessActions.js";
import { businessStore } from "./mockBusinesses.js";
import { ackMessagesDelivered, getUnreadMessages, listMessages, markMessagesRead, sendMessage } from "./mockMessages.js";

const biz = businessStore.find((b) => !b.deleted && b.status === "live");

test("server rejections from the message functions read as plain sentences", () => {
  assert.equal(toApiError({ message: "reason_required", code: "P0001" }).code, "reason_required");
  assert.match(toApiError({ message: "reason_required" }).message, /reason/i);
  assert.match(toApiError({ message: "too_many_files" }).message, /3 files/);
  assert.equal(toApiError({ message: "file_not_uploaded" }).code, "file_not_uploaded");
});

test("a bulk message creates a conversation the seller was asked to answer", async () => {
  const result = await bulkBusinessAction({ action: "message", ids: [biz.id], reason: "Need your contact details", params: { channels: ["inApp"], subject: "Contact details", body: "Please send your number", needsReply: true, files: [] } });
  assert.equal(result.affected, 1);
  const mine = (await listMessages({ businessId: biz.id })).filter((m) => m.subject === "Contact details");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].needsReply, true);
  assert.equal(mine[0].sender, "admin");
  assert.equal(mine[0].deliveredAt, null, "one green tick until the seller's device receives it");
});

test("a message can go out with only a file, and an empty one is refused", async () => {
  const file = { name: "form.pdf", type: "application/pdf", size: 2000 };
  const sent = await bulkBusinessAction({ action: "message", ids: [biz.id], reason: "Sending the form", params: { channels: ["inApp"], body: "", files: [file] } });
  assert.equal(sent.affected, 1);
  const withFile = (await listMessages({ businessId: biz.id })).find((m) => m.attachments.some((a) => a.name === "form.pdf"));
  assert.equal(withFile.body, "Sent you a file.");
  await assert.rejects(bulkBusinessAction({ action: "message", ids: [biz.id], reason: "Nothing to say", params: { channels: ["inApp"], body: "  ", files: [] } }), { code: "invalid_input" });
  await assert.rejects(sendMessage({ businessId: biz.id, body: "  ", files: [] }), { code: "body_required" });
});

test("staff reply inside a thread and the thread stays together", async () => {
  const before = await listMessages();
  const root = before.find((m) => m.id === "dm-1");
  assert.ok(root, "demo conversation");
  const out = await sendMessage({ parentId: "dm-2", body: "Thanks. Is that your WhatsApp number?", needsReply: true });
  const reply = (await listMessages()).find((m) => m.id === out.ids[0]);
  assert.equal(reply.threadId, "dm-1");
  assert.equal(reply.parentId, "dm-2");
  assert.equal(reply.subject, "Re: Your contact details");
});

test("seller messages: delivered once this device has them, read once the conversation is opened", async () => {
  assert.ok((await getUnreadMessages()) >= 1);
  await ackMessagesDelivered();
  const delivered = (await listMessages()).find((m) => m.id === "dm-2");
  assert.ok(delivered.adminDeliveredAt);
  assert.equal(delivered.adminReadAt, null);
  await markMessagesRead({ businessId: delivered.businessId });
  const read = (await listMessages()).find((m) => m.id === "dm-2");
  assert.ok(read.adminReadAt);
  assert.equal(await getUnreadMessages(), 0);
});

test("a strike adds one to the business", async () => {
  const before = biz.strikes ?? 0;
  const out = await bulkBusinessAction({ action: "strike", ids: [biz.id], reason: "Wrong prices on three items", params: {} });
  assert.equal(out.affected, 1);
  assert.equal(biz.strikes, before + 1);
});
