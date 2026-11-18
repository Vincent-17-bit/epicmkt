import { zonedParts } from "@epicmkt/shared";
// What the Command Center shows, worked out from the real counts. Pure functions, no React or Supabase.
// Nothing here invents a number: a row or a note only appears when the count behind it exists.

const n = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};
const known = (value) => value !== null && value !== undefined;
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * The "needs attention" rows, busiest first. `can(permission)` decides whether a row links anywhere, so a role
 * that may not open the page just sees the number. Rows with nothing waiting are kept (value 0) so the page can
 * say what is clear.
 */
export function attentionRows(counts, { can = () => true, canReviewApplications = false } = {}) {
  const c = counts ?? {};
  const over24h = canReviewApplications && known(c.applicationsOver24h) ? n(c.applicationsOver24h) : 0;
  const first = n(c.firstPaymentsToConfirm);
  const renewals = n(c.renewalPaymentsToConfirm);

  const rows = [
    {
      id: "applications",
      label: "Applications waiting",
      value: n(c.applicationsWaiting),
      note: over24h ? `${over24h} waiting over 24 hours` : "",
      to: can("applications.view") ? "/admin/applications" : null,
    },
    {
      id: "payments",
      label: "Payments to confirm",
      value: n(c.unconfirmedPayments),
      note: first && renewals ? `${plural(first, "new seller", "new sellers")} and ${plural(renewals, "renewal", "renewals")}` : "",
      to: can("payments.view") ? "/admin/payments" : null,
    },
    {
      id: "flags",
      label: "Open flags",
      value: n(c.openFlags),
      note: n(c.openReports) ? `${plural(n(c.openReports), "open report", "open reports")} as well` : "",
      to: can("moderation.view") ? "/admin/moderation" : null,
    },
    {
      id: "failed",
      label: "Failed messages",
      value: n(c.failedMessages),
      note: n(c.failedMessages) ? "These sellers did not get the message" : "",
      to: can("messages.view") ? "/admin/broadcasts" : null,
    },
  ];

  // Stable sort: the busiest first, ties keep the order above.
  return rows.map((row, index) => ({ row, index })).sort((a, b) => b.row.value - a.row.value || a.index - b.index).map(({ row }) => row);
}

/** Points for an SVG polyline, or null when there is nothing worth drawing (fewer than 2 points, or all zero). */
export function sparklinePoints(values, { width = 100, height = 24 } = {}) {
  const series = (values ?? []).map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (series.length < 2) return null;
  const max = Math.max(...series);
  if (max <= 0) return null;
  const step = width / (series.length - 1);
  return series.map((v, i) => `${+(i * step).toFixed(2)},${+(height - (v / max) * height).toFixed(2)}`).join(" ");
}

export const sum = (values) => (values ?? []).reduce((total, v) => total + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);

/** The last `days` entries of an analytics series, as plain numbers. */
export function lastDays(rows, key, days) {
  return (rows ?? []).slice(-days).map((row) => Number(row?.[key]) || 0);
}

/** "Good morning", "Good afternoon" or "Good evening", from the admin's own clock. */
export function greeting(date = new Date()) {
  const hour = zonedParts(date)?.hour ?? 12;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** The name to greet: the first word of the display name, or of the email's local part; "" when there is neither. */
export function firstName(admin) {
  const name = String(admin?.displayName ?? "").trim() || String(admin?.email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  const first = name.split(/\s+/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

/** Each attention row's share of the busiest one, 0-100, for the small bar beside it. */
export function shareOfMax(value, max) {
  return max > 0 ? Math.max(6, Math.min(100, Math.round((value / max) * 100))) : 0;
}

// The pages worth one tap from the Command Center, in this order. Only the ones the role may open are shown.
export const SHORTCUT_PATHS = [
  "/admin/businesses",
  "/admin/applications",
  "/admin/payments",
  "/admin/moderation",
  "/admin/messages",
  "/admin/broadcasts",
  "/admin/flash-sales",
  "/admin/plans",
  "/admin/analytics",
  "/admin/settings",
];

export function shortcutItems(groups, can = () => true) {
  const all = groups.flatMap((group) => group.items);
  return SHORTCUT_PATHS.map((to) => all.find((item) => item.to === to)).filter((item) => item && (!item.permission || can(item.permission)));
}
