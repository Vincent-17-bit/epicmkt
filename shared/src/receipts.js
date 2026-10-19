// Read receipts for in-app messages, the same on both sides.
//   sent       the message is saved, the other side has not received it (one green tick)
//   delivered  the other side's app received it (two green ticks)
//   read       the other side opened it (two blue ticks)
export const RECEIPT_LABEL = { sent: "Sent", delivered: "Delivered", read: "Read" };

export function receiptState({ deliveredAt = null, readAt = null } = {}) {
  if (readAt) return "read";
  if (deliveredAt) return "delivered";
  return "sent";
}

/** Who sent it decides which columns say what the other side did. */
export function receiptOf(m) {
  if (!m) return "sent";
  return m.sender === "seller"
    ? receiptState({ deliveredAt: m.adminDeliveredAt, readAt: m.adminReadAt })
    : receiptState({ deliveredAt: m.deliveredAt, readAt: m.readAt });
}

/**
 * Groups a flat list of messages into conversations. Each thread keeps its messages oldest first, with
 * `depth` = how many replies deep a message sits (a reply to a reply is depth 2).
 */
export function groupThreads(messages) {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const depthOf = (m) => {
    let depth = 0;
    let cur = m;
    const seen = new Set();
    while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      depth += 1;
    }
    return depth;
  };
  const threads = new Map();
  for (const m of messages) {
    const key = m.threadId ?? m.id;
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key).push({ ...m, depth: depthOf(m) });
  }
  return [...threads.entries()]
    .map(([id, list]) => {
      list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      const last = list[list.length - 1];
      return { id, messages: list, last, subject: list[0].subject, needsReply: list.some((m) => m.sender === "admin" && m.needsReply), updatedAt: last.createdAt };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
