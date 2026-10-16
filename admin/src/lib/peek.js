// Peek: the universal read-only drawer opened by `?peek=type:id`.
// Contract derived from the admin_search RPC (supabase/migrations/0008_admin.sql); the spec file only records section 5.

export const PEEK_PARAM = "peek";
export const PEEK_TYPES = ["business", "item", "application", "payment", "faq"];

export const TYPE_LABELS = {
  business: "Business",
  item: "Item",
  application: "Application",
  payment: "Payment",
  faq: "FAQ",
};

// Items and FAQs have no page of their own yet, so they open their business list.
export const PEEK_PAGES = {
  business: "/admin/businesses",
  item: "/admin/businesses",
  application: "/admin/applications",
  payment: "/admin/payments",
  faq: "/admin/businesses",
};

export function parsePeek(value) {
  if (typeof value !== "string") return null;
  const cut = value.indexOf(":");
  if (cut < 1) return null;
  const type = value.slice(0, cut);
  const id = value.slice(cut + 1).trim();
  if (!PEEK_TYPES.includes(type) || !id || id.length > 128) return null;
  return { type, id };
}

export const formatPeek = (type, id) => `${type}:${id}`;

// Returns a new URLSearchParams with the peek param set (type and id given) or removed (no type).
export function withPeek(params, type, id) {
  const next = new URLSearchParams(params);
  if (type) next.set(PEEK_PARAM, formatPeek(type, id));
  else next.delete(PEEK_PARAM);
  return next;
}

// All time display is Africa/Nairobi (UTC+3); stored values are UTC.
const dateOnly = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

const present = (v) => v !== null && v !== undefined && v !== "";
const text = (v) => (present(v) ? String(v) : "—");
const yesNo = (v) => (v === null || v === undefined ? "—" : v ? "Yes" : "No");

export function fmtKes(n) {
  return present(n) && Number.isFinite(Number(n)) ? `KES ${Number(n).toLocaleString("en-KE")}` : "—";
}
export function fmtDate(v) {
  const d = present(v) ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? dateOnly.format(d) : "—";
}
export function fmtDateTime(v) {
  const d = present(v) ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? dateTime.format(d) : "—";
}

const priceText = (r) => {
  const base = fmtKes(r.price);
  if (base === "—") return base;
  const unit = [r.price_type, r.unit].filter(present).join(" / ");
  return unit ? `${base} (${unit})` : base;
};

// Turns a raw record into what the drawer renders. `extra.business` is { name, slug, phone } when known.
export function buildPeek(type, r, extra = {}) {
  if (!r) return null;
  const biz = extra.business ?? {};
  const pageHref = type === "business" && r.id ? `/admin/businesses/${r.id}` : PEEK_PAGES[type];
  switch (type) {
    case "business":
      return {
        type, id: r.id, pageHref, title: text(r.name), subtitle: present(r.seller_id) ? `Seller ${r.seller_id}` : "", status: r.status ?? "",
        fields: [
          ["Seller ID", text(r.seller_id)], ["Status", text(r.status)], ["Plan", text(r.plan_key)], ["Town", text(r.town)],
          ["Phone", text(r.phone)], ["Email", text(r.email)], ["Owner", text(r.owner_name)], ["Paid until", fmtDate(r.paid_until)],
          ["Verification", text(r.verification_level)], ["Featured", yesNo(r.featured)], ["Slug", text(r.slug)],
        ],
      };
    case "item":
      return {
        type, id: r.id, pageHref, title: text(r.name), subtitle: text(biz.name), status: r.availability ?? "",
        fields: [
          ["Business", text(biz.name)], ["Price", priceText(r)], ["Availability", text(r.availability)], ["Visible", yesNo(r.visible)],
          ["Hidden by admin", yesNo(r.hidden_by_admin)], ["Section", text(r.section)], ["Description", text(r.description)],
        ],
      };
    case "application":
      return {
        type, id: r.id, pageHref, title: text(r.business_name), subtitle: text(r.reference_no), status: r.status ?? "",
        fields: [
          ["Reference", text(r.reference_no)], ["Applicant", text(r.owner_full_name)], ["Phone", text(r.phone)], ["Email", text(r.email)],
          ["Status", text(r.status)], ["Submitted", fmtDateTime(r.submitted_at)], ["Payment code", text(r.payment_code)],
        ],
      };
    case "payment":
      return {
        type, id: r.id, pageHref, title: text(r.mpesa_code ?? r.receipt_no), subtitle: text(biz.name), status: r.status ?? "",
        fields: [
          ["M-Pesa code", text(r.mpesa_code)], ["Receipt", text(r.receipt_no)], ["Amount", fmtKes(r.amount_kes)], ["Kind", text(r.kind)],
          ["Status", text(r.status)], ["Business", text(biz.name)], ["Phone", text(biz.phone)], ["Submitted", fmtDateTime(r.submitted_at)],
        ],
      };
    case "faq":
      return {
        type, id: r.id, pageHref, title: text(r.question), subtitle: text(biz.name), status: "",
        fields: [["Question", text(r.question)], ["Answer", text(r.answer)], ["Business", text(biz.name)], ["Asked", fmtDateTime(r.created_at)]],
      };
    default:
      return null;
  }
}
