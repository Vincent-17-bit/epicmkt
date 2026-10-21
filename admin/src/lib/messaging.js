// Pure helpers for broadcasts, templates and the Automation screen. No React, no network.

export const SMS_SEGMENT = 160;
export const SMS_MAX = 612; // four segments: the edge function refuses anything longer

/** Characters, SMS segments (160 each, 153 when joined) and whether it is over the limit. */
export function smsInfo(text = "") {
  const length = String(text).length;
  const segments = length === 0 ? 0 : length <= SMS_SEGMENT ? 1 : Math.ceil(length / 153);
  return { length, segments, over: length > SMS_MAX };
}

/** The {{variables}} a template uses, in order, without repeats. */
export function templateVariables(...texts) {
  const found = [];
  for (const text of texts) {
    for (const match of String(text ?? "").matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi)) {
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }
  return found;
}

// What admin-message fills in itself for every recipient. Anything else must be supplied by the sender.
export const BUILT_IN_VARIABLES = ["business_name", "seller_id", "paid_until"];
export const missingVariables = (names, supplied = {}) => names.filter((n) => !BUILT_IN_VARIABLES.includes(n) && !String(supplied[n] ?? "").trim());

export const SEGMENTS = [
  { id: "all_live", label: "Every live business" },
  { id: "expiring_7d", label: "Expiring within 7 days" },
  { id: "in_grace", label: "In their grace day" },
  { id: "expired", label: "Expired" },
  { id: "category", label: "One category" },
  { id: "town", label: "One town" },
];

/** The segment string the database understands, or "" when a category or town has not been chosen yet. */
export function segmentKey(kind, value = "") {
  if (kind === "category" || kind === "town") return String(value).trim() ? `${kind}:${String(value).trim()}` : "";
  return SEGMENTS.some((s) => s.id === kind) ? kind : "";
}

/** The request body for the admin-message function, or { error } when the form is not ready. */
export function buildBroadcast(form, { preview = false, idempotencyKey } = {}) {
  const segment = segmentKey(form.segment, form.segmentValue);
  if (!segment) return { error: "Choose who should receive this." };
  const channels = { sms: !!form.sms, email: !!form.email, inApp: !!form.inApp };
  if (!channels.sms && !channels.email && !channels.inApp) return { error: "Choose at least one channel." };
  const body = String(form.body ?? "").trim();
  if (!form.templateKey && !body) return { error: "Write a message or choose a template." };
  if (channels.email && !form.templateKey && !String(form.subject ?? "").trim()) return { error: "Emails need a subject." };
  if (channels.sms && !form.templateKey && smsInfo(body).over) return { error: `Keep SMS to ${SMS_MAX} characters.` };
  const out = { target: { segment }, channels, lang: form.lang === "sw" ? "sw" : "en", variables: form.variables ?? {}, preview };
  if (form.templateKey) out.templateKey = form.templateKey;
  else { out.body = body; if (String(form.subject ?? "").trim()) out.subject = form.subject.trim(); }
  if (form.transactional !== undefined && form.transactional !== null) out.transactional = !!form.transactional;
  if (form.scheduledAt) {
    const when = new Date(form.scheduledAt);
    if (Number.isNaN(when.getTime())) return { error: "That send time is not valid." };
    out.scheduledAt = when.toISOString();
  }
  if (idempotencyKey) out.idempotencyKey = idempotencyKey;
  return { payload: out };
}

/** Two payloads that would send the same thing (preview flag and key ignored): a send needs a matching preview first. */
export const samePayload = (a, b) => {
  if (!a || !b) return false;
  const strip = ({ preview, idempotencyKey, ...rest }) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
};

export const BROADCAST_ERRORS = {
  too_many_recipients: "That segment has more than 500 businesses. Pick a smaller group.",
  no_recipients: "No business matches that group right now.",
  unknown_segment: "That group is not recognised.",
  unknown_template: "That template no longer exists.",
  template_channel_mismatch: "That template belongs to a different channel.",
  missing_variables: "The message uses details that were not filled in.",
  sms_too_long: "The SMS is longer than four messages.",
  nothing_to_send: "Nobody in that group has the contact details for the channels you chose.",
  bad_request: "Check the form and try again.",
};

// ---- Automation --------------------------------------------------------------------------------------------------

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
export const JOB_INFO = {
  "dispatch-messages": { label: "Send queued messages", every: "Every minute", what: "Sends queued SMS and email, retries failures and holds promotions back during quiet hours." },
  "daily-lifecycle": { label: "Daily reminders and expiry", every: "07:00 Nairobi time", what: "Queues renewal reminders, moves listings into grace and expiry, and sends the notices." },
};

export function minutesAgo(iso, now = Date.now()) {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / MIN));
}

export function ago(iso, now = Date.now()) {
  const m = minutesAgo(iso, now);
  if (m === null) return "never";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} days ago`;
}

/**
 * Is automation actually running? Turns the database's status into a level and a list of plain problems, so
 * "the jobs are silently off" becomes a red banner with the reason and the fix.
 */
export function automationHealth(status, now = Date.now()) {
  if (!status) return { level: "checking", problems: [] };
  const problems = [];
  const add = (level, job, text, fix = "") => problems.push({ level, job, text, fix });

  if (!status.cron_installed) {
    add("down", null, "The scheduler (pg_cron) is not installed, so no job can run. Reminders, retries and queued messages are all stopped.", "Enable pg_cron and pg_net, then run supabase/cron/schedule.sql once. docs/cron-runbook.md has the steps.");
  } else {
    for (const name of status.expected ?? []) {
      const job = (status.jobs ?? []).find((j) => j.name === name);
      const label = JOB_INFO[name]?.label ?? name;
      if (!job) { add("down", name, `"${label}" is not scheduled.`, "Run supabase/cron/schedule.sql in the SQL editor."); continue; }
      if (!job.active) add("down", name, `"${label}" is paused.`, "Resume it below.");
      if (job.last_run?.status === "failed") add("degraded", name, `The last run of "${label}" failed${job.last_run.message ? `: ${job.last_run.message}` : "."}`, "Check the CRON_SECRET and project_url secrets match, then run it once.");
      if (name === "daily-lifecycle" && job.active) {
        if (!job.last_run) add("degraded", name, `"${label}" has not run yet.`, "It first runs at 07:00 Nairobi time. Use Run now to check it works.");
        else if (minutesAgo(job.last_run.started_at, now) > 26 * 60) add("degraded", name, `"${label}" has not run for over a day.`, "Run it now and check the schedule is active.");
      }
    }
  }

  const waiting = minutesAgo(status.queue?.oldest_due_at, now);
  if (status.queue?.due_now > 0 && waiting !== null && waiting >= 5) {
    add("down", "dispatch-messages", `${status.queue.due_now} ${status.queue.due_now === 1 ? "message has" : "messages have"} been waiting to send for ${waiting >= 120 ? `${Math.floor(waiting / 60)} hours` : `${waiting} minutes`}. Sending is not keeping up or has stopped.`, "Run it now; if messages stay queued, check the SMS and email provider settings.");
  }
  if (status.queue?.failed_7d > 0) add("degraded", null, `${status.queue.failed_7d} ${status.queue.failed_7d === 1 ? "message" : "messages"} failed in the last 7 days.`, "Open the message log and retry them.");

  const level = problems.some((p) => p.level === "down") ? "down" : problems.length ? "degraded" : "healthy";
  // A problem about a job the status already reported as down should not also be listed as a lesser one.
  problems.sort((a, b) => (a.level === b.level ? 0 : a.level === "down" ? -1 : 1));
  return { level, problems };
}

export const HEALTH_LABEL = { healthy: "Running normally", degraded: "Needs attention", down: "Not running", checking: "Checking" };

export const AUTOMATION_ERRORS = {
  cron_not_installed: "The scheduler is not installed on this project.",
  job_not_scheduled: "That job is not scheduled. Run supabase/cron/schedule.sql first.",
  unknown_job: "That is not one of this app's jobs.",
  automation_not_configured: "Run now needs the project_url and cron_secret secrets in Vault. See docs/cron-runbook.md.",
  not_failed: "That message is not in a failed state.",
  invalid_key: "Template keys use lower-case letters, numbers, dots, dashes and underscores (2 to 60 characters).",
  invalid_channel: "Choose SMS, email or in-app.",
  sms_too_long: "SMS templates can be at most 612 characters.",
  subject_required: "Email templates need a subject.",
  channel_locked: "A template's channel cannot be changed after it is created. Create a new template instead.",
};
