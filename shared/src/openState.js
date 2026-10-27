import { DAYS, closingInfo, exceptionFor, intervalsOn, isOpenOn, nairobiNow } from "./utils.js";
import { zonedTimeToUtc } from "./time.js";
import { nextShopDateOf, safeShopZone, shopTimeText } from "./shopTime.js";
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

export function businessStatus(hours, exceptions, date, timeZone) {
  const weekly = hours && typeof hours === "object" ? hours : {};
  const list = Array.isArray(exceptions) ? exceptions : [];
  const now = nairobiNow(date, timeZone);
  const { closesAt, opensAt } = closingInfo(weekly, list, date, timeZone);
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

// Times are always written with the shop's zone ("6:00 PM EAT"). When a viewerZone is passed (browsers pass
// getUserTimeZone(); servers pass nothing) and the viewer's clock reads differently, the viewer's own time follows
// ("6:00 PM EAT · 7:00 PM your time"), with the weekday when the viewer's day is not the shop's day.
const reopenText = (opensAt, today, opts) => {
  if (!opensAt) return null;
  const when = opensAt.date === today ? "today" : opensAt.date === addDays(today, 1) ? "tomorrow" : DAY_NAMES[opensAt.day].slice(0, 3);
  return `Reopens ${when} at ${shopTimeText(opensAt.date, opensAt.time, opts)}`;
};

/**
 * Words for a status. timeZone is the SHOP's zone (default Nairobi); viewerZone is the viewer's, opt in.
 * closes: "Closes 6:00 PM EAT" or "Closes 6:00 PM EAT · 7:00 PM your time". reopens: "Reopens tomorrow at 8:00 AM EAT".
 */
export function describeStatus(status, date, timeZone, viewerZone) {
  const shopZone = safeShopZone(timeZone);
  const now = nairobiNow(date, shopZone);
  const opts = { shopZone, viewerZone };
  const reasonLine = reasonText(status.reason);
  if (status.isOpen) {
    const closesDate = status.closesAt ? nextShopDateOf(status.closesAt, date ?? new Date(), shopZone) : null;
    const closes = status.closesAt && closesDate ? `Closes ${shopTimeText(closesDate, status.closesAt, opts)}` : null;
    return { headline: "Open now", closes, reasonText: reasonLine, reopens: null, line: reasonLine };
  }
  const reopens = reopenText(status.opensAt, now.date, opts);
  return { headline: "Closed", closes: null, reasonText: reasonLine, reopens, line: [reasonLine, reopens].filter(Boolean).join(" · ") || null };
}

export const statusOf = (hours, exceptions, date, timeZone, viewerZone) => {
  const status = businessStatus(hours, exceptions, date, timeZone);
  return { ...status, ...describeStatus(status, date, timeZone, viewerZone) };
};

const LATE_HOUR = 21;

const minutesOf = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const slotOf = (hours, day) => {
  const slot = hours?.[day];
  return Array.isArray(slot) && slot.length === 2 && typeof slot[0] === "string" && typeof slot[1] === "string" ? slot : null;
};

const spansDay = (slot) => slot !== null && (slot[0] === slot[1] || minutesOf(slot[1]) - minutesOf(slot[0]) >= 1439);

export const isOpenAllDay = (hours) => DAYS.every((day) => spansDay(slotOf(hours, day)));

export const opensOn = (hours, day) => slotOf(hours, day) !== null;

export function isOpenLate(hours, exceptions, date = new Date(), timeZone) {
  const zone = safeShopZone(timeZone);
  const { date: today } = nairobiNow(date, zone);
  const [year, month, day] = today.split("-").map(Number);
  // 21:00 on the shop's calendar date, as a real instant in the shop's zone (daylight saving included).
  return isOpenOn(hours, exceptions, zonedTimeToUtc({ year, month, day, hour: LATE_HOUR }, zone), zone);
}
