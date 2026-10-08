import { TIMEZONE_OFFSET_HOURS } from "./constants.js";
import { DAYS } from "./utils.js";

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const OFFSET = TIMEZONE_OFFSET_HOURS * HOUR;
const HORIZON_DAYS = 35;

export const CLOSING_SOON_MINUTES = 60;
export const OVERRIDE_MAX_MS = DAY;
export const MESSAGE_MAX_LENGTH = 80;

export const isOpenState = (state) => state === "open" || state === "closing_soon";

const TIME = /^(\d{2}):(\d{2})$/;

const toMinutes = (value) => {
  const match = TIME.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
};

const toLocal = (ms) => ms + OFFSET;
const toIso = (local) => new Date(local - OFFSET).toISOString();
const dayNumber = (local) => Math.floor(local / DAY);
const weekdayOf = (n) => DAYS[(((n + 4) % 7) + 7) % 7];
const dateKeyOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);

const instant = (value) => {
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export function nairobiNow(date = new Date()) {
  const local = toLocal(instant(date));
  const n = dayNumber(local);
  return { day: weekdayOf(n), minutes: Math.floor((local - n * DAY) / MINUTE) };
}

export function todayHours(hours, date) {
  return hours[nairobiNow(date).day] ?? null;
}

export function intervalsOf(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (typeof value[0] === "string") return value.length === 2 ? [{ start: value[0], end: value[1] }] : [];
  return value.filter((item) => item && typeof item === "object" && toMinutes(item.start) !== null && toMinutes(item.end) !== null);
}

const spanOf = (dayStart, item) => {
  const start = toMinutes(item.start);
  const end = toMinutes(item.end);
  if (start === null || end === null || start >= 1440) return null;
  return [dayStart + start * MINUTE, dayStart + (end <= start ? end + 1440 : end) * MINUTE];
};

const merge = (spans) => {
  const sorted = spans.map((s) => [s[0], s[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push(span);
  }
  return out;
};

const subtract = (spans, from, to) =>
  spans.flatMap(([a, b]) => {
    if (b <= from || a >= to) return [[a, b]];
    const parts = [];
    if (a < from) parts.push([a, from]);
    if (b > to) parts.push([to, b]);
    return parts;
  });

const contactLike = (text) => /(https?:|www\.|:\/\/|\b[a-z0-9-]+\.(?:com|net|org|co|ke|io|me|app|ly|link|info|biz|shop|store|site|online|xyz)\b|\S+@\S+\.\S+)/i.test(text);
const phoneLike = (text) => /\d{7,}/.test(text.replace(/[\s\-.()]/g, ""));

export function validateOverride(override) {
  const errors = [];
  if (!override || typeof override !== "object") return { ok: false, errors: [{ field: "override", code: "missing" }] };
  if (override.type !== "closed" && override.type !== "open") errors.push({ field: "type", code: "type" });
  const start = instant(override.startsAt);
  const end = instant(override.endsAt);
  if (start === null || end === null || end <= start) errors.push({ field: "endsAt", code: "range" });
  else if (end - start > OVERRIDE_MAX_MS) errors.push({ field: "endsAt", code: "too_long" });
  const message = override.message;
  if (message !== undefined && message !== null && message !== "") {
    if (typeof message !== "string") errors.push({ field: "message", code: "message_type" });
    else {
      if (message.length > MESSAGE_MAX_LENGTH) errors.push({ field: "message", code: "message_length" });
      if (contactLike(message)) errors.push({ field: "message", code: "message_link" });
      if (phoneLike(message)) errors.push({ field: "message", code: "message_phone" });
    }
  }
  return { ok: errors.length === 0, errors };
}

const safeMessage = (message) => {
  if (typeof message !== "string" || message === "") return undefined;
  return message.length <= MESSAGE_MAX_LENGTH && !contactLike(message) && !phoneLike(message) ? message : undefined;
};

const activeOverrideOf = (override) => {
  if (!override) return null;
  const start = instant(override.startsAt);
  const end = instant(override.endsAt);
  const typeOk = override.type === "closed" || override.type === "open";
  if (!typeOk || start === null || end === null || end <= start || end - start > OVERRIDE_MAX_MS) return null;
  return { type: override.type, from: toLocal(start), to: toLocal(end), reason: override.reason, message: safeMessage(override.message) };
};

const dayItems = (n, weekly, exceptions) => {
  const key = dateKeyOf(n);
  for (let i = exceptions.length - 1; i >= 0; i -= 1) {
    const exception = exceptions[i];
    if (exception && exception.date === key) {
      if (exception.closed) return [];
      if (Array.isArray(exception.intervals)) return exception.intervals;
      break;
    }
  }
  return intervalsOf(weekly?.[weekdayOf(n)]);
};

const detail = (override) => {
  const out = {};
  if (override.reason) out.reason = override.reason;
  if (override.message) out.message = override.message;
  return out;
};

export function computeStatus(schedule, now) {
  const at = instant(now);
  if (at === null) throw new TypeError("computeStatus needs a valid now");
  const { hours, exceptions = [], override = null } = schedule ?? {};
  const local = toLocal(at);
  const today = dayNumber(local);
  const horizon = (today + HORIZON_DAYS + 1) * DAY;
  const list = Array.isArray(exceptions) ? exceptions : [];

  const spans = [];
  for (let n = today - 1; n <= today + HORIZON_DAYS; n += 1) {
    for (const item of dayItems(n, hours, list)) {
      const span = spanOf(n * DAY, item);
      if (span) spans.push(span);
    }
  }

  const base = merge(spans);
  const active = activeOverrideOf(override);
  let effective = base;
  if (active) effective = active.type === "open" ? merge([...base, [active.from, active.to]]) : merge(subtract(base, active.from, active.to));

  const current = effective.find(([a, b]) => a <= local && local < b);
  const overrideLive = active && active.from <= local && local < active.to;

  if (current) {
    const until = current[1] >= horizon ? null : current[1];
    const soon = until !== null && until - local <= CLOSING_SOON_MINUTES * MINUTE;
    const result = { state: soon ? "closing_soon" : "open", untilIso: until === null ? null : toIso(until), nextChangeIso: until === null ? null : toIso(until) };
    return overrideLive && active.type === "open" ? { ...result, ...detail(active) } : result;
  }

  const next = effective.find(([a]) => a > local);
  const opensAt = next ? next[0] : null;
  const suppressed = overrideLive && active.type === "closed" && base.some(([a, b]) => a < active.to && b > local);

  if (suppressed) {
    return { state: "closed_temporarily", untilIso: opensAt === null ? null : toIso(opensAt), nextChangeIso: toIso(active.to), ...detail(active) };
  }

  const state = opensAt !== null && dayNumber(opensAt) === today ? "opens_later" : "closed";
  return { state, untilIso: opensAt === null ? null : toIso(opensAt), nextChangeIso: opensAt === null ? null : toIso(opensAt) };
}

export const scheduleOf = (business) => ({
  hours: business?.hours,
  exceptions: business?.exceptions ?? [],
  override: business?.override ?? null
});

export const statusOf = (business, now) => computeStatus(scheduleOf(business), now);

const clockOf = (iso) => {
  const local = toLocal(Date.parse(iso));
  const n = dayNumber(local);
  const minutes = Math.floor((local - n * DAY) / MINUTE);
  return { day: weekdayOf(n), time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` };
};

export const legacyStatus = (status) =>
  isOpenState(status.state)
    ? { isOpen: true, closesAt: status.untilIso ? clockOf(status.untilIso).time : null, opensAt: null }
    : { isOpen: false, closesAt: null, opensAt: status.untilIso ? clockOf(status.untilIso) : null };

export function isOpenNow(hours, date = new Date()) {
  return isOpenState(computeStatus({ hours }, date).state);
}

export function closingInfo(hours, date = new Date()) {
  const { closesAt, opensAt } = legacyStatus(computeStatus({ hours }, date));
  return { closesAt, opensAt };
}
