import { closingInfo, exceptionFor, formatClock, intervalsOn, nairobiNow } from "./utils.js";
import { addDays } from "./seller/exceptions.js";

const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const cleanNote = (note) => (typeof note === "string" && note.trim() ? note.trim() : null);

function reasonFor(hours, exceptions, now, opensAt) {
  const exception = exceptionFor(exceptions, now.date);
  if (exception?.kind === "closed") return { kind: "closed_day", note: cleanNote(exception.note) };
  if (exception?.kind === "special") return { kind: "special_hours", note: cleanNote(exception.note) };
  if (!opensAt) return { kind: "no_schedule", note: null };
  if (!intervalsOn(hours, exceptions, now.date).length) return { kind: "day_off", note: null, day: now.day };
  return { kind: "outside_hours", note: null };
}

export function businessStatus(hours, exceptions, date) {
  const weekly = hours && typeof hours === "object" ? hours : {};
  const list = Array.isArray(exceptions) ? exceptions : [];
  const now = nairobiNow(date);
  const { closesAt, opensAt } = closingInfo(weekly, list, date);
  const isOpen = closesAt !== null;
  const special = exceptionFor(list, now.date)?.kind === "special";
  const reason = isOpen ? (special ? reasonFor(weekly, list, now, opensAt) : null) : reasonFor(weekly, list, now, opensAt);
  return { isOpen, closesAt, opensAt, reason };
}

const reasonText = (reason) => {
  if (!reason) return null;
  const withNote = (label) => (reason.note ? `${label}: ${reason.note}` : label);
  if (reason.kind === "closed_day") return withNote("Closed today");
  if (reason.kind === "special_hours") return withNote("Special hours today");
  if (reason.kind === "day_off") return `Closed on ${DAY_NAMES[reason.day]}s`;
  if (reason.kind === "no_schedule") return "Opening hours not set";
  return null;
};

const reopenText = (opensAt, today) => {
  if (!opensAt) return null;
  const when = opensAt.date === today ? "today" : opensAt.date === addDays(today, 1) ? "tomorrow" : DAY_NAMES[opensAt.day].slice(0, 3);
  return `Reopens ${when} at ${formatClock(opensAt.time)}`;
};

export function describeStatus(status, date) {
  const today = nairobiNow(date).date;
  const reasonLine = reasonText(status.reason);
  if (status.isOpen) {
    return { headline: "Open now", closes: status.closesAt ? `Closes ${formatClock(status.closesAt)}` : null, reasonText: reasonLine, reopens: null, line: reasonLine };
  }
  const reopens = reopenText(status.opensAt, today);
  return { headline: "Closed", closes: null, reasonText: reasonLine, reopens, line: [reasonLine, reopens].filter(Boolean).join(" · ") || null };
}

export const statusOf = (hours, exceptions, date) => {
  const status = businessStatus(hours, exceptions, date);
  return { ...status, ...describeStatus(status, date) };
};
