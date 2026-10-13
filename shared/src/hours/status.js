import { MS_MIN, MS_HOUR, MS_DAY, WEEK, dateKeyOf, dowOf, midnightOf, addDays, parseDateKey, formatWhen, formatMinutesLong, formatClockMs } from "./time.js";
import { normalizeHours, normalizeDay, normalizeExceptions, spansOf, mergeSpans } from "./schedule.js";
import { validateClosureMessage, cleanText } from "./message.js";

export const HORIZON_DAYS = 9;
export const CLOSING_SOON_MIN = 30;
export const MAX_OVERRIDE_MS = MS_DAY;
export const MAX_PARTIAL_MS = 7 * MS_DAY;
export const CLOSURE_REASONS = ["lunch", "restock", "power", "emergency", "other"];
export const REASON_LABELS = { lunch: "Lunch", restock: "Restocking", power: "Power outage", emergency: "Emergency", other: "Other" };
export const SCOPES = ["delivery", "walkin", "appointments", "section"];
export const SCOPE_LABELS = { delivery: "Delivery", walkin: "Walk-ins", appointments: "Appointments", section: "Section" };
export const STATES = { OPEN: "open", CLOSING_SOON: "closing_soon", CLOSED: "closed", TEMP_CLOSED: "closed_temporarily", OPENS_LATER: "opens_later" };
export const STATE_LABELS = { open: "Open", closing_soon: "Closing soon", closed: "Closed", closed_temporarily: "Closed temporarily", opens_later: "Opens later" };

const toMs = (v) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v));
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const msOf = (v) => {
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
};

function scheduleSegments(business, fromMs, genEnd) {
  const hours = normalizeHours(business?.hours);
  const exceptions = new Map(normalizeExceptions(business?.exceptions).map((e) => [e.date, e]));
  const out = [];
  for (let m = midnightOf(fromMs) - MS_DAY; m < genEnd; m += MS_DAY) {
    const key = dateKeyOf(m);
    const day = exceptions.get(key) ?? hours[dowOf(m)];
    const nextClosedException = exceptions.get(addDays(key, 1))?.closed === true;
    for (const [s, e] of spansOf(day)) {
      const start = m + s * MS_MIN;
      let end = m + e * MS_MIN;
      if (e > 1440 && nextClosedException) end = m + MS_DAY;
      end = Math.min(end, genEnd);
      if (end > start) out.push([start, end]);
    }
  }
  return mergeSpans(out);
}

const subtract = (segments, a, b) => {
  const out = [];
  for (const [s, e] of segments) {
    if (e <= a || s >= b) out.push([s, e]);
    else {
      if (s < a) out.push([s, a]);
      if (e > b) out.push([b, e]);
    }
  }
  return out;
};

export function activeOverride(business, nowMs) {
  const o = business?.override;
  if (!o || (o.type !== "close" && o.type !== "open")) return null;
  const until = msOf(o.until);
  const since = msOf(o.since) ?? nowMs;
  if (until == null || until <= nowMs || since > nowMs + MS_MIN) return null;
  return { type: o.type, since: iso(since), until: iso(until), reason: o.reason ?? null, message: cleanText(o.message) };
}

export function activePartials(business, nowMs) {
  const list = Array.isArray(business?.partial_closures) ? business.partial_closures : [];
  return list
    .filter((p) => SCOPES.includes(p?.scope) && msOf(p.until) != null && msOf(p.until) > nowMs)
    .map((p) => ({ scope: p.scope, section: p.section ?? null, since: p.since ?? null, until: p.until, message: cleanText(p.message) }));
}

export function computeStatus(business, now = Date.now(), options = {}) {
  const nowMs = toMs(now);
  const genEnd = midnightOf(nowMs) + HORIZON_DAYS * MS_DAY;
  const base = scheduleSegments(business, nowMs, genEnd);
  const override = options.ignoreOverride ? null : activeOverride(business, nowMs);
  const partials = activePartials(business, nowMs);

  let segments = base;
  if (override) {
    const a = Math.min(Math.max(msOf(override.since), nowMs - MS_DAY), nowMs);
    const b = msOf(override.until);
    segments = override.type === "close" ? subtract(base, a, b) : mergeSpans([...base, [a, b]]);
  }

  const current = segments.find(([s, e]) => s <= nowMs && nowMs < e) ?? null;
  const scheduleOpen = base.some(([s, e]) => s <= nowMs && nowMs < e);
  const nextStart = segments.find(([s]) => s > nowMs)?.[0] ?? null;

  let state;
  let nextChange = null;
  let detail;

  if (current) {
    const unbounded = current[1] >= genEnd;
    nextChange = unbounded ? null : current[1];
    const minsLeft = nextChange == null ? Infinity : Math.ceil((nextChange - nowMs) / MS_MIN);
    state = minsLeft <= CLOSING_SOON_MIN ? STATES.CLOSING_SOON : STATES.OPEN;
    if (nextChange == null) detail = "Open 24 hours";
    else if (minsLeft < 120) detail = `Closes in ${formatMinutesLong(minsLeft)}`;
    else detail = `Open until ${formatWhen(nextChange, nowMs)}`;
  } else {
    nextChange = nextStart;
    if (override?.type === "close") state = STATES.TEMP_CLOSED;
    else if (nextStart != null && dateKeyOf(nextStart) === dateKeyOf(nowMs)) state = STATES.OPENS_LATER;
    else state = STATES.CLOSED;
    detail = nextStart == null ? "No upcoming opening hours" : `Closed until ${formatWhen(nextStart, nowMs)}`;
    if (override?.type === "close" && msOf(override.until) != null) {
      const until = msOf(override.until);
      detail = nextStart != null && nextStart > until ? `Closed until ${formatWhen(nextStart, nowMs)}` : `Closed until ${formatWhen(until, nowMs)}`;
    }
  }

  const isOpen = state === STATES.OPEN || state === STATES.CLOSING_SOON;
  const overrideEnd = override ? msOf(override.until) : null;
  const closedByOverride = override?.type === "close" && !isOpen;
  const reopensAt = closedByOverride ? overrideEnd : null;

  return {
    state,
    label: STATE_LABELS[state],
    isOpen,
    scheduleOpen,
    detail,
    nextChangeIso: iso(nextChange),
    nextChangeMs: nextChange,
    source: closedByOverride || (override?.type === "open" && isOpen && !scheduleOpen) ? "override" : "schedule",
    override,
    overrideUntilIso: override ? override.until : null,
    reopensAtIso: iso(reopensAt),
    reason: override?.reason ?? null,
    message: override?.message ?? "",
    partials
  };
}

export function openingOnDate(business, dateKey, now = Date.now()) {
  const nowMs = toMs(now);
  const dayStart = parseDateKey(dateKey);
  if (Number.isNaN(dayStart)) return null;
  const genEnd = Math.max(midnightOf(nowMs) + HORIZON_DAYS * MS_DAY, dayStart + 2 * MS_DAY);
  const segs = scheduleSegments(business, Math.min(nowMs, dayStart), genEnd);
  const hit = segs.find(([s]) => s >= dayStart && s < dayStart + MS_DAY && s > nowMs);
  return hit ? hit[0] : null;
}

export function tomorrowOpening(business, now = Date.now()) {
  const nowMs = toMs(now);
  const at = openingOnDate(business, addDays(dateKeyOf(nowMs), 1), nowMs);
  if (at == null || at - nowMs > MS_DAY) return null;
  return at;
}

export const floorToMinute = (ms) => Math.floor(ms / MS_MIN) * MS_MIN;

export function customUntil(timeValue, now = Date.now()) {
  const nowMs = toMs(now);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeValue ?? "");
  if (!m) return null;
  const mid = midnightOf(nowMs);
  let at = mid + (Number(m[1]) * 60 + Number(m[2])) * MS_MIN;
  if (at <= nowMs) at += MS_DAY;
  return at;
}

export function validateOverride(input, now = Date.now(), { defaultSince } = {}) {
  const nowMs = toMs(now);
  const fail = (code, message) => ({ ok: false, code, message });
  if (!input || (input.type !== "close" && input.type !== "open")) return fail("type", "Choose whether to close or open.");
  const until = msOf(input.until);
  if (until == null) return fail("until", "Choose when this ends.");
  if (until <= nowMs) return fail("past", "That time has already passed.");
  const since = msOf(input.since) ?? defaultSince ?? nowMs;
  if (since > nowMs + MS_MIN || since < nowMs - MAX_OVERRIDE_MS) return fail("since", "This closure start time is not valid.");
  if (until - since > MAX_OVERRIDE_MS) return fail("too_long", "A temporary closure can last 24 hours in total at most.");
  if (input.reason != null && input.reason !== "" && !CLOSURE_REASONS.includes(input.reason)) return fail("reason", "Choose one of the listed reasons.");
  const msg = validateClosureMessage(input.message);
  if (!msg.ok) return fail(`message_${msg.code}`, msg.message);
  return { ok: true, code: null, message: "", value: { type: input.type, since: iso(since), until: iso(until), reason: input.reason || null, message: msg.text } };
}

export function extensionLimits(override, now = Date.now()) {
  const nowMs = toMs(now);
  const since = msOf(override?.since) ?? nowMs;
  const until = msOf(override?.until) ?? nowMs;
  const remainingMs = Math.max(0, since + MAX_OVERRIDE_MS - until);
  return { remainingMs, remainingMinutes: Math.floor(remainingMs / MS_MIN), canExtend: remainingMs >= 5 * MS_MIN };
}

export function extendOverride(override, addMs, now = Date.now()) {
  const nowMs = toMs(now);
  const base = Math.max(msOf(override?.until) ?? nowMs, nowMs);
  const next = { ...override, until: iso(base + addMs) };
  return validateOverride(next, nowMs);
}

export function validatePartial(input, now = Date.now()) {
  const nowMs = toMs(now);
  const fail = (code, message) => ({ ok: false, code, message });
  if (!input || !SCOPES.includes(input.scope)) return fail("scope", "Choose what to pause.");
  if (input.scope === "section" && !cleanText(input.section)) return fail("section", "Choose a section to pause.");
  const until = msOf(input.until);
  if (until == null) return fail("until", "Choose when this ends.");
  if (until <= nowMs) return fail("past", "That time has already passed.");
  if (until - nowMs > MAX_PARTIAL_MS) return fail("too_long", "You can pause for 7 days at most.");
  const msg = validateClosureMessage(input.message);
  if (!msg.ok) return fail(`message_${msg.code}`, msg.message);
  return {
    ok: true,
    code: null,
    message: "",
    value: { scope: input.scope, section: input.scope === "section" ? cleanText(input.section) : null, since: iso(nowMs), until: iso(until), message: msg.text }
  };
}

export const partialPresets = (now = Date.now()) => {
  const nowMs = toMs(now);
  const mid = midnightOf(nowMs);
  return [
    { key: "1h", label: "1 hour", until: floorToMinute(nowMs + MS_HOUR) },
    { key: "4h", label: "4 hours", until: floorToMinute(nowMs + 4 * MS_HOUR) },
    { key: "today", label: "End of today", until: mid + MS_DAY - MS_MIN },
    { key: "tomorrow", label: "Tomorrow", until: mid + 2 * MS_DAY - MS_MIN }
  ];
};

export const fillMessageTemplate = (template, untilMs, nowMs = Date.now()) =>
  cleanText(String(template ?? "").replace(/\{time\}/g, untilMs == null ? "" : formatWhen(untilMs, nowMs)));

export const overrideSummary = (override, nowMs = Date.now()) => {
  if (!override) return "";
  const until = msOf(override.until);
  const clock = until == null ? "" : formatWhen(until, nowMs);
  return override.type === "close" ? `Closed until ${clock}` : `Open until ${clock}`;
};

export const partialSummary = (partial, nowMs = Date.now()) => {
  const until = msOf(partial?.until);
  const clock = until == null ? "" : formatWhen(until, nowMs);
  const name = partial?.scope === "section" ? partial.section : SCOPE_LABELS[partial?.scope];
  return `${name} paused until ${clock}`;
};

export const closeInMinutes = (nextChangeMs, nowMs) => (nextChangeMs == null ? null : Math.max(0, Math.ceil((nextChangeMs - nowMs) / MS_MIN)));

