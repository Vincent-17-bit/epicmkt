// Demo data for the broadcast composer, message log, templates and Automation. Local development only.
import { ApiError } from "./errors.js";
import { isSystemTemplate } from "../lib/messaging.js";

const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN = 60000;
const at = (offset) => new Date(Date.now() + offset).toISOString();
const matches = (text, search) => !search?.trim() || String(text ?? "").toLowerCase().includes(search.trim().toLowerCase());
const page = (rows, { page: p = 0, pageSize = 50 } = {}) => ({ rows: rows.slice(p * pageSize, (p + 1) * pageSize).map((r) => ({ ...r })), total: rows.length });

let log = [
  { id: "m1", created_at: at(-20 * MIN), channel: "sms", status: "sent", kind: "reminder", subject: "Renewal reminder", template_key: "renew_7d", to_address: "+254712345678", transactional: true, business_id: "b1", business_name: "Lakeside Provisions", body: "Hi Lakeside Provisions, your EpicMKT listing ends soon. Renew to stay visible.", batch_id: null, attempts: 1, error: null, cost_kes: 0.8, scheduled_at: at(-20 * MIN), sent_at: at(-19 * MIN) },
  { id: "m2", created_at: at(-3 * 60 * MIN), channel: "sms", status: "failed", kind: "general", subject: "Weekend offer", template_key: null, to_address: "+254722000111", transactional: false, business_id: "b2", business_name: "Fade Kings", body: "Weekend offer: 20% off featured listings until Sunday.", batch_id: null, attempts: 3, error: "provider_unavailable", cost_kes: null, scheduled_at: at(-3 * 60 * MIN), sent_at: null },
  { id: "m3", created_at: at(-2 * MIN), channel: "email", status: "queued", kind: "general", subject: "October newsletter", template_key: "newsletter", to_address: "info@bustani.test", transactional: false, business_id: "b3", business_name: "Bustani Foods", body: "Hello Bustani Foods, here is what is new this month.", batch_id: null, attempts: 0, error: null, cost_kes: null, scheduled_at: at(-2 * MIN), sent_at: null },
  { id: "m4", created_at: at(-45 * MIN), channel: "email", status: "sent", kind: "general", subject: "Application received", template_key: "application.received", to_address: "kamau@cuts.test", transactional: true, business_id: null, business_name: null, application_id: "a1", application_name: "Kamau Cuts", applicant_name: "Wanjiku Kamau", body: "Thanks for applying. We will review your documents within two working days.", batch_id: null, attempts: 1, error: null, cost_kes: null, scheduled_at: at(-45 * MIN), sent_at: at(-44 * MIN) },
];
let batches = [
  { batch_id: "demo-batch-1", created_at: at(-60 * MIN), scheduled_at: at(26 * 60 * MIN), subject: "Weekend offer", template_key: null, pending: 6, sent: 0, total: 6, recipients: 6, channels: ["sms"] },
];
let templates = [
  { key: "renew_7d", channel: "sms", subject: null, body_en: "Hi {{business_name}}, your EpicMKT listing ends on {{paid_until}}. Renew to stay visible.", body_sw: "Habari {{business_name}}, tangazo lako linaisha {{paid_until}}.", transactional: true, version: 3, updated_at: at(-9 * 24 * 60 * MIN), used_30d: 41 },
  { key: "welcome", channel: "email", subject: "Welcome to EpicMKT", body_en: "Welcome {{business_name}}. Your listing is live.", body_sw: null, transactional: false, version: 2, updated_at: at(-20 * 24 * 60 * MIN), used_30d: 12 },
  { key: "newsletter", channel: "email", subject: "News from EpicMKT", body_en: "Hello {{business_name}}, here is what is new this month: {{highlights}}", body_sw: null, transactional: false, version: 1, updated_at: at(-2 * 24 * 60 * MIN), used_30d: 1 },
];
let jobs = [
  { name: "dispatch-messages", schedule: "* * * * *", active: true, last_run: { status: "succeeded", started_at: at(-MIN), ended_at: at(-MIN + 800), message: "1 row" } },
  { name: "daily-lifecycle", schedule: "0 4 * * *", active: true, last_run: { status: "succeeded", started_at: at(-5 * 60 * MIN), ended_at: at(-5 * 60 * MIN + 4000), message: "1 row" } },
];

export async function listMessageLog({ channel = "all", status = "all", search = "", ...paging } = {}) {
  await latency();
  return page(log.filter((m) => (channel === "all" || m.channel === channel) && (status === "all" || m.status === status)
    && (matches(m.subject, search) || matches(m.business_name, search) || matches(m.to_address, search) || matches(m.template_key, search)))
    .map(({ body, applicant_name, ...row }) => row), paging);
}

export async function getMessageDetail(id) {
  await latency();
  const m = log.find((x) => x.id === id);
  if (!m) throw new ApiError("message_not_found", "That message no longer exists.");
  return { provider_id: m.status === "sent" ? "demo-1" : null, created_by_email: "admin@epicmkt.test", seller_id: m.business_id ? "ES100001" : null, application_name: null, applicant_name: null, ...m };
}

export async function getMessageSummary() {
  await latency();
  const by = {};
  for (const m of log) by[m.status] = (by[m.status] ?? 0) + 1;
  const due = log.filter((m) => m.status === "queued" && Date.parse(m.scheduled_at) <= Date.now());
  return { days: 7, by_status: by, cost_kes: 0.8, queued_now: by.queued ?? 0, due_now: due.length, oldest_due_at: due[0]?.scheduled_at ?? null, failed_now: by.failed ?? 0 };
}

export async function retryMessage(id) {
  await latency();
  const m = log.find((x) => x.id === id);
  if (!m) throw new ApiError("not_found");
  if (m.status !== "failed") throw new ApiError("not_failed");
  log = log.map((x) => (x.id === id ? { ...x, status: "queued", attempts: 0, error: null } : x));
  return true;
}

export async function retryFailedMessages() {
  await latency();
  const n = log.filter((m) => m.status === "failed").length;
  log = log.map((m) => (m.status === "failed" ? { ...m, status: "queued", attempts: 0, error: null } : m));
  return n;
}

export async function listTemplates() { await latency(); return templates.map((t) => ({ disabled_at: null, ...t, system: isSystemTemplate(t.key) })); }

export async function saveTemplate({ key, channel, subject = null, bodyEn, bodySw = null, transactional = false }) {
  await latency();
  if (!/^[a-z0-9_.-]{2,60}$/.test(key ?? "")) throw new ApiError("invalid_key");
  if (!String(bodyEn ?? "").trim()) throw new ApiError("invalid_input");
  if (channel === "sms" && bodyEn.length > 612) throw new ApiError("sms_too_long");
  if (channel === "email" && !String(subject ?? "").trim()) throw new ApiError("subject_required");
  const old = templates.find((t) => t.key === key);
  if (old && old.channel !== channel) throw new ApiError("channel_locked");
  const version = (old?.version ?? 0) + 1;
  const row = { key, channel, subject: subject || null, body_en: bodyEn.trim(), body_sw: bodySw?.trim() || null, transactional, version, updated_at: at(0), used_30d: old?.used_30d ?? 0 };
  templates = old ? templates.map((t) => (t.key === key ? row : t)) : [...templates, row];
  return version;
}

export async function listPendingBroadcasts() {
  await latency();
  return batches.filter((b) => b.pending > 0).map((b) => ({ ...b, channels: [...b.channels] }));
}

export async function cancelBroadcast({ batchId }) {
  await latency();
  const batch = batches.find((b) => b.batch_id === batchId);
  if (!batchId) throw new ApiError("invalid_input");
  if (!batch) throw new ApiError("broadcast_not_found");
  const cancelled = batch.pending;
  batches = batches.map((b) => (b.batch_id === batchId ? { ...b, pending: 0 } : b));
  return { cancelled, sent: batch.sent, failed: 0, inFlight: 0, total: batch.total };
}

export async function setTemplateEnabled({ key, enabled }) {
  await latency();
  const t = templates.find((x) => x.key === key);
  if (!key || typeof enabled !== "boolean") throw new ApiError("invalid_input");
  if (!t) throw new ApiError("template_not_found");
  const changed = !!t.disabled_at === enabled;
  templates = templates.map((x) => (x.key === key ? { ...x, disabled_at: enabled ? null : at(0) } : x));
  return changed;
}

export async function deleteTemplate(key) {
  await latency();
  if (!key) throw new ApiError("invalid_input");
  if (!templates.some((t) => t.key === key)) throw new ApiError("template_not_found");
  if (isSystemTemplate(key)) throw new ApiError("template_in_use");
  templates = templates.filter((t) => t.key !== key);
  return true;
}

export async function sendBroadcast(payload) {
  await latency(200);
  const sizes = { all_live: 38, expiring_7d: 6, in_grace: 2, expired: 9 };
  const seg = payload.target?.segment ?? "";
  const recipients = sizes[seg] ?? (seg.startsWith("category:") || seg.startsWith("town:") ? 4 : 0);
  if (!recipients) throw new ApiError("no_recipients");
  const rows = { sms: payload.channels.sms ? recipients : 0, email: payload.channels.email ? Math.max(recipients - 1, 0) : 0, inApp: payload.channels.inApp ? recipients : 0 };
  const skipped = { sms: 0, email: payload.channels.email ? 1 : 0, inApp: 0 };
  const tpl = templates.find((t) => t.key === payload.templateKey);
  if (tpl?.disabled_at) throw new ApiError("template_disabled");
  const body = payload.body ?? tpl?.body_en ?? "";
  const common = { ok: true, rows, skipped, notFound: 0, transactional: payload.transactional ?? tpl?.transactional ?? false, scheduledAt: payload.scheduledAt ?? at(0) };
  if (payload.preview) {
    return { ...common, preview: true, recipients, samples: [{ channel: payload.channels.sms ? "sms" : "email", subject: payload.subject ?? tpl?.subject ?? "A message from EpicMKT", body: body.replace(/\{\{\s*business_name\s*\}\}/g, "Lakeside Provisions").replace(/\{\{\s*paid_until\s*\}\}/g, "28 Oct 2026") }] };
  }
  const queued = rows.sms + rows.email + rows.inApp;
  const batchId = payload.idempotencyKey ?? `demo-${batches.length + 1}`;
  if (Date.parse(common.scheduledAt) > Date.now()) {
    batches = [...batches, { batch_id: batchId, created_at: at(0), scheduled_at: common.scheduledAt, subject: payload.subject ?? tpl?.subject ?? "A message from EpicMKT", template_key: payload.templateKey ?? null, pending: queued, sent: 0, total: queued, recipients, channels: ["sms", "email", "in_app"].filter((c) => (c === "in_app" ? payload.channels.inApp : payload.channels[c])) }];
  }
  return { ...common, queued, batchId };
}

export async function getAutomationStatus() {
  await latency();
  return {
    cron_installed: true, net_installed: true, expected: ["dispatch-messages", "daily-lifecycle"], jobs: jobs.map((j) => ({ ...j })),
    queue: { queued: 1, due_now: 1, oldest_due_at: at(-2 * MIN), failed_7d: log.filter((m) => m.status === "failed").length },
    last_sent_at: at(-19 * MIN), last_reminder_at: at(-20 * MIN),
  };
}

export async function setJobActive({ name, active }) {
  await latency();
  if (!jobs.some((j) => j.name === name)) throw new ApiError("unknown_job");
  jobs = jobs.map((j) => (j.name === name ? { ...j, active } : j));
  return true;
}

export async function runJob(name) {
  await latency(250);
  if (!jobs.some((j) => j.name === name)) throw new ApiError("unknown_job");
  jobs = jobs.map((j) => (j.name === name ? { ...j, last_run: { status: "succeeded", started_at: at(0), ended_at: at(500), message: "1 row" } } : j));
  return 1;
}
