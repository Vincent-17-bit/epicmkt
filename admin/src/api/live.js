import { supabase } from "../lib/supabaseClient.js";
import { normalizeCounts } from "../lib/counts.js";
import { describeDiscount } from "../lib/flash.js";
import { DEFAULT_TAB, PAGE_SIZE, searchFilter, tabById, tabSortAscending } from "../lib/applications.js";
import { ACTION_TEXT, ApiError, toApiError } from "./errors.js";
import { PROOF_MAX_BYTES, PROOF_MAX_FILES, PROOF_TYPES } from "@epicmkt/shared";

const notConfigured = () => {
  throw new Error("Live data for this page is not connected yet. You are signed in; the queries for this page have not been built.");
};

// Still behind the "not connected" message so a page never shows made-up data. Every bulk action on the Businesses page
// and its undo are live below, as are the Payments page and the Command Center.
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

// Notification rows ("n:...") are deleted for good. Audit rows ("a:...") are only hidden from this admin's feed:
// the audit log itself is never changed (migration 0059). Returns { deleted, dismissed, skipped }.
export async function deleteAdminActivity({ ids, reason = null } = {}) {
  const { data } = check(await client().rpc("admin_delete_activity", { p_ids: ids, p_reason: reason }));
  return { deleted: 0, dismissed: 0, skipped: 0, ...(data ?? {}) };
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

// Suspend, unsuspend, strike, unlist, tag, feature, extend, assign, message and export. Every change is audited on the
// server. Everything except message and export comes back with an undoToken that undoBulkBusinessAction accepts for 15 minutes.
export async function bulkBusinessAction({ action, ids, reason, params = {} }) {
  const { files, ...rest } = params;
  const sent = action === "message" && files?.length ? { ...rest, attachments: await uploadMessageFiles(files) } : rest;
  const { data } = check(await client().rpc("admin_bulk_business_action", { p_action: action, p_ids: ids, p_reason: reason, p_params: sent }));
  return data;
}

// Puts back what the action changed, for the person who ran it and only once. A business changed by someone else in the
// meantime is left as it is and counted in `skipped`. The undo is audited too.
export async function undoBulkBusinessAction(undoToken) {
  if (!undoToken) throw new ApiError("nothing_to_undo", ACTION_TEXT.nothing_to_undo);
  const { data } = check(await client().rpc("admin_undo_bulk_business_action", { p_token: undoToken }));
  return { restored: data?.restored ?? 0, skipped: data?.skipped ?? 0 };
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
  const build = (hidden) => {
    let q = db.from("messages").select("*, businesses(name, seller_id)").eq("channel", "in_app").not("business_id", "is", null);
    if (hidden) q = q.is("admin_hidden_at", null);
    q = q.order("created_at", { ascending: false }).limit(1000);
    return businessId ? q.eq("business_id", businessId) : q;
  };
  let fq = db.from("message_attachments").select("*").order("created_at", { ascending: false }).limit(1000);
  if (businessId) fq = fq.eq("business_id", businessId);
  let [messages, files] = await Promise.all([build(true), fq]);
  if (messages.error && /admin_hidden_at/.test(messages.error.message ?? "")) messages = await build(false);
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
export async function markMessagesRead({ businessId = null, ids = null } = {}) {
  const { data } = check(await client().rpc("admin_mark_messages_read", { p_business: businessId, p_ids: ids }));
  return data;
}
export async function ackMessagesDelivered() {
  const { data } = check(await client().rpc("message_ack_delivered", { p_ids: null }));
  return data;
}
export async function deleteMessage(id) {
  const { data } = check(await client().rpc("admin_delete_message", { p_id: id }));
  return data;
}
export async function deleteConversation({ businessId, threadId = null }) {
  const { data } = check(await client().rpc("admin_delete_conversation", { p_business: businessId, p_thread: threadId }));
  return data;
}
export async function listResolvedConversations() {
  const { data } = check(await client().from("admin_conversation_state").select("business_id"));
  return (data ?? []).map((r) => r.business_id);
}
export async function setConversationResolved({ businessId, resolved }) {
  const { data } = check(await client().rpc("admin_set_conversation_resolved", { p_business: businessId, p_resolved: !!resolved }));
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

// ---- Flash sales (migration 0013_flash_sales.sql) ---------------------------------------------------------------

// Admins read every flash sale (policy "admin all flash_sales"). The business and item names come along in the
// same request. "ended" also lists cancelled sales (a scheduled sale an admin stopped before it started).
export async function listFlashSales({ status = "" } = {}) {
  let query = client()
    .from("flash_sales")
    .select("id, starts_at, ends_at, status, ended_reason, discount_type, discount_value, business:businesses(name), item:items(name)")
    .order("ends_at", { ascending: false })
    .limit(200);
  if (status === "ended") query = query.in("status", ["ended", "cancelled"]);
  else if (status) query = query.eq("status", status);

  const { data } = check(await query);
  return (data ?? []).map((row) => ({
    id: row.id,
    businessName: row.business?.name ?? "Unknown business",
    itemName: row.item?.name ?? "Removed item",
    discount: describeDiscount(row.discount_type, row.discount_value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    endedReason: row.ended_reason,
  }));
}

const FLASH_END_TEXT = {
  reason_required: "Give a reason of at least 3 characters.",
  not_found: "This flash sale no longer exists.",
  flash_closed: "This flash sale has already ended.",
  forbidden: "Your role is not allowed to end flash sales.",
};

// admin_end_flash_sale ends or cancels the sale, puts customers back on the normal price, tells the seller and
// writes the audit entry, all in one transaction.
export async function endFlashSale({ id, reason }) {
  const { error } = await client().rpc("admin_end_flash_sale", { p_id: id, p_reason: String(reason ?? "").trim() });
  if (error) {
    const known = FLASH_END_TEXT[String(error.message ?? "").trim()] ?? (error.code === "42501" ? FLASH_END_TEXT.forbidden : null);
    if (known) throw new ApiError("flash_end_failed", known);
    throw toApiError(error);
  }
  return { ok: true };
}

// ---- Header search (admin_search, migration 0008_admin.sql) ------------------------------------------------------

// Searches businesses, items, applications, payments and FAQs in one call. Under 2 characters returns nothing.
export async function globalSearch(query) {
  const term = String(query ?? "").trim();
  if (term.length < 2) return {};
  const { data } = check(await client().rpc("admin_search", { q: term, scopes: null, lim: 6 }));
  return data ?? {};
}

// ---- Notifications: what sellers and applicants did, from admin_notifications (migration 0004_core.sql) ----------

export async function getNotifications({ limit = 20, unreadOnly = false } = {}) {
  let query = client()
    .from("admin_notifications")
    .select("id, kind, data, read_at, created_at, business:businesses(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) query = query.is("read_at", null);
  const { data } = check(await query);
  return (data ?? []).map((row) => ({
    id: row.id,
    at: row.created_at,
    kind: row.kind,
    business_name: row.business?.name ?? row.data?.business_name ?? null,
    data: row.data ?? {},
    read: Boolean(row.read_at),
  }));
}

export async function getUnreadNotificationCount() {
  const { count } = check(
    await client().from("admin_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  );
  return count ?? 0;
}

// ids = a list to mark, or omitted to mark everything unread.
export async function markNotificationsRead(ids) {
  let query = client().from("admin_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (Array.isArray(ids)) query = query.in("id", ids);
  check(await query);
  return { ok: true };
}

// ---- Business detail page (migration 0023_admin_business_detail.sql) -------------------------------------------

const detailRpc = async (fn, args) => check(await client().rpc(fn, args)).data;

export const getBusinessDetail = (id) => detailRpc("admin_business_detail", { p_id: id });
export async function getLoginDelivery(businessId) {
  const { data } = check(
    await client().from("messages").select("channel,status,error,created_at").eq("business_id", businessId)
      .eq("template_key", "login_details").in("channel", ["sms", "email"]).order("created_at", { ascending: false }).limit(10),
  );
  return data ?? [];
}
export const resendLogin = ({ businessId, reason }) => callFunction("admin-reset-seller-password", { businessId, reason });
export const getBusinessPayments = (id) => detailRpc("admin_business_payments", { p_id: id });
export const getBusinessActivity = (id) => detailRpc("admin_business_activity", { p_id: id, p_limit: 50 });
export const getBusinessItems = (id) => detailRpc("admin_business_items", { p_id: id });
export const getBusinessFlags = (id) => detailRpc("admin_business_flags", { p_id: id });
export const getBusinessNotes = (id) => detailRpc("admin_business_notes", { p_id: id });

export const setItemHidden = ({ id, hidden, reason = null }) =>
  detailRpc("admin_set_item_hidden", { p_id: id, p_hidden: hidden, p_reason: reason });
export const setFlagStatus = ({ id, status, note = null }) =>
  detailRpc("admin_set_flag_status", { p_id: id, p_status: status, p_note: note });
// Hide a live business from customers (it becomes "paused"), or show it again.
export const setBusinessVisibility = ({ id, visible, reason = null }) =>
  detailRpc("admin_set_business_visibility", { p_id: id, p_visible: visible, p_reason: reason });

export const addBusinessNote = ({ id, body, pinned = false }) =>
  detailRpc("admin_add_business_note", { p_id: id, p_body: body, p_pinned: pinned });
export const setBusinessNotePinned = ({ noteId, pinned }) =>
  detailRpc("admin_set_business_note_pinned", { p_note_id: noteId, p_pinned: pinned });
export const deleteBusinessNote = (noteId) => detailRpc("admin_delete_business_note", { p_note_id: noteId });

// ---- Moderation, catalogue, approvals and the Expiry Radar (migration 0024_admin_moderation_approvals.sql) ------

const pageArgs = ({ page = 0, pageSize = 50 } = {}) => ({ p_limit: pageSize, p_offset: page * pageSize });

export const getModerationCounts = () => detailRpc("admin_moderation_counts", {});
export const listFlags = ({ status = "open", search = "", ...paging } = {}) =>
  detailRpc("admin_flags_query", { p_status: status, p_search: search.trim() || null, ...pageArgs(paging) });
export const listReports = ({ status = "open", search = "", ...paging } = {}) =>
  detailRpc("admin_reports_query", { p_status: status, p_search: search.trim() || null, ...pageArgs(paging) });
export const setReportStatus = ({ id, status, note = null }) => detailRpc("admin_set_report_status", { p_id: id, p_status: status, p_note: note });
export const raiseFlag = ({ businessId, itemId = null, reason, message, dueDays = 3 }) =>
  detailRpc("admin_raise_flag", { p_business: businessId, p_item: itemId, p_reason: reason, p_message: message, p_due_days: dueDays });

export const listCatalog = ({ search = "", state = "all", category = "", ...paging } = {}) =>
  detailRpc("admin_catalog_query", { p_search: search.trim() || null, p_state: state, p_category: category || null, ...pageArgs(paging) });
export const bulkSetItemsHidden = ({ ids, hidden, reason = null }) =>
  detailRpc("admin_bulk_set_items_hidden", { p_ids: ids, p_hidden: hidden, p_reason: reason });

export const listChangeRequests = ({ status = "pending", ...paging } = {}) =>
  detailRpc("admin_change_requests_query", { p_status: status, ...pageArgs(paging) });
export const decideChangeRequest = ({ id, approve, note = null }) =>
  detailRpc("admin_decide_change_request", { p_id: id, p_approve: approve, p_note: note });

export const getExpiryRadar = ({ days = 30 } = {}) => detailRpc("admin_expiry_radar", { p_days: days });
export const setModerationFlag = setFlagStatus;

// ---- Broadcasts, message log, templates and Automation (migration 0025_admin_messaging_console.sql) -------------

export const listMessageLog = ({ channel = "all", status = "all", search = "", ...paging } = {}) =>
  detailRpc("admin_message_log_query", { p_channel: channel, p_status: status, p_search: search.trim() || null, ...pageArgs(paging) });
export const getMessageSummary = ({ days = 7 } = {}) => detailRpc("admin_message_summary", { p_days: days });
export const getMessageDetail = (id) => detailRpc("admin_message_detail", { p_id: id });
export const listPendingBroadcasts = () => detailRpc("admin_pending_broadcasts", {});
export const cancelBroadcast = ({ batchId, reason = null }) => detailRpc("admin_cancel_broadcast", { p_batch: batchId, p_reason: reason });
export const setTemplateEnabled = ({ key, enabled }) => detailRpc("admin_set_template_enabled", { p_key: key, p_enabled: enabled });
export const deleteTemplate = (key) => detailRpc("admin_delete_template", { p_key: key });
export const retryMessage = (id) => detailRpc("admin_retry_message", { p_id: id });
export const retryFailedMessages = ({ days = 7 } = {}) => detailRpc("admin_retry_failed_messages", { p_days: days });
export const listTemplates = () => detailRpc("admin_templates_list", {});
export const saveTemplate = ({ key, channel, subject = null, bodyEn, bodySw = null, transactional = false }) =>
  detailRpc("admin_save_template", { p_key: key, p_channel: channel, p_subject: subject, p_body_en: bodyEn, p_body_sw: bodySw, p_transactional: transactional });
// `payload` comes from buildBroadcast() in lib/messaging.js; with payload.preview the function only counts and renders samples.
export const sendBroadcast = (payload) => callFunction("admin-message", payload);

export const getAutomationStatus = () => detailRpc("admin_automation_status", {});
export const setJobActive = ({ name, active }) => detailRpc("admin_set_job_active", { p_name: name, p_active: active });
export const runJob = (name) => detailRpc("admin_run_job", { p_name: name });

// ---- Plans, categories and the template builder (migrations 0026_admin_plans.sql, 0027_admin_categories.sql) ------

export const listPlans = () => detailRpc("admin_plans_list", {});
export const getPlanHistory = ({ category, plan }) => detailRpc("admin_plan_history", { p_category: category, p_plan: plan });
export const savePlan = ({ category, plan, price, benefits, badge = null, reason = null }) =>
  detailRpc("admin_save_plan", { p_category: category, p_plan: plan, p_price: price, p_benefits: benefits, p_badge: badge || null, p_reason: reason });

export const listCategories = () => detailRpc("admin_categories_list", {});
export const saveCategory = ({ id, name, group, icon = "store", tier, sort = 0, active, template, extraDocs, reason = null }) =>
  detailRpc("admin_save_category", {
    p_id: id, p_name: name, p_grp: group, p_icon: icon, p_tier: tier, p_sort: sort, p_active: active, p_template: template, p_extra_docs: extraDocs, p_reason: reason,
  });

// ---- Audit viewer and Analytics (migration 0028_admin_audit_analytics.sql) ---------------------------------------

export const listAudit = ({ search = "", action = "", actor = "", from = null, to = null, ...paging } = {}) =>
  detailRpc("admin_audit_query", { p_search: search.trim() || null, p_action: action || null, p_actor: actor.trim() || null, p_from: from || null, p_to: to || null, ...pageArgs(paging) });
export const getAuditGroups = () => detailRpc("admin_audit_groups", {});
// Kept for callers of the old stub: the latest entries, newest first.
export const listAuditEntries = async ({ limit = 50 } = {}) => (await listAudit({ pageSize: limit })).rows;
export const getAnalytics = ({ days = 30 } = {}) => detailRpc("admin_analytics", { p_days: days });

// ---- Settings and grace (migration 0029_grace_and_settings.sql) -----------------------------------------------------

export const getSettings = async () => check(await client().rpc("admin_get_settings")).data;

export const saveSettings = async (settings, reason = null) =>
  check(await client().rpc("admin_save_settings", { p_settings: settings, p_reason: reason })).data;

export const setBusinessGrace = ({ id, days, reason }) =>
  detailRpc("admin_set_business_grace", { p_business: id, p_days: days, p_reason: reason });
