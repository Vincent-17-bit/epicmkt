// One definition per resource, shared by live.js and mock.js so both behave the same.
// Column names are the real database columns (see supabase/migrations), so a row from the mock
// has the same shape as a row from Supabase.
//
// Secrets are never listed: finalize_token_hash, ip_hash and user_agent are not selectable here.

import { ApiError } from "./errors.js";

const APPLICATION_STATUSES = [
  "uploading",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "payment_confirming",
  "activated",
  "rejected",
];
const BUSINESS_STATUSES = ["pending", "live", "paused", "suspended", "expired", "deleted"];
const PLAN_KEYS = ["standard", "premium"];
const VERIFICATION = ["unverified", "verified"];

const kes = (n) => `KES ${Number(n ?? 0).toLocaleString("en-KE")}`;
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");

export const RESOURCES = {
  applications: {
    name: "applications",
    table: "applications",
    id: "id",
    label: "Applications",
    searchFields: ["reference_no", "business_name", "owner_full_name", "phone"],
    listColumns: [
      "id",
      "reference_no",
      "status",
      "business_name",
      "owner_full_name",
      "phone",
      "plan_key",
      "category_id",
      "county",
      "town",
      "verification_level",
      "submitted_at",
      "created_at",
    ],
    detailColumns: [
      "id",
      "reference_no",
      "status",
      "verification_level",
      "completeness_hint",
      "category_id",
      "plan_key",
      "price_at_submission",
      "owner_full_name",
      "owner_id_type",
      "owner_id_number",
      "phone",
      "alt_phone",
      "email",
      "business_name",
      "registered",
      "reg_type",
      "reg_number",
      "year_established",
      "kra_pin",
      "sbp_number",
      "sbp_expiry",
      "short_description",
      "county",
      "town",
      "address",
      "lat",
      "lng",
      "business_phones",
      "whatsapp",
      "website",
      "socials",
      "admin_note",
      "rejection_reason",
      "payment_code",
      "seller_id",
      "submitted_at",
      "created_at",
      "updated_at",
    ],
    filters: {
      status: APPLICATION_STATUSES,
      plan_key: PLAN_KEYS,
      verification_level: VERIFICATION,
      category_id: null,
      county: null,
    },
    sortable: ["submitted_at", "created_at", "business_name", "status", "reference_no"],
    defaultSort: { column: "submitted_at", direction: "desc" },
    href: (id) => `/admin/applications/${id}`,
    searchItem: (r) => ({
      title: r.business_name,
      subtitle: `${r.reference_no} · ${r.owner_full_name}`,
      status: r.status,
    }),
  },

  businesses: {
    name: "businesses",
    table: "businesses",
    id: "id",
    label: "Businesses",
    searchFields: ["name", "seller_id", "slug", "phone"],
    listColumns: [
      "id",
      "seller_id",
      "slug",
      "name",
      "status",
      "plan_key",
      "category_id",
      "county",
      "town",
      "phone",
      "featured",
      "verification_level",
      "paid_until",
      "created_at",
    ],
    detailColumns: null, // all columns
    filters: {
      status: BUSINESS_STATUSES,
      plan_key: PLAN_KEYS,
      verification_level: VERIFICATION,
      featured: "boolean",
      category_id: null,
      county: null,
      town: null,
    },
    sortable: ["created_at", "name", "status", "paid_until", "plan_key"],
    defaultSort: { column: "created_at", direction: "desc" },
    href: (id) => `/admin/businesses/${id}`,
    searchItem: (r) => ({
      title: r.name,
      subtitle: `${r.seller_id}${r.town ? ` · ${r.town}` : ""}`,
      status: r.status,
    }),
  },

  payments: {
    name: "payments",
    table: "payments",
    id: "id",
    label: "Payments",
    searchFields: ["reference"],
    listColumns: [
      "id",
      "business_id",
      "amount_kes",
      "method",
      "reference",
      "period_start",
      "period_end",
      "created_at",
    ],
    detailColumns: null,
    filters: { business_id: null, method: null },
    sortable: ["created_at", "amount_kes", "period_end"],
    defaultSort: { column: "created_at", direction: "desc" },
    href: (id) => `/admin/payments/${id}`,
    searchItem: (r) => ({
      title: r.reference || "Payment",
      subtitle: `${kes(r.amount_kes)} · ${day(r.created_at)}`,
      status: null,
    }),
  },
};

export const RESOURCE_NAMES = Object.keys(RESOURCES);

export function resourceDef(name) {
  const def = Object.prototype.hasOwnProperty.call(RESOURCES, name) ? RESOURCES[name] : null;
  if (!def) throw new ApiError("invalid_resource", `Unknown resource: ${String(name)}`);
  return def;
}

export { APPLICATION_STATUSES, BUSINESS_STATUSES };
