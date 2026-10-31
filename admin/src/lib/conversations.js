export const CONVERSATION_FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "waiting", label: "Waiting for reply" },
  { id: "resolved", label: "Resolved" },
];

const norm = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function matchesSearch(conversation, search) {
  const needle = norm(search);
  if (!needle) return true;
  if (norm(conversation.name).includes(needle) || norm(conversation.sellerId).includes(needle)) return true;
  return conversation.messages.some((m) => norm(m.subject).includes(needle) || norm(m.body).includes(needle));
}

export function matchesFilter(conversation, filter, resolved) {
  const done = resolved.has(conversation.id);
  if (filter === "unread") return conversation.unread > 0;
  if (filter === "waiting") return conversation.waiting && !done;
  if (filter === "resolved") return done;
  return true;
}

export function filterConversations(list, { filter = "all", search = "", resolved = new Set() } = {}) {
  return list.filter((c) => matchesFilter(c, filter, resolved) && matchesSearch(c, search));
}

export function countConversations(list, resolved = new Set(), search = "") {
  const scoped = list.filter((c) => matchesSearch(c, search));
  return Object.fromEntries(CONVERSATION_FILTERS.map((f) => [f.id, scoped.filter((c) => matchesFilter(c, f.id, resolved)).length]));
}
