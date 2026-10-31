// Pure helpers for the business detail page: its tabs, plain-language errors, and audit wording.

export const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments", permission: "payments.view" },
  { id: "items", label: "Items", permission: "moderation.view" },
  { id: "flags", label: "Flags and reports", permission: "moderation.view" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
];

/** The tabs this role may open. `can` is usePermissions().can. */
export const visibleTabs = (can) => DETAIL_TABS.filter((tab) => !tab.permission || can(tab.permission));

/** The tab named in the URL, or the first one this role can open. */
export function pickTab(requested, tabs) {
  return tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id ?? "overview";
}

// Extending a subscription is a finance action in the database; every other bulk action is reviewer or support.
export const bulkPermission = (action) => (action === "extend" ? "businesses.extend" : "businesses.bulk");

// The bulk actions the detail page offers for one business, in the order shown.
export const DETAIL_BULK_ACTIONS = ["suspend", "unsuspend", "strike", "unlist", "feature", "extend", "tag"];

/** A sentence an admin can act on, from an ApiError (or anything thrown). */
export function friendlyError(error, fallback = "Something went wrong. Try again.") {
  switch (error?.code) {
    case "forbidden":
      return "Your role cannot do this.";
    case "unauthorized":
      return "Your session has expired. Sign in again.";
    case "not_found":
      return "That record no longer exists. Refresh the page.";
    case "invalid_status":
      return "Only a live or paused business can be hidden or shown.";
    case "no_login":
      return "This business has no seller login to resend.";
    case "rate_limited":
      return "Too many requests. Wait a minute and try again.";
    case "reason_required":
    case "invalid_input":
      return error.message;
    default:
      return /failed to fetch|network/i.test(String(error?.message ?? "")) ? "Cannot reach the server. Check your connection." : fallback;
  }
}

const AUDIT_LABELS = {
  "item.hide": "Hid an item",
  "item.unhide": "Showed an item again",
  "business.visibility": "Changed whether customers can see the business",
  "flag.status": "Changed a flag",
  "payment.confirm": "Confirmed a payment",
  "payment.reject": "Rejected a payment",
  "business.grace": "Changed the grace period",
  "settings.update": "Changed system settings",
};

/** "item.hide" -> "Hid an item". Unknown actions are made readable instead of hidden. */
export function auditLabel(action) {
  if (AUDIT_LABELS[action]) return AUDIT_LABELS[action];
  const words = String(action ?? "").replace(/[._]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Change";
}

export const kes = (value) => `KES ${Number(value ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

/** The business as the status chip and countdown expect it. */
export const stateInput = (business) => ({
  status: business.status,
  paidUntil: business.paid_until,
  deleted: Boolean(business.deleted_at),
  graceDays: business.grace_days ?? business.grace_default ?? undefined,
});

/** Can this business be hidden from, or shown to, customers? (The database allows live and paused only.) */
export const canToggleVisibility = (business) => !business.deleted_at && ["live", "paused"].includes(business.status);
