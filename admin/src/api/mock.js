import { ALLOWED_FROM, canDo } from "../lib/decisions.js";

const mockCounts = {
  brief: "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week",
  liveBusinesses: 142,
  applicationsWaiting: 14,
  unconfirmedPayments: 3,
  expiringSoon: 6,
};

const MPESA = { type: "till", number: "523456", name: "EpicMKT" };

// Statuses use the same snake_case values as the database.
const seedApplications = () => [
  {
    id: "a1111111-1111-4111-8111-111111111111", reference: "EPM-2026-K4M9QX", businessName: "Mara Fresh Mart", ownerName: "Alice Njeri",
    status: "submitted", submittedAt: "Today, 09:12", phone: "+254712000001", email: "alice@marafresh.example",
    town: "Nairobi", category: "Groceries", price: 3200, verificationLevel: "unverified", planName: "Premium",
    flags: [], adminNote: null,
    docs: [{ slot: "Business permit", state: "uploaded" }, { slot: "ID (front)", state: "uploaded" }, { slot: "ID (back)", state: "uploaded" }],
  },
  {
    id: "a2222222-2222-4222-8222-222222222222", reference: "EPM-2026-P7T2WC", businessName: "Umoja Hardware", ownerName: "John Ouma",
    status: "under_review", submittedAt: "Today, 11:40", phone: "+254712000002", email: null,
    town: "Kisumu", category: "Hardware", price: 2500, verificationLevel: "unverified", planName: "Standard",
    flags: [{ id: "f1", path: "documents.permit", message: "Permit photo is blurry", status: "open" }], adminNote: null,
    docs: [{ slot: "Business permit", state: "needs_fix" }, { slot: "ID (front)", state: "uploaded" }],
  },
  {
    id: "a3333333-3333-4333-8333-333333333333", reference: "EPM-2026-H2D8NB", businessName: "Green Valley Foods", ownerName: "Mary Wambui",
    status: "changes_requested", submittedAt: "Yesterday", phone: "+254712000003", email: "mary@greenvalley.example",
    town: "Mombasa", category: "Food", price: 4500, verificationLevel: "unverified", planName: "Premium",
    flags: [], adminNote: "Upload a clearer permit", docs: [{ slot: "Business permit", state: "uploaded" }],
  },
  {
    id: "a4444444-4444-4444-8444-444444444444", reference: "EPM-2026-W9R5LJ", businessName: "Lakeside Tailors", ownerName: "Grace Atieno",
    status: "submitted", submittedAt: "Today, 13:05", phone: "+254712000004", email: "grace@lakeside.example",
    town: "Kisumu", category: "Fashion", price: 2500, verificationLevel: "unverified", planName: "Standard",
    flags: [], adminNote: null, docs: [{ slot: "ID (front)", state: "uploaded" }, { slot: "ID (back)", state: "uploaded" }],
  },
  {
    id: "a5555555-5555-4555-8555-555555555555", reference: "EPM-2026-C3F6VZ", businessName: "Rift Valley Dairy", ownerName: "Peter Kiprop",
    status: "submitted", submittedAt: "Today, 14:20", phone: "+254712000005", email: "peter@riftdairy.example",
    town: "Nakuru", category: "Groceries", price: 3200, verificationLevel: "unverified", planName: "Premium",
    flags: [], adminNote: null, docs: [{ slot: "Business permit", state: "uploaded" }, { slot: "KRA PIN", state: "uploaded" }],
  },
];

let applications = seedApplications();

const clone = (value) => JSON.parse(JSON.stringify(value));
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

const mockBusinesses = [
  { name: "Mara Fresh Mart", town: "Nairobi", plan: "Premium", status: "Live", paidUntil: "2026-11-18" },
  { name: "Umoja Hardware", town: "Kisumu", plan: "Standard", status: "Live", paidUntil: "2026-11-02" },
  { name: "Green Valley Foods", town: "Mombasa", plan: "Premium", status: "Expiring soon", paidUntil: "2026-10-15" },
];

const mockPayments = [
  { receipt: "RCP-1024", businessName: "Mara Fresh Mart", amount: 3200, status: "Confirmed", mpesaCode: "MPESA-4411" },
  { receipt: "RCP-1025", businessName: "Umoja Hardware", amount: 2500, status: "Pending", mpesaCode: "MPESA-4412" },
  { receipt: "RCP-1026", businessName: "Green Valley Foods", amount: 4500, status: "Rejected", mpesaCode: "MPESA-4413" },
];

const fail = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

const payTo = (m, ref) =>
  m.type === "paybill" ? `Paybill ${m.number}, Account ${m.account || ref}` : `Till ${m.number}${m.name ? ` (${m.name})` : ""}`;

// Same wording as the edge function, so the preview matches what is actually sent.
function render(app, { action, reason, note, priceOverride, verificationLevel }) {
  const ref = app.reference;
  let subject = "";
  let text = "";
  let next = app.status;
  if (action === "request_changes") {
    next = "changes_requested";
    subject = `Changes needed on your EpicMKT application ${ref}`;
    text = `EpicMKT: changes are needed on your application ${ref}. ${note ? `${note} ` : ""}Open your status page to fix them.`;
  } else if (action === "reject") {
    next = "rejected";
    subject = `Your EpicMKT application ${ref}`;
    text = `EpicMKT: your application ${ref} was not approved. Reason: ${reason}`;
  } else if (action === "approve") {
    next = "approved";
    const amount = priceOverride ?? app.price;
    subject = `Your EpicMKT application ${ref} is approved`;
    text = `EpicMKT: ${app.businessName} is approved. Pay KES ${amount} to M-Pesa ${payTo(MPESA, ref)}, then enter the M-Pesa code on your status page.`;
  } else if (action === "set_verification") {
    subject = `Verification update for ${ref}`;
    text = `EpicMKT: the verification level of your application ${ref} is now ${verificationLevel}.`;
  } else if (action === "return_to_queue") {
    next = "submitted";
    subject = `Your EpicMKT application ${ref}`;
    text = `EpicMKT: your application ${ref} is back in the review queue.`;
  }
  if (note && action !== "request_changes") text = `${text} ${note}`;
  return { subject, text, next };
}

export const mockAdminApi = {
  async getAdminCounts() {
    return mockCounts;
  },
  async getApplications() {
    await delay(60);
    return clone(applications);
  },
  async getBusinesses() {
    return mockBusinesses;
  },
  async getPayments() {
    return mockPayments;
  },

  /** Mirrors admin-decide-application, including preview and its error codes. */
  async decideApplication(body) {
    await delay();
    const app = applications.find((a) => a.id === body.applicationId);
    if (!app) throw fail("not_found");
    if (!canDo(body.action, app.status)) throw fail("invalid_status", { status: app.status });
    if (body.action === "reject" && !body.reason) throw fail("reason_required");
    if (body.action === "request_changes" && !body.note && !app.flags.some((f) => f.status === "open")) throw fail("flag_or_note_required");
    if (body.action === "approve" && body.priceOverride !== undefined && !body.reason) throw fail("override_reason_required");
    if (body.action === "set_verification" && !body.verificationLevel) throw fail("verification_level_required");

    const { subject, text, next } = render(app, body);
    const channels = body.channels ?? {};
    const messages = {};
    if (channels.sms) messages.sms = { to: app.phone, subject: null, body: text };
    if (channels.email) messages.email = { to: app.email, subject, body: text };

    if (body.preview) return { ok: true, preview: true, action: body.action, nextStatus: next, messages };

    const previousStatus = app.status;
    const previousVerification = app.verificationLevel;
    app.status = next;
    if (body.action === "request_changes") app.adminNote = body.note ?? null;
    if (body.action === "set_verification") app.verificationLevel = body.verificationLevel;
    if (body.action === "approve" && body.verificationLevel) app.verificationLevel = body.verificationLevel;
    if (body.action === "approve" && body.priceOverride !== undefined) app.price = body.priceOverride;
    return { ok: true, action: body.action, status: next, queued: Object.keys(messages), previousStatus, previousVerification };
  },

  async addFlag({ applicationId, path, message }) {
    await delay(80);
    const app = applications.find((a) => a.id === applicationId);
    if (!app) throw fail("not_found");
    const text = (message ?? "").trim();
    if (text.length < 3 || text.length > 500) throw fail("invalid_flag");
    const flag = { id: `f${Date.now()}`, path, message: text, status: "open" };
    app.flags.push(flag);
    return flag;
  },

  /** Test helper: reset the in-memory queue. */
  resetMock() {
    applications = seedApplications();
  },
};

export { ALLOWED_FROM };
export default mockAdminApi;
