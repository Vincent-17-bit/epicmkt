// Application review rules and labels shared by the queue, the detail page and the mock API.
// Pure functions only: nothing here touches the browser, React or Supabase.

export const PAGE_SIZE = 25;

// One tab per status the review team works with. `countKey` is the field of normalizeCounts() that feeds the
// tab badge; "closed" has none because admin_counts() does not report finished applications.
export const APPLICATION_TABS = [
  { id: "submitted", label: "Submitted", statuses: ["submitted"], countKey: "applicationsSubmitted" },
  { id: "under_review", label: "Under review", statuses: ["under_review"], countKey: "applicationsUnderReview" },
  { id: "changes_requested", label: "Changes requested", statuses: ["changes_requested"], countKey: "applicationsChangesRequested" },
  { id: "approved", label: "Awaiting payment", statuses: ["approved"], countKey: "applicationsAwaitingPayment" },
  { id: "payment_confirming", label: "Payment to confirm", statuses: ["payment_confirming"], countKey: "firstPaymentsToConfirm" },
  { id: "closed", label: "Closed", statuses: ["activated", "rejected"], countKey: null },
];

export const DEFAULT_TAB = "submitted";

export function tabById(id) {
  return APPLICATION_TABS.find((tab) => tab.id === id) ?? APPLICATION_TABS[0];
}

// Counts keyed by tab id, for the <Tabs counts={...}> prop. Tabs without a source stay undefined.
export function tabCounts(counts) {
  if (!counts) return undefined;
  return Object.fromEntries(APPLICATION_TABS.map((tab) => [tab.id, tab.countKey ? counts[tab.countKey] : undefined]));
}

// Oldest first for the live queue (first in, first out); newest first for finished work.
export function tabSortAscending(tabId) {
  return tabId !== "closed";
}

export const STATUS_META = {
  uploading: { label: "Uploading", tone: "neutral" },
  submitted: { label: "Submitted", tone: "tint" },
  under_review: { label: "Under review", tone: "live" },
  changes_requested: { label: "Changes requested", tone: "danger" },
  approved: { label: "Awaiting payment", tone: "tint" },
  payment_confirming: { label: "Payment to confirm", tone: "tint" },
  activated: { label: "Activated", tone: "live" },
  rejected: { label: "Rejected", tone: "black" },
};

export function statusMeta(status) {
  return STATUS_META[status] ?? { label: String(status ?? "Unknown"), tone: "neutral" };
}

// Mirrors FROM in supabase/functions/admin-decide-application/handler.ts. The edge function is the authority
// and re-checks every call; this only decides which buttons to offer.
const ACTION_FROM = {
  approve: ["submitted", "under_review"],
  request_changes: ["submitted", "under_review"],
  reject: ["submitted", "under_review", "changes_requested"],
  set_verification: ["submitted", "under_review", "changes_requested", "approved"],
  return_to_queue: ["under_review"],
};

export const ACTION_ORDER = ["approve", "request_changes", "reject", "set_verification", "return_to_queue"];

export const ACTION_LABELS = {
  approve: "Approve",
  request_changes: "Request changes",
  reject: "Reject",
  set_verification: "Change verification",
  return_to_queue: "Return to queue",
};

export function availableActions(status) {
  return ACTION_ORDER.filter((action) => ACTION_FROM[action].includes(status));
}

// Roles allowed to see applications (RLS on applications, documents, flags and events).
export function canReview(role) {
  return role === "owner" || role === "reviewer";
}

// An application that has sat in "submitted" for more than a day without anyone opening it.
export function isOverdue(application, now = new Date()) {
  if (application?.status !== "submitted" || !application.submittedAt) return false;
  return now.getTime() - new Date(application.submittedAt).getTime() > 24 * 60 * 60 * 1000;
}

// Free text from the search box into something safe to put inside a PostgREST `or=(...)` filter.
// Commas, parentheses, quotes, backslashes and wildcard characters would change the filter's meaning.
export function searchTerm(input) {
  return String(input ?? "").replace(/[%*,()"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Phones are stored in international form (+2547...). A reviewer will type 0712..., so also match on the
// national digits. Returns "" when the term is not phone-like.
export function phoneNeedle(term) {
  const digits = String(term ?? "").replace(/[\s()\-.+]/g, "");
  if (!/^\d{6,15}$/.test(digits)) return "";
  if (digits.startsWith("254")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

// The `or` filter for the queue search box, or "" when there is nothing to search for.
export function searchFilter(input) {
  const term = searchTerm(input);
  if (term.length < 2) return "";
  const clauses = ["reference_no", "business_name", "owner_full_name", "phone", "email"].map((col) => `${col}.ilike.%${term}%`);
  const needle = phoneNeedle(term);
  if (needle) clauses.push(`phone.ilike.%${needle}%`);
  return clauses.join(",");
}

// The slot keys the applicant form uploads (client/src/shared/validators.js). Category documents are `cat_<key>`.
const SLOT_LABELS = {
  owner_id_front: "Owner ID or passport (front)",
  owner_id_back: "Owner ID (back)",
  sbp: "Single business permit",
  signboard: "Signboard photo",
  br_cert: "Business registration certificate",
  kra_pin_cert: "KRA PIN certificate",
};

const humanize = (text) => {
  const spaced = String(text ?? "").replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "";
};

// "cat_ppb_premises_licence" -> "Ppb premises licence" when the slot is not one of the fixed ones.
export function slotLabel(slotKey) {
  if (SLOT_LABELS[slotKey]) return SLOT_LABELS[slotKey];
  const key = String(slotKey ?? "");
  return humanize(key.startsWith("cat_") ? key.slice(4) : key) || "Document";
}

const FIELD_LABELS = {
  "owner.fullName": "Owner name",
  "owner.idNumber": "ID number",
  phone: "Phone",
  altPhone: "Alternative phone",
  email: "Email",
  "business.name": "Business name",
  "business.regType": "Registration type",
  "business.regNumber": "Registration number",
  "business.yearEstablished": "Year established",
  "business.kraPin": "KRA PIN",
  "business.sbpNumber": "Permit number",
  "business.sbpExpiry": "Permit expiry",
  "business.shortDescription": "Description",
  "location.county": "County",
  "location.town": "Town",
  "location.address": "Address",
  "location.lat": "Map pin",
  "location.lng": "Map pin",
  "contacts.businessPhones": "Business phones",
  "contacts.whatsapp": "WhatsApp",
  "contacts.website": "Website",
};

// A flag's `path` points at a form field ("business.sbpNumber"), a document ("documents.sbp") or a category
// question ("templateValues.xyz"). Show it the way the reviewer thinks of it.
export function flagPathLabel(path) {
  const p = String(path ?? "");
  if (FIELD_LABELS[p]) return FIELD_LABELS[p];
  if (p.startsWith("documents.")) return slotLabel(p.slice("documents.".length));
  if (p.startsWith("templateValues.")) return humanize(p.slice("templateValues.".length));
  return humanize(p.split(".").pop());
}

const EVENT_LABELS = {
  submitted: (e) => (e.data?.resubmitted ? "Resubmitted by the applicant" : "Application submitted"),
  under_review: () => "Opened for review",
  returned_to_queue: () => "Returned to the queue",
  return_to_queue: () => "Returned to the queue",
  request_changes: () => "Changes requested",
  approve: () => "Approved",
  reject: () => "Rejected",
  set_verification: (e) => (e.data?.verificationLevel ? `Verification set to ${e.data.verificationLevel}` : "Verification changed"),
  document_viewed: (e) => `Document viewed${e.data?.slot ? `: ${slotLabel(e.data.slot)}` : ""}`,
  corrected: () => "Applicant corrected flagged fields",
  payment_submitted: () => "Applicant submitted an M-Pesa code",
  payment_rejected: () => "Payment rejected",
  activated: () => "Activated, business created",
  otp_requested: () => "Applicant requested a status code",
  session_started: () => "Applicant opened the status page",
};

export function eventLabel(event) {
  const make = EVENT_LABELS[event?.type];
  if (make) return make(event);
  const text = String(event?.type ?? "event").replace(/[_-]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatKes(amount) {
  if (amount === null || amount === undefined) return "";
  return `KES ${Number(amount).toLocaleString("en-KE")}`;
}

// Show only the end of an ID or permit number until the reviewer asks to see all of it.
export function maskValue(value, visible = 3) {
  const text = String(value ?? "");
  if (!text) return "";
  if (text.length <= visible) return "•".repeat(text.length);
  return `${"•".repeat(Math.min(text.length - visible, 8))}${text.slice(-visible)}`;
}

export function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// What the edge function answers to, in words a reviewer can act on.
const ERROR_TEXT = {
  invalid_status: "This application has moved to a different status. Reload it and try again.",
  not_found: "That application no longer exists.",
  mpesa_not_configured: "Set the M-Pesa Till or Paybill number in Settings before approving.",
  reason_required: "Add a reason.",
  override_reason_required: "A price override needs a reason.",
  flag_or_note_required: "Add a note, or flag at least one field, so the applicant knows what to change.",
  verification_level_required: "Choose a verification level.",
  rate_limited: "Too many actions in a short time. Wait a minute and try again.",
  forbidden: "Your role is not allowed to do that.",
  unauthorized: "Your session has expired. Sign in again.",
  invalid_input: "Some of the details are not valid. Check the form and try again.",
  server_error: "Something went wrong on our side. Try again in a moment.",
};

export function describeError(error) {
  const code = error?.code ?? error?.message;
  return ERROR_TEXT[code] ?? (error?.message && !/^[a-z_]+$/.test(error.message) ? error.message : ERROR_TEXT.server_error);
}

// ---- Decisions ------------------------------------------------------------------------------------------------

// What the dialog collects for each action. Anything not listed for an action is ignored.
export const ACTION_FIELDS = {
  approve: ["verificationLevel", "priceOverride", "reason"],
  request_changes: ["note"],
  reject: ["reason"],
  set_verification: ["verificationLevel"],
  return_to_queue: [],
};

export const ACTION_HELP = {
  approve: "The applicant is told how much to pay and where, and can then enter their M-Pesa code.",
  request_changes: "The applicant is asked to fix what you flagged or describe below.",
  reject: "This ends the application. The applicant is told the reason.",
  set_verification: "Changes the verification level without moving the application.",
  return_to_queue: "Releases the application so another reviewer can pick it up.",
};

// The body for admin-decide-application. Empty fields are left out, so the function's own validation
// (zod, then the per-action rules) is the single source of truth about what is acceptable.
export function buildDecisionPayload({ applicationId, action, reason, note, channels, verificationLevel, priceOverride, preview = false }) {
  const fields = ACTION_FIELDS[action] ?? [];
  const payload = {
    applicationId,
    action,
    channels: { sms: Boolean(channels?.sms), email: Boolean(channels?.email), inApp: false },
    preview: Boolean(preview),
  };
  const text = (value) => (typeof value === "string" ? value.trim() : "");

  if (fields.includes("reason") && text(reason)) payload.reason = text(reason).slice(0, 500);
  if (fields.includes("note") && text(note)) payload.note = text(note).slice(0, 1000);
  if (fields.includes("verificationLevel") && verificationLevel) payload.verificationLevel = verificationLevel;
  if (fields.includes("priceOverride") && String(priceOverride ?? "").trim() !== "") {
    const amount = Number(priceOverride);
    if (Number.isInteger(amount)) payload.priceOverride = amount;
  }
  return payload;
}

// The same rules the function enforces, so the buttons can say what is missing before a round trip.
// Returns "" when the form is acceptable.
export function validateDecision({ action, reason, note, verificationLevel, priceOverride }, { openFlags = 0 } = {}) {
  const has = (value) => typeof value === "string" && value.trim().length > 0;
  if (action === "reject" && !has(reason)) return "Add the reason the applicant will be told.";
  if (action === "request_changes" && !has(note) && openFlags === 0) return "Add a note, or flag at least one field, so the applicant knows what to change.";
  if (action === "set_verification" && !verificationLevel) return "Choose a verification level.";
  if (action === "approve" && String(priceOverride ?? "").trim() !== "") {
    const amount = Number(priceOverride);
    if (!Number.isInteger(amount) || amount < 0 || amount > 100000) return "The price must be a whole number of shillings between 0 and 100,000.";
    if (!has(reason)) return "A price override needs a reason.";
  }
  return "";
}
