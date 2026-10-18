// Turns one row from the admin_activity() RPC into a sentence and, where it makes sense, a place to go.
// Pure functions, no browser or Supabase. A row looks like:
//   { id, at, kind, business_name, actor, data }
// `kind` is either an admin_notifications.kind ("payment_submitted") or an audit_log.action ("payment_confirmed",
// "application.approve"). Unknown kinds still read as a sentence, they are never dropped or invented.
//
// Demo rows carry their own `text` and are returned as they are.

const FIELD_LABELS = { name: "name", category_id: "category", phone: "phone number", town: "town", pin: "KRA PIN", licence: "licence" };
const PAYMENT_KIND = { first: "first", renewal: "renewal", upgrade: "upgrade", category_change: "category change" };

const humanize = (action) => String(action ?? "").replace(/[._]+/g, " ").trim();
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function describeActivity(row) {
  if (!row) return { text: "", to: null };
  if (typeof row.text === "string") return { text: row.text, to: row.to ?? null };

  const data = row.data && typeof row.data === "object" ? row.data : {};
  const biz = row.business_name || data.business_name || "A business";
  const who = row.actor || "The system";
  const kind = String(row.kind ?? "");

  switch (kind) {
    case "application_submitted":
      return { text: `New application from ${biz}`, to: "/admin/applications" };
    case "payment_submitted": {
      const label = PAYMENT_KIND[data.kind];
      return { text: `${biz} submitted ${label ? `a ${label} ` : "a "}payment to confirm`, to: "/admin/payments" };
    }
    case "payment_confirmed":
      return { text: `Payment confirmed for ${biz}${data.receipt ? ` (${data.receipt})` : ""}`, to: "/admin/payments" };
    case "payment_rejected":
      return { text: `Payment rejected for ${biz}`, to: "/admin/payments" };
    case "change_request":
    case "change_requested": {
      const field = FIELD_LABELS[data.field];
      return { text: `${biz} asked to change ${field ? `their ${field}` : "a detail"}`, to: "/admin/businesses" };
    }
    case "flag_reply":
    case "flag_replied":
      return { text: `${biz} replied to a flag`, to: "/admin/businesses" };
    case "deletion_requested":
      return { text: `${biz} asked to delete their listing`, to: "/admin/businesses" };
    case "listing_paused":
      return { text: `${biz} paused their listing`, to: "/admin/businesses" };
    case "listing_resumed":
      return { text: `${biz} resumed their listing`, to: "/admin/businesses" };
    case "application.open":
      return { text: `${who} started reviewing an application`, to: "/admin/applications" };
    case "application.return":
      return { text: `${who} returned an application to the queue`, to: "/admin/applications" };
    case "business.visibility":
      return { text: `${who} changed whether ${biz} is visible`, to: "/admin/businesses" };
    case "flag.status":
      return { text: `${who} updated a flag on ${biz}`, to: "/admin/businesses" };
    default: {
      const place = row.business_name ? ` on ${row.business_name}` : "";
      return { text: `${sentence(humanize(kind) || "Activity")}${place}${row.actor ? ` (${row.actor})` : ""}`, to: null };
    }
  }
}
