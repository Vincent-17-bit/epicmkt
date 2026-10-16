// Pure decision logic for the review panel and focus mode.
// Mirrors the contract of the admin-decide-application edge function (docs/ADMIN_SPEC.md, section 5).

export const ACTIONS = {
  approve: { label: "Approve", verb: "Approve application", tone: "success", key: "A" },
  request_changes: { label: "Request changes", verb: "Request changes", tone: "warning", key: "C" },
  reject: { label: "Reject", verb: "Reject application", tone: "danger", key: "R" },
  set_verification: { label: "Set verified", verb: "Set verification level", tone: "neutral", key: null },
  return_to_queue: { label: "Return to queue", verb: "Return to queue", tone: "neutral", key: null },
};

// Statuses each action may start from. Same table as FROM in the edge function.
export const ALLOWED_FROM = {
  request_changes: ["submitted", "under_review"],
  approve: ["submitted", "under_review"],
  reject: ["submitted", "under_review", "changes_requested"],
  set_verification: ["submitted", "under_review", "changes_requested", "approved"],
  return_to_queue: ["under_review"],
};

// Statuses that still need a decision. Focus mode queues these.
export const REVIEWABLE = ["submitted", "under_review"];

export const MESSAGE_CHANNELS = [
  { id: "sms", field: "phone", label: "SMS", missing: "No phone number on the application" },
  { id: "email", field: "email", label: "Email", missing: "No email on the application" },
  { id: "inApp", field: "businessId", label: "In-app", missing: "In-app messages start once the business is activated" },
];

export const canDo = (action, status) => (ALLOWED_FROM[action] ?? []).includes(status);

export const isReviewable = (app) => REVIEWABLE.includes(app.status);

export function defaultChannels(app) {
  return { sms: Boolean(app.phone), email: Boolean(app.email), inApp: false };
}

export function channelAvailable(app, channel) {
  const def = MESSAGE_CHANNELS.find((c) => c.id === channel);
  if (!def || !def.field) return true;
  return Boolean(app[def.field]);
}

const MAX_REASON = 500;
const MAX_NOTE = 1000;
const MAX_PRICE = 100000;

/**
 * Client-side mirror of the server rules, so a reviewer sees the problem before the round trip.
 * The server stays the authority; this only saves a failed call.
 */
export function validateDecision(app, draft) {
  const { action } = draft;
  const errors = {};
  const reason = (draft.reason ?? "").trim();
  const note = (draft.note ?? "").trim();

  if (!canDo(action, app.status)) {
    errors.action = `Can't ${ACTIONS[action]?.label.toLowerCase() ?? action} an application that is ${app.status.replace("_", " ")}.`;
  }
  if (reason.length > MAX_REASON) errors.reason = `Keep the reason under ${MAX_REASON} characters.`;
  if (note.length > MAX_NOTE) errors.note = `Keep the message under ${MAX_NOTE} characters.`;

  if (action === "reject" && !reason) errors.reason = "A reason is required to reject.";

  if (action === "request_changes") {
    const openFlags = (app.flags ?? []).filter((f) => f.status === "open").length;
    if (!note && openFlags === 0) errors.note = "Flag at least one issue or write what needs changing.";
  }

  if (action === "approve" && draft.priceOverride !== undefined && draft.priceOverride !== null && draft.priceOverride !== "") {
    const price = Number(draft.priceOverride);
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      errors.priceOverride = `Price must be a whole number between 0 and ${MAX_PRICE.toLocaleString("en-KE")}.`;
    } else if (!reason) {
      errors.reason = "Say why the price is being overridden.";
    }
  }

  if (action === "set_verification" && !draft.verificationLevel) {
    errors.verificationLevel = "Choose a verification level.";
  }

  const channels = draft.channels ?? {};
  for (const ch of MESSAGE_CHANNELS) {
    if (channels[ch.id] && !channelAvailable(app, ch.id)) errors.channels = ch.missing;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Builds the request body for admin-decide-application. */
export function buildRequest(app, draft, { preview = false } = {}) {
  const body = {
    applicationId: app.id,
    action: draft.action,
    channels: {
      sms: Boolean(draft.channels?.sms),
      email: Boolean(draft.channels?.email),
      inApp: Boolean(draft.channels?.inApp),
    },
    preview,
  };
  const reason = (draft.reason ?? "").trim();
  const note = (draft.note ?? "").trim();
  if (reason) body.reason = reason;
  if (note) body.note = note;
  if (draft.action === "set_verification") body.verificationLevel = draft.verificationLevel;
  if (draft.action === "approve") {
    if (draft.verificationLevel) body.verificationLevel = draft.verificationLevel;
    if (draft.priceOverride !== undefined && draft.priceOverride !== null && draft.priceOverride !== "") {
      body.priceOverride = Number(draft.priceOverride);
    }
  }
  return body;
}

const SERVER_ERRORS = {
  not_found: "That application no longer exists.",
  invalid_status: "Someone else already changed this application. Refresh the queue.",
  flag_or_note_required: "Flag at least one issue or write what needs changing.",
  reason_required: "A reason is required to reject.",
  override_reason_required: "Say why the price is being overridden.",
  verification_level_required: "Choose a verification level.",
  mpesa_not_configured: "The M-Pesa Till or Paybill isn't set in Settings yet, so payment instructions can't be sent.",
  rate_limited: "Too many decisions in a minute. Wait a moment and try again.",
  forbidden: "Your role can't make decisions. Owners and reviewers can.",
  unauthorized: "Your session expired. Sign in again.",
};

export function describeError(error) {
  const code = error?.code ?? error?.message;
  return SERVER_ERRORS[code] ?? "That didn't go through. Nothing was sent. Try again.";
}

/** What was queued, in words. */
export function describeOutcome(action, app, channelsQueued = []) {
  const name = app.businessName ?? app.reference;
  const sent = channelsQueued.length ? ` Messages queued: ${channelsQueued.join(", ")}.` : "";
  switch (action) {
    case "approve": return `${name} approved.${sent}`;
    case "reject": return `${name} rejected.${sent}`;
    case "request_changes": return `Changes requested from ${name}.${sent}`;
    case "set_verification": return `Verification updated for ${name}.${sent}`;
    case "return_to_queue": return `${name} returned to the queue.${sent}`;
    default: return `${name} updated.`;
  }
}

/**
 * Whether a decision that has already gone out can be reversed.
 * Approvals, rejections and change requests have already queued messages to the applicant, so they stay.
 * Verification is reversible by setting the previous level back.
 */
export function canUndoCommitted(entry) {
  return entry.action === "set_verification" && Boolean(entry.previousVerification);
}

// ---- Focus mode helpers ----

export function buildSession(applications) {
  const ids = applications.filter(isReviewable).map((a) => a.id);
  return { ids, total: ids.length };
}

/** Moves through the session list, skipping ids that are already decided. Clamps at the ends. */
export function step(ids, decided, currentId, direction) {
  const open = ids.filter((id) => !decided.has(id) || id === currentId);
  const at = open.indexOf(currentId);
  if (open.length === 0) return null;
  if (at === -1) return open[0];
  const next = Math.min(open.length - 1, Math.max(0, at + direction));
  return open[next];
}

/** First open id after `afterId`, wrapping once, or null when the inbox is clear. */
export function nextOpen(ids, decided, afterId) {
  const start = Math.max(0, ids.indexOf(afterId));
  for (let i = 1; i <= ids.length; i += 1) {
    const id = ids[(start + i) % ids.length];
    if (!decided.has(id)) return id;
  }
  return null;
}

export function progress(ids, decided, currentId) {
  const total = ids.length;
  const done = ids.filter((id) => decided.has(id)).length;
  const position = Math.min(total, Math.max(1, ids.indexOf(currentId) + 1));
  return {
    total,
    done,
    position,
    label: total === 0 ? "Nothing to review" : done === total ? `${total} of ${total}` : `${position} of ${total}`,
    ratio: total === 0 ? 1 : done / total,
    clear: total > 0 && done === total,
  };
}

export const SHORTCUTS = [
  { keys: ["J"], label: "Next application" },
  { keys: ["K"], label: "Previous application" },
  { keys: ["O"], label: "Open or close full details" },
  { keys: ["F"], label: "Flag an issue" },
  { keys: ["C"], label: "Request changes" },
  { keys: ["A"], label: "Approve" },
  { keys: ["R"], label: "Reject" },
  { keys: ["Z"], label: "Undo the last decision" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["Esc"], label: "Close a panel or leave focus mode" },
];

/** True when the key press came from somewhere the reviewer is typing. */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = (target.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(target.isContentEditable);
}

/** SMS billing segments: 160 characters for one, 153 each once it is split. */
export function smsSegments(text = "") {
  const n = text.length;
  if (n === 0) return 0;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

export const REJECT_REASONS = [
  "Documents don't match the business details",
  "Duplicate application",
  "We can't verify this business",
  "Category isn't supported yet",
];

export const UNDO_MS = 6000;

/** Actions that settle an application's review. Verification and return-to-queue leave it in the inbox. */
export const FINAL_ACTIONS = ["approve", "request_changes", "reject"];
export const isFinalAction = (action) => FINAL_ACTIONS.includes(action);
