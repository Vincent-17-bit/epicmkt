// Pure helpers for Moderation, Approvals and the Expiry Radar. No React, no network: easy to test.

const REPORT_REASONS = {
  wrong_price: "Wrong price",
  wrong_info: "Wrong information",
  closed: "Business is closed",
  scam: "Looks like a scam",
  offensive: "Offensive content",
  other: "Other",
};

/** "wrong_price" -> "Wrong price"; unknown reasons are made readable instead of shown raw. */
export function reportReasonLabel(reason) {
  if (!reason) return "No reason given";
  if (REPORT_REASONS[reason]) return REPORT_REASONS[reason];
  const text = String(reason).replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DAY = 24 * 60 * 60 * 1000;

/** How a flag's deadline reads: "Overdue by 2 days", "Due today", "Due in 3 days", or "" when it has none or is resolved. */
export function dueLabel(flag, now = Date.now()) {
  if (!flag?.due_at || flag.status === "resolved") return "";
  const diff = Date.parse(flag.due_at) - now;
  if (Number.isNaN(diff)) return "";
  if (diff < 0) {
    const days = Math.max(1, Math.ceil(-diff / DAY));
    return `Overdue by ${days} ${days === 1 ? "day" : "days"}`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

const FIELD_LABELS = { name: "Business name", category_id: "Category", phone: "Phone number", town: "Town", pin: "KRA PIN", licence: "Licence number" };
export const changeFieldLabel = (field) => FIELD_LABELS[field] ?? field;

/** The value a reviewer should see: category names rather than slugs, and a dash when empty. */
export function changeValue(row, which) {
  const label = which === "old" ? row.old_label : row.new_label;
  const raw = which === "old" ? row.old_value : row.new_value;
  return label || raw || "–";
}

/** The money consequence of approving a category change, in a sentence. "" when there is none to mention. */
export function changeCost(row) {
  if (row?.field !== "category_id") return "";
  const parts = [];
  if (row.extra_due_kes > 0) parts.push(`The seller owes KES ${Number(row.extra_due_kes).toLocaleString("en-KE")} now`);
  if (row.new_monthly_price != null) parts.push(`new monthly price KES ${Number(row.new_monthly_price).toLocaleString("en-KE")}${row.applies_from_next_renewal ? " from the next renewal" : ""}`);
  if (parts.length === 0) return "";
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// ---- Expiry Radar ----------------------------------------------------------------------------------------------

export const RADAR_BUCKETS = [
  { id: "expired", label: "Lapsed", hint: "Past grace: hidden from customers" },
  { id: "grace", label: "In grace", hint: "Ended yesterday: visible for one more day" },
  { id: "today", label: "Ends today", hint: "Last day of the paid month" },
  { id: "week", label: "Next 7 days", hint: "Reminders are going out" },
  { id: "month", label: "Later", hint: "Further out" },
];

/** Which bucket a row belongs to, from the state and days_left the database computed in Nairobi time. */
export function radarBucket(row) {
  if (row.state === "expired") return "expired";
  if (row.state === "grace") return "grace";
  if (row.days_left === 0) return "today";
  if (row.days_left != null && row.days_left <= 7) return "week";
  return "month";
}

/** Rows grouped for display, nearest first inside each bucket, empty buckets kept so the layout is stable. */
export function groupRadar(rows = []) {
  const groups = Object.fromEntries(RADAR_BUCKETS.map((b) => [b.id, []]));
  for (const row of rows) groups[radarBucket(row)].push(row);
  for (const list of Object.values(groups)) list.sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0) || a.name.localeCompare(b.name));
  return RADAR_BUCKETS.map((bucket) => ({ ...bucket, rows: groups[bucket.id] }));
}

/** Monthly revenue the rows represent, counting only listings that have not paid yet (nothing waiting to confirm). */
export function revenueAtRisk(rows = []) {
  return rows.filter((r) => !r.payment_waiting).reduce((sum, r) => sum + (Number(r.monthly_price) || 0), 0);
}

export function daysLeftLabel(row) {
  if (row.state === "expired") return `Lapsed ${Math.abs(row.days_left ?? 0)} ${Math.abs(row.days_left ?? 0) === 1 ? "day" : "days"} ago`;
  if (row.state === "grace") return "In grace";
  if (row.days_left === 0) return "Ends today";
  if (row.days_left === 1) return "Ends tomorrow";
  return `${row.days_left} days left`;
}

/** wa.me link for chasing a renewal; null when the number is unusable. Kenyan 07.. and 01.. numbers become +254. */
export function whatsappLink(phone, text = "") {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  let intl = null;
  if (/^\+\d{9,15}$/.test(digits)) intl = digits.slice(1);
  else if (/^0[17]\d{8}$/.test(digits)) intl = `254${digits.slice(1)}`;
  else if (/^254[17]\d{8}$/.test(digits)) intl = digits;
  if (!intl) return null;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
