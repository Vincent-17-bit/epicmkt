import { businessStore } from "./mockBusinesses.js";
import { ApiError } from "./errors.js";

// Demo mode only. Same shapes as the live API, kept in memory so the Messages page works without a server.
const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const store = { messages: [], seq: 0, seeded: false };
const nowIso = () => new Date().toISOString();

function seed() {
  if (store.seeded) return;
  store.seeded = true;
  const biz = businessStore[0];
  if (!biz) return;
  const t0 = Date.now() - 3_600_000;
  const root = {
    id: "dm-1", businessId: biz.id, businessName: biz.name, sellerId: biz.sellerId, sender: "admin", kind: "general", subject: "Your contact details", body: "Please send us the best phone number to reach you.",
    needsReply: true, threadId: "dm-1", parentId: null, createdAt: new Date(t0).toISOString(), readAt: new Date(t0 + 60_000).toISOString(), deliveredAt: new Date(t0 + 30_000).toISOString(),
    adminDeliveredAt: null, adminReadAt: null, attachments: [],
  };
  const reply = {
    id: "dm-2", businessId: biz.id, businessName: biz.name, sellerId: biz.sellerId, sender: "seller", kind: "general", subject: "Re: Your contact details", body: "0712 345 678, WhatsApp too.",
    needsReply: false, threadId: "dm-1", parentId: "dm-1", createdAt: new Date(t0 + 600_000).toISOString(), readAt: new Date(t0 + 600_000).toISOString(), deliveredAt: new Date(t0 + 600_000).toISOString(),
    adminDeliveredAt: null, adminReadAt: null, attachments: [{ id: "dmf-1", name: "id-card.jpg", mime: "image/jpeg", size: 183000, path: "demo/id-card.jpg" }],
  };
  store.messages.push(root, reply);
}

const copy = (rows) => JSON.parse(JSON.stringify(rows));

export async function uploadMessageFiles(files = []) {
  return files.map((f) => ({ path: `admin/${f.name}`, name: f.name, mime: f.type, size: f.size }));
}

export function addMessage({ business, parentId = null, subject, body, needsReply = false, attachments = [], sender = "admin" }) {
  const parent = parentId ? store.messages.find((m) => m.id === parentId) : null;
  const id = `dm-${++store.seq + 100}`;
  const message = {
    id, businessId: business.id, businessName: business.name, sellerId: business.sellerId, sender, kind: "general",
    subject: parent ? `Re: ${String(parent.subject).replace(/^(Re: )+/, "")}` : subject || "Message from EpicMKT", body, needsReply,
    threadId: parent ? parent.threadId : id, parentId, createdAt: nowIso(), readAt: null, deliveredAt: null, adminDeliveredAt: null, adminReadAt: null,
    attachments: attachments.map((a, i) => ({ id: `${id}-f${i}`, name: a.name, mime: a.mime, size: a.size, path: a.path })),
  };
  store.messages.unshift(message);
  return message;
}

export async function listMessages({ businessId = null } = {}) {
  seed();
  await latency();
  // The demo seller's device receives staff messages a moment later; show that as the ticks changing.
  const now = nowIso();
  for (const m of store.messages) if (m.sender === "admin" && !m.deliveredAt && Date.parse(now) - Date.parse(m.createdAt) > 2_000) m.deliveredAt = now;
  return copy(store.messages.filter((m) => !businessId || m.businessId === businessId));
}

export async function sendMessage({ parentId = null, businessId = null, subject = null, body = "", needsReply = false, files = [] }) {
  seed();
  await latency();
  const parent = parentId ? store.messages.find((m) => m.id === parentId) : null;
  const business = businessStore.find((b) => b.id === (parent?.businessId ?? businessId));
  if (!business) throw new ApiError("not_found", "That business no longer exists.");
  const text = String(body).trim();
  if (!text && !files.length) throw new ApiError("body_required", "Write a message or attach a file.");
  const attachments = await uploadMessageFiles(files);
  const message = addMessage({ business, parentId, subject, body: text || "Sent you a file.", needsReply, attachments });
  return { sent: 1, skipped: 0, ids: [message.id] };
}

export async function markMessagesRead({ businessId = null } = {}) {
  seed();
  let n = 0;
  for (const m of store.messages) {
    if (m.sender === "seller" && !m.adminReadAt && (!businessId || m.businessId === businessId)) { m.adminReadAt = nowIso(); m.adminDeliveredAt ??= m.adminReadAt; n += 1; }
  }
  return n;
}
export async function ackMessagesDelivered() {
  seed();
  let n = 0;
  for (const m of store.messages) if (m.sender === "seller" && !m.adminDeliveredAt) { m.adminDeliveredAt = nowIso(); n += 1; }
  return n;
}
export async function deleteMessage(id) {
  seed();
  await latency();
  const at = store.messages.findIndex((m) => m.id === id);
  if (at < 0) throw new ApiError("message_not_found", "That message no longer exists.");
  store.messages.splice(at, 1);
  return 1;
}
export async function deleteConversation({ businessId, threadId = null }) {
  seed();
  await latency();
  const before = store.messages.length;
  store.messages = store.messages.filter((m) => !(m.businessId === businessId && (!threadId || m.threadId === threadId)));
  const removed = before - store.messages.length;
  if (!removed) throw new ApiError("message_not_found", "That message no longer exists.");
  return removed;
}
export async function getUnreadMessages() {
  seed();
  return store.messages.filter((m) => m.sender === "seller" && !m.adminReadAt).length;
}
export async function openMessageFile(path) {
  return `https://files.invalid/${encodeURIComponent(path)}`;
}
