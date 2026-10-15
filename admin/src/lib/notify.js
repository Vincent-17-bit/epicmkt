// Turns an admin_notifications row ({ kind, data, business_id, business?: {name} }) into words and a place to go.
const PAYMENT_KIND = { first: "First payment", renewal: "Renewal payment", upgrade: "Plan upgrade payment", category_change: "Category change payment" };
const FIELD = { name: "business name", category_id: "category", phone: "phone number", town: "town", pin: "KRA PIN", licence: "licence" };

const humanise = (kind) => {
  const text = String(kind || "notification").replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function describeNotification(row) {
  const kind = row?.kind;
  const data = row?.data ?? {};
  const who = row?.business?.name ?? data.business_name ?? "";
  switch (kind) {
    case "application_submitted":
      return { kind, title: "New application", detail: [data.business_name, data.reference_no].filter(Boolean).join(" · ") || "A seller submitted an application", to: "/admin/applications?status=submitted", tone: "info", icon: "file" };
    case "payment_submitted":
      return { kind, title: PAYMENT_KIND[data.kind] ?? "Payment submitted", detail: who ? `${who} sent an M-Pesa code to confirm` : "A seller sent an M-Pesa code to confirm", to: "/admin/payments?status=submitted", tone: "warning", icon: "money" };
    case "change_request":
      return { kind, title: "Change request", detail: `${who || "A seller"} wants to change their ${FIELD[data.field] ?? data.field ?? "details"}`, to: "/admin/changes", tone: "info", icon: "pen" };
    case "flag_reply":
      return { kind, title: "Seller replied to a flag", detail: who || "A seller answered an admin question", to: "/admin/moderation", tone: "info", icon: "flag" };
    case "deletion_requested":
      return { kind, title: "Deletion requested", detail: who ? `${who} asked to delete their account` : "A seller asked to delete their account", to: "/admin/businesses", tone: "warning", icon: "warn" };
    default:
      return { kind, title: humanise(kind), detail: who, to: "/admin", tone: "neutral", icon: "bell" };
  }
}
