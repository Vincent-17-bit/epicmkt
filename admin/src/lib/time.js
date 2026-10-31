// Admin time display. Instants (a login, a payment, a message) are drawn in the VIEWER's time zone. Business days
// (the day a subscription is paid until, an analytics day bucket) are Nairobi calendar days and read the same for
// everyone. See shared/src/time.js for the rules.
import { BUSINESS_TIME_ZONE, addCalendarDays, businessDay, calendarDaysBetween, formatBusinessDay, formatCalendarDay, formatInstant, formatTime, isCalendarDay, formatDateTime as formatStamp } from "@epicmkt/shared";

export const businessZone = BUSINESS_TIME_ZONE;

/** Today as a Nairobi calendar day, "YYYY-MM-DD". */
export function todayEat(now = new Date()) {
  return businessDay(now);
}

export function addDays(iso, count) {
  return addCalendarDays(iso, count);
}

// Whole Nairobi calendar days from today to a paid-until day (or the instant that marks it). NaN when there is none.
export function daysLeft(paidUntil, now = new Date()) {
  const target = businessDay(paidUntil) ?? paidUntil;
  return isCalendarDay(target) ? calendarDaysBetween(todayEat(now), target) : NaN;
}

export function compactCountdown(days) {
  if (!Number.isFinite(days)) return "";
  if (days > 0) return `${days}d`;
  if (days === 0) return "Today";
  return `${-days}d over`;
}

// "just now", "5m ago", "3h ago", "2d ago", then the calendar date for anything older than two weeks.
export function timeAgo(value, now = new Date()) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((now.getTime() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(then);
}

// ---- Instants, in the viewer's zone -------------------------------------------------------------------------------------------

/** "25 Oct 2026" */
export const formatDate = (value) => formatInstant(value, { locale: "en-KE", day: "2-digit", month: "short", year: "numeric" });

/** "25 Oct, 07:51" (24 hour) */
export const formatDateTime = (value) => formatInstant(value, { locale: "en-KE", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** "25 Oct, 7:51 pm" */
export const stamp = (value) => formatStamp(value);

/** "25 Oct 2026, 7:51 pm" in Nairobi, whatever the viewer's zone. */
export const stampNairobi = (value) => formatStamp(value, { timeZone: businessZone, year: "numeric" });

/** "7:51 pm" */
export const stampClock = (value) => formatTime(value);

/** "25 Oct" */
export const stampDay = (value) => formatInstant(value, { day: "numeric", month: "short" });

/** "25 Oct 2026" */
export const stampDayYear = (value) => formatInstant(value, { day: "numeric", month: "short", year: "numeric" });

/** "Sun, 25 Oct 2026, 7:51 pm" */
export const stampLong = (value) => formatInstant(value, { locale: "en-KE", dateStyle: "medium", timeStyle: "short" });

// ---- Business days, the same for everyone ---------------------------------------------------------------------------------------

/** A business day or the instant that marks one (paid_until): "25 Oct 2026". */
export const formatBusinessDate = (value) => formatBusinessDay(value, { locale: "en-KE", day: "2-digit", month: "short", year: "numeric" });

/** "25 Oct" */
export const businessDayShort = (value) => formatBusinessDay(value, { locale: "en-GB", day: "numeric", month: "short", year: undefined });

/** A "YYYY-MM-DD" bucket from an analytics query: "25 Oct". */
export const calendarDayShort = (day) => formatCalendarDay(day, { locale: "en-GB", day: "numeric", month: "short", year: undefined });
