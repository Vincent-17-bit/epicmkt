import { supabase } from "../lib/supabaseClient.js";
import { normalizeCounts } from "../lib/counts.js";
import { DEFAULT_TAB, PAGE_SIZE, searchFilter, tabById, tabSortAscending } from "../lib/applications.js";
import { ApiError, toApiError } from "./errors.js";

const notConfigured = () => {
  throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
};

// Not built yet: these stay behind the "not connected" message so a page never shows made-up data.
export const listBusinesses = notConfigured;
export const listAllBusinesses = notConfigured;
export const getBusinessTabCounts = notConfigured;
export const getBusinessFilterOptions = notConfigured;
export const bulkBusinessAction = notConfigured;
export const undoBulkBusinessAction = notConfigured;
export const listAuditEntries = notConfigured;
export const getBusinesses = notConfigured;
export const getPayments = notConfigured;

const client = () => {
  if (!supabase) throw new ApiError("unauthorized", "Supabase is not configured.");
  return supabase;
};

// Every read here runs as the signed-in admin, so row-level security decides what comes back.
const check = ({ data, error, count }) => {
  if (error) throw toApiError(error);
  return { data, count };
};

// ---- Counts: the Command Center, the sidebar badges and the queue tabs all read this ---------------------------

export async function getAdminCounts() {
  const db = client();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [counts, overdue] = await Promise.all([
    db.rpc("admin_counts"),
    // Not part of admin_counts(): submitted applications nobody has opened for over a day. Under RLS only
    // owner and reviewer can see applications, so the Command Center shows this row to those roles only.
    db.from("applications").select("id", { count: "exact", head: true }).eq("status", "submitted").lt("submitted_at", cutoff),
  ]);
  const { data } = check(counts);
  return normalizeCounts(data, { applicationsOver24h: overdue.error ? null : overdue.count });
}

// ---- Applications --------------------------------------------------------------------------------------------

const LIST_COLUMNS = "id, reference_no, business_name, owner_full_name, phone, town, county, plan_key, price_at_submission, status, verification_level, submitted_at, reviewer_id";

// Everything a reviewer needs and nothing they do not: no finalize token hash, IP hash or user agent.
const DETAIL_COLUMNS = [
  "id", "reference_no", "status", "verification_level", "completeness_hint", "category_id", "plan_key", "price_at_submission",
  "plan_snapshot", "owner_full_name", "owner_id_type", "owner_id_number", "phone", "alt_phone", "email", "business_name",
  "registered", "reg_type", "reg_number", "year_established", "kra_pin", "sbp_number", "sbp_expiry", "short_description",
  "template_values", "county", "town", "address", "lat", "lng", "business_phones", "whatsapp", "website", "socials",
  "admin_note", "rejection_reason", "payment_code", "seller_id", "reviewer_id", "review_started_at", "submitted_at",
  "created_at", "updated_at", "category:categories(name)",
].join(", ");

const toListRow = (r) => ({
  id: r.id,
  reference: r.reference_no,
  businessName: r.business_name,
  ownerName: r.owner_full_name,
  phone: r.phone,
  town: r.town,
  county: r.county,
  plan: r.plan_key,
  price: r.price_at_submission,
  status: r.status,
  verification: r.verification_level,
  submittedAt: r.submitted_at,
  reviewerId: r.reviewer_id,
});

const toApplication = (r) => ({
  id: r.id,
  reference: r.reference_no,
  status: r.status,
  verificationLevel: r.verification_level,
  categoryId: r.category_id,
  categoryName: r.category?.name ?? null,
  plan: r.plan_key,
  price: r.price_at_submission,
  planSnapshot: r.plan_snapshot ?? {},
  ownerName: r.owner_full_name,
  ownerIdType: r.owner_id_type,
  ownerIdNumber: r.owner_id_number,
  phone: r.phone,
  altPhone: r.alt_phone,
  email: r.email,
  businessName: r.business_name,
  registered: r.registered,
  regType: r.reg_type,
  regNumber: r.reg_number,
  yearEstablished: r.year_established,
  kraPin: r.kra_pin,
  sbpNumber: r.sbp_number,
  sbpExpiry: r.sbp_expiry,
  shortDescription: r.short_description,
  templateValues: r.template_values ?? {},
  county: r.county,
  town: r.town,
  address: r.address,
  lat: r.lat,
  lng: r.lng,
  businessPhones: r.business_phones ?? [],
  whatsapp: r.whatsapp,
  website: r.website,
  adminNote: r.admin_note,
  rejectionReason: r.rejection_reason,
  paymentCode: r.payment_code,
  sellerId: r.seller_id,
  reviewerId: r.reviewer_id,
  reviewStartedAt: r.review_started_at,
  submittedAt: r.submitted_at,
  createdAt: r.created_at,
});

const toDocument = (r) => ({
  id: r.id,
  slotKey: r.slot_key,
  name: r.original_name,
  mime: r.mime,
  size: r.size_bytes,
  verified: r.verified,
  path: r.storage_path,
  replacementPath: r.replacement_path,
  replacementName: r.replacement_name,
});

const toFlag = (r) => ({
  id: r.id,
  path: r.path,
  message: r.message,
  severity: r.severity,
  status: r.status,
  createdAt: r.created_at,
});

const toEvent = (r) => ({ id: r.id, actor: r.actor, type: r.type, data: r.data ?? {}, createdAt: r.created_at });

export async function listApplications({ tab = DEFAULT_TAB, search = "", page = 0, pageSize = PAGE_SIZE } = {}) {
  const def = tabById(tab);
  let query = client()
    .from("applications")
    .select(LIST_COLUMNS, { count: "exact" })
    .in("status", def.statuses)
    .order("submitted_at", { ascending: tabSortAscending(def.id), nullsFirst: false })
    .order("id") // a stable tiebreak, so a row never appears on two pages
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const filter = searchFilter(search);
  if (filter) query = query.or(filter);

  const { data, count } = check(await query);
  return { rows: (data ?? []).map(toListRow), total: count ?? (data ?? []).length };
}

export async function getApplication(id) {
  const db = client();
  const [app, docs, flags, events] = await Promise.all([
    db.from("applications").select(DETAIL_COLUMNS).eq("id", id).maybeSingle(),
    db.from("application_documents")
      .select("id, slot_key, original_name, mime, size_bytes, verified, storage_path, replacement_path, replacement_name, created_at")
      .eq("application_id", id).order("created_at"),
    db.from("application_flags")
      .select("id, path, message, severity, status, created_at")
      .eq("application_id", id).order("created_at"),
    db.from("application_events")
      .select("id, actor, type, data, created_at")
      .eq("application_id", id).order("created_at", { ascending: false }).limit(100),
  ]);

  const application = check(app).data;
  if (!application) throw new ApiError("not_found");
  return {
    application: toApplication(application),
    documents: (check(docs).data ?? []).map(toDocument),
    flags: (check(flags).data ?? []).map(toFlag),
    events: (check(events).data ?? []).map(toEvent),
  };
}

// Starting a review: submitted -> under_review, assigned to the caller. Safe to call again (other statuses
// are returned as they are). Written by the admin_open_application RPC, which also writes the audit entry.
export async function openApplication(id) {
  const { data } = check(await client().rpc("admin_open_application", { p_id: id }));
  return data;
}

// Calls an edge function as the signed-in admin. A non-2xx answer carries `{ error: "<code>" }`; surface the code.
async function callFunction(name, body) {
  const { data, error } = await client().functions.invoke(name, { body });
  if (!error) return data;

  let code = "server_error";
  let details;
  try {
    details = await error.context.json();
    if (typeof details?.error === "string") code = details.error;
  } catch {
    // The body was not JSON (a network failure, for example): keep server_error.
  }
  const failure = new ApiError(code, details?.error ?? error.message, details);
  failure.cause = error;
  throw failure;
}

// action: approve | request_changes | reject | set_verification | return_to_queue. With preview: true nothing is
// sent or changed, and the rendered messages come back so the reviewer can read them first.
export function decideApplication(payload) {
  return callFunction("admin-decide-application", payload);
}

// Application documents sit in the private `applications` bucket. Opening one is written to the audit trail first
// (the same rule admin-proof-url follows for seller proofs); if that fails, the file is not opened.
export async function getApplicationDocumentUrl({ applicationId, slotKey, path }) {
  const db = client();
  check(await db.rpc("admin_log_document_view", { p_id: applicationId, p_slot: slotKey }));
  const { data, error } = await db.storage.from("applications").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw toApiError(error ?? new Error("no signed url"));
  return { url: data.signedUrl, expiresIn: 60 };
}
