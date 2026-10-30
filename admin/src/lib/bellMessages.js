// Pure helpers for showing unread seller messages in the notification bell. No browser, no Supabase.
// A message row is the shape returned by api.listMessages(): { id, businessId, businessName, sender, subject, body, createdAt, adminReadAt }.

const PREVIEW_CHARS = 90;

export const isUnreadFromSeller = (m) => m?.sender === "seller" && !m.adminReadAt;

export function previewOf(body, max = PREVIEW_CHARS) {
  const flat = String(body ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// Where a bell message opens: the Messages page, on that business, with this message highlighted.
export function messageLink(m) {
  const params = new URLSearchParams({ business: m.businessId, message: m.id });
  return `/admin/messages?${params.toString()}`;
}

// Newest first, unread seller messages only, trimmed to what the bell shows.
export function bellMessages(messages, limit = 20) {
  return (messages ?? [])
    .filter(isUnreadFromSeller)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
    .map((m) => ({ id: m.id, businessId: m.businessId, who: m.businessName || "A business", subject: m.subject || "Message", preview: previewOf(m.body), at: m.createdAt, to: messageLink(m) }));
}
