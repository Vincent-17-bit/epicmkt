import { supabase } from "../lib/supabaseClient.js";
import { normalizeCounts } from "../lib/counts.js";
import { DEFAULT_TAB, PAGE_SIZE, searchFilter, tabById, tabSortAscending } from "../lib/applications.js";
import { ApiError, toApiError } from "./errors.js";
import { PROOF_MAX_BYTES, PROOF_MAX_FILES, PROOF_TYPES } from "@epicmkt/shared";

const notConfigured = () => {
  throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
};

// Still behind the "not connected" message so a page never shows made-up data: the bulk actions need their own
// audited RPCs (suspend, extend, tag, message...), the audit viewer, and the flash sales list. Everything else on
// the Businesses page, the Payments page and the Command Center is live below.
export const listAuditEntries = notConfigured;
export const listFlashSales = notConfigured;
export const endFlashSale = notConfigured;
export const getBusinesses = notConfigured;

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

// ---- Businesses: server-side paging, filters, search and sort (migration 0014_admin_live.sql) -----------------------

const MAX_EXPORT = 5000;

const businessArgs = ({ search = "", sort, extra } = {}, page) => ({
  p_tab: extra?.tab ?? "all",
  p_search: search.trim() || null,
  p_sort: sort?.key ?? "paidUntil",
  p_dir: sort?.dir === "desc" ? "desc" : "asc",
  p_filters: extra?.filters ?? {},
  p_limit: page.limit,
  p_offset: page.offset,
});

export async function listBusinesses({ page = 0, pageSize = 50, ...query } = {}) {
  const { data } = check(await client().rpc("admin_businesses_query", businessArgs(query, { limit: pageSize, offset: page * pageSize })));
  return { rows: data?.rows ?? [], total: data?.total ?? 0 };
}

// "Select all" and CSV export. Capped, so one click cannot pull the whole table through the browser.
export async function listAllBusinesses(query = {}) {
  const { data } = check(await client().rpc("admin_businesses_query", businessArgs(query, { limit: MAX_EXPORT, offset: 0 })));
  return data?.rows ?? [];
}

export async function getBusinessTabCounts({ extra } = {}) {
  const { data } = check(await client().rpc("admin_business_tab_counts", { p_filters: extra?.filters ?? {} }));
  return data ?? {};
}

export async function getBusinessFilterOptions() {
  const { data } = check(await client().rpc("admin_business_filter_options"));
  return { categories: [], counties: [], plans: [], agents: [], ...(data ?? {}) };
}

// ---- Live activity: the Command Center feed --------------------------------------------------------------------

export async function getAdminActivity({ limit = 15 } = {}) {
  const { data } = check(await client().rpc("admin_activity", { p_limit: limit }));
  return data ?? [];
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

// ---- Payments ------------------------------------------------------------------------------------------------
// Payments arrive by themselves: Safaricom tells the pay-callback function, which records the M-Pesa code.
// This reads the admin_payment_queue view (received transactions plus payments recorded by hand).

export async function getPayments() {
  const { data } = check(
    await client().from("admin_payment_queue").select("*").order("at", { ascending: false }).limit(300),
  );
  return (data ?? []).map((r) => ({
    key: r.row_key,
    txId: r.tx_id,
    receipt: r.receipt_no,
    reference: r.reference,
    businessName: r.business_name,
    town: r.town,
    account: r.account,
    amount: Number(r.amount_kes),
    expected: r.expected_kes == null ? null : Number(r.expected_kes),
    credit: r.credit_kes == null ? null : Number(r.credit_kes),
    suggestedMonths: r.suggested_months,
    status: r.status,
    mpesaCode: r.mpesa_code,
    phone: r.phone,
    payerName: r.payer_name,
    paybill: r.paybill_number,
    at: r.at,
    applicationId: r.application_id,
    businessId: r.business_id,
    appStatus: r.app_status,
    appPaymentCode: r.app_payment_code,
    candidates: r.candidates ?? [],
    note: r.note,
    matchMethod: r.match_method,
  }));
}

// Callbacks Safaricom sent that were saved but could not be turned into a payment (a database hiccup, an odd payload).
export async function getUnprocessedCallbacks() {
  const { data } = check(
    await client().from("mpesa_callbacks").select("id, received_at, error, body")
      .eq("processed", false).is("dismissed_at", null).order("received_at", { ascending: false }).limit(20),
  );
  return (data ?? []).map((r) => ({
    id: r.id, at: r.received_at, error: r.error,
    code: r.body?.TransID ?? null, amount: r.body?.TransAmount ?? null, account: r.body?.BillRefNumber ?? null,
  }));
}

export async function searchPayTargets(query) {
  const { data } = check(await client().rpc("admin_mpesa_search_targets", { p_q: query }));
  return data ?? [];
}

const PAYMENT_ERRORS = {
  forbidden: "Your role cannot change payments.",
  already_handled: "Someone already handled this payment. Refresh the page.",
  already_applied: "This payment was already turned into months, so it cannot be ignored here.",
  reason_required: "Write a short reason.",
  application_not_payable: "That application was rejected, so it cannot receive a payment.",
  target_not_found: "That business could not be found.",
};
const run = async (call) => {
  try {
    return check(await call).data;
  } catch (e) {
    throw new Error(PAYMENT_ERRORS[e?.code] ?? PAYMENT_ERRORS[String(e?.message ?? "").match(/[a-z_]+$/)?.[0]] ?? "Could not save that. Try again.");
  }
};
export const assignPayment = ({ txId, type, id }) => run(client().rpc("admin_mpesa_assign", { p_tx: txId, p_type: type, p_id: id }));
export const ignorePayment = ({ txId, reason }) => run(client().rpc("admin_mpesa_ignore", { p_tx: txId, p_reason: reason }));
export const reprocessCallback = (id) => run(client().rpc("admin_mpesa_reprocess", { p_callback: id }));
export const dismissCallback = (id) => run(client().rpc("admin_mpesa_dismiss_callback", { p_callback: id }));

const CONFIRM_ERRORS = {
  duplicate_mpesa_code: "This M-Pesa code is already recorded on another payment.",
  invalid_status: "This application is no longer waiting for payment.",
  forbidden: "Your role cannot confirm payments.",
  not_found: "That application could not be found.",
  rate_limited: "Too many tries. Wait a moment and try again.",
};

// Same function the rest of the admin uses: it creates the seller login and sends it by SMS and e-mail.
// When the amount differs from the price it answers with warnings; that comes back as a normal result with
// `requiresAcknowledgement: true` so the page can ask, then call again with acknowledgeWarnings.
export async function confirmPayment({ applicationId, mpesaCode, amount, acknowledgeWarnings = false }) {
  try {
    return await callFunction("admin-confirm-payment", {
      applicationId, mpesaCode, amount: Math.round(amount), months: 1, action: "confirm", acknowledgeWarnings,
    });
  } catch (e) {
    if (e?.details?.requiresAcknowledgement) return e.details;
    throw new Error(CONFIRM_ERRORS[e?.code] ?? "Could not confirm the payment. Try again.");
  }
}


// ---- Messages to sellers, bulk actions and conversations (migration 0016_conversations.sql) ---------------------

const FILE_BUCKET = "message-files";
const ext = (name) => (String(name).includes(".") ? String(name).split(".").pop().toLowerCase() : "");

// Staff files go to one private bucket under admin/. The database checks the path, type and size again.
export async function uploadMessageFiles(files = []) {
  if (files.length > PROOF_MAX_FILES) throw new ApiError("too_many_files", "You can attach up to 3 files.");
  const out = [];
  for (const f of files) {
    if (!PROOF_TYPES[f.type]?.includes(ext(f.name))) throw new ApiError("type_not_allowed", "Only JPG, PNG, WebP and PDF files can be sent.");
    if (f.size > PROOF_MAX_BYTES || f.size === 0) throw new ApiError("file_too_large", "Each file must be 8 MB or smaller.");
    const safe = f.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
    const path = `admin/${crypto.randomUUID()}-${safe}`;
    const { error } = await client().storage.from(FILE_BUCKET).upload(path, f, { contentType: f.type });
    if (error) throw new ApiError("file_not_uploaded", "A file did not upload. Attach it again.");
    out.push({ path, name: f.name, mime: f.type, size: f.size });
  }
  return out;
}

// Suspend, unsuspend, strike, tag, feature, extend, message and export. Every change is audited on the server.
export async function bulkBusinessAction({ action, ids, reason, params = {} }) {
  const { files, ...rest } = params;
  const sent = action === "message" && files?.length ? { ...rest, attachments: await uploadMessageFiles(files) } : rest;
  const { data } = check(await client().rpc("admin_bulk_business_action", { p_action: action, p_ids: ids, p_reason: reason, p_params: sent }));
  return data;
}

// The server changes are audited and not reversible from here, so no undo token is ever returned.
export async function undoBulkBusinessAction() {
  throw new ApiError("nothing_to_undo", "This action can no longer be undone.");
}

const toMessage = (m, files) => ({
  id: m.id, businessId: m.business_id, businessName: m.businesses?.name ?? "Business", sellerId: m.businesses?.seller_id ?? "",
  sender: m.sender, kind: m.kind, subject: m.subject ?? "Message", body: m.body, needsReply: !!m.needs_reply,
  threadId: m.thread_id ?? m.id, parentId: m.parent_id ?? null, createdAt: m.created_at,
  readAt: m.read_at ?? null, deliveredAt: m.delivered_at ?? null, adminDeliveredAt: m.admin_delivered_at ?? null, adminReadAt: m.admin_read_at ?? null,
  attachments: files.filter((f) => f.message_id === m.id).map((f) => ({ id: f.id, name: f.original_name, mime: f.mime, size: f.size_bytes, path: f.path })),
});

export async function listMessages({ businessId = null } = {}) {
  const db = client();
  let mq = db.from("messages").select("*, businesses(name, seller_id)").eq("channel", "in_app").not("business_id", "is", null).order("created_at", { ascending: false }).limit(1000);
  let fq = db.from("message_attachments").select("*").order("created_at", { ascending: false }).limit(1000);
  if (businessId) { mq = mq.eq("business_id", businessId); fq = fq.eq("business_id", businessId); }
  const [messages, files] = await Promise.all([mq, fq]);
  const f = check(files).data ?? [];
  return (check(messages).data ?? []).map((m) => toMessage(m, f));
}

// Staff answer inside an existing thread (parentId), or start one for one business.
export async function sendMessage({ parentId = null, businessId = null, subject = null, body = "", needsReply = false, files = [] }) {
  const attachments = files.length ? await uploadMessageFiles(files) : [];
  const { data } = check(await client().rpc("admin_send_message", {
    p_business_ids: businessId ? [businessId] : null, p_subject: subject, p_body: body, p_needs_reply: needsReply,
    p_attachments: attachments, p_parent: parentId, p_reason: null,
  }));
  return data;
}

// Opening a seller's messages turns the seller's ticks blue. This device receiving them gives two green ticks.
export async function markMessagesRead({ businessId = null } = {}) {
  const { data } = check(await client().rpc("admin_mark_messages_read", { p_business: businessId, p_ids: null }));
  return data;
}
export async function ackMessagesDelivered() {
  const { data } = check(await client().rpc("message_ack_delivered", { p_ids: null }));
  return data;
}
export async function getUnreadMessages() {
  const { data } = check(await client().rpc("admin_unread_messages"));
  return data ?? 0;
}
export async function openMessageFile(path) {
  const { data, error } = await client().storage.from(FILE_BUCKET).createSignedUrl(path, 300);
  if (error) throw new ApiError("not_found", "We could not open that file.");
  return data.signedUrl;
}
