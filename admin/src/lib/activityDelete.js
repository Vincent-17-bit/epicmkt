// The logic behind the delete buttons on the Command Center "Live activity" list. Pure functions, no browser,
// no Supabase, so they can be tested on their own.
//
// A row id says where the row came from (see admin_activity() in migration 0014):
//   "n:<uuid>"    a notification. Deleting it removes it for good, for every admin.
//   "a:<number>"  an audit-log row. The audit log is never edited, so "delete" only hides it from the feed of the
//                 admin who clicked (migration 0059).
// Demo mode ids look the same ("n:demo-1"), which is how the mock API tells the two apart too.

export const UNDO_MS = 5000;

/** "notification", "audit", or null when the id is not one of the two shapes. */
export function activityKind(id) {
  const text = String(id ?? "");
  if (text.startsWith("n:") && text.length > 2) return "notification";
  if (text.startsWith("a:") && text.length > 2) return "audit";
  return null;
}

/** Splits rows by what "delete" will do to them. Rows with an unrecognised id are left out of both lists. */
export function splitByKind(rows) {
  const out = { notifications: [], audit: [] };
  for (const row of rows ?? []) {
    const kind = activityKind(row?.id);
    if (kind === "notification") out.notifications.push(row);
    else if (kind === "audit") out.audit.push(row);
  }
  return out;
}

/** The rows that are left once `ids` are gone. Never mutates, and returns the same shape for a missing list. */
export function removeRows(rows, ids) {
  if (!Array.isArray(rows)) return rows;
  const gone = new Set(ids);
  return rows.filter((row) => !gone.has(row.id));
}

const newestFirst = (a, b) => {
  const byTime = String(b.at ?? "").localeCompare(String(a.at ?? ""));
  return byTime || String(b.id).localeCompare(String(a.id));
};

/**
 * Puts removed rows back (undo, or a failed delete) without losing anything a refetch brought in meanwhile:
 * a row that is already there is not added twice, and the list keeps the order the server uses (newest first).
 * Rows without a time keep their original place relative to each other.
 */
export function restoreRows(current, removed) {
  const list = Array.isArray(current) ? current : [];
  const have = new Set(list.map((row) => row.id));
  const back = (removed ?? []).filter((row) => !have.has(row.id));
  if (!back.length) return list;
  const merged = [...list, ...back];
  return merged.every((row) => row.at) ? merged.sort(newestFirst) : [...back, ...list];
}

/** The toast line after a single delete. */
export function deletedMessage(row) {
  return activityKind(row?.id) === "audit"
    ? "Hidden from your feed. The audit log keeps it."
    : "Notification deleted.";
}

/** What the "Clear all" dialog tells the admin will happen, in plain words. */
export function clearSummary(rows) {
  const { notifications, audit } = splitByKind(rows);
  const parts = [];
  if (notifications.length) {
    parts.push(`${notifications.length} ${notifications.length === 1 ? "notification" : "notifications"} will be deleted for everyone and cannot be brought back.`);
  }
  if (audit.length) {
    parts.push(`${audit.length} audit ${audit.length === 1 ? "entry" : "entries"} will be hidden from your feed only. The audit log keeps ${audit.length === 1 ? "it" : "them"} and other admins still see ${audit.length === 1 ? "it" : "them"}.`);
  }
  return parts.join(" ");
}

/** The toast line after "Clear all", from the counts the RPC returned. */
export function clearedMessage(result) {
  const deleted = Number(result?.deleted ?? 0);
  const hidden = Number(result?.dismissed ?? 0);
  const total = deleted + hidden;
  if (!total) return "Nothing to clear. The feed was already up to date.";
  const bits = [];
  if (deleted) bits.push(`${deleted} deleted`);
  if (hidden) bits.push(`${hidden} hidden from your feed`);
  return `Cleared ${total} ${total === 1 ? "item" : "items"} (${bits.join(", ")}).`;
}
