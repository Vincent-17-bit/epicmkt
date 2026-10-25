// Time handling for the whole project. Pure, dependency free, built on Intl and IANA time zone names.
//
// THE CONTRACT
//   1. The database stores every instant as timestamptz and every API sends it as an ISO 8601 string in UTC
//      ("2026-10-25T04:51:00.000Z"). Nothing is converted to a local time before it leaves the server.
//   2. The frontend converts an instant to the viewer's time zone only when it draws it (formatInstant and friends).
//      The viewer's zone is the device zone, which follows daylight saving automatically because it is an IANA name
//      ("America/New_York"), never a fixed offset.
//   3. Some things are not instants. They are business calendar concepts that must read the same for everyone, so they
//      are anchored to BUSINESS_TIME_ZONE: the subscription day a listing is paid until, a shop's opening hours, a
//      shop's exception dates. Use businessDay / formatBusinessDay / the openState helpers for those.
//   4. A date with no time ("2026-10-25") is a calendar day, not an instant. It is never run through a zone.
//
// Never build times with getHours()/getDate()/new Date("YYYY-MM-DDTHH:mm") (device zone, differs per user) or with a
// hand-written "+03:00"/"+ 3 * 3600000" offset. shared/src/time.guard.test.js fails the build if one comes back.

/** Where the business operates. Opening hours, billing days and exception dates are read in this zone. */
export const BUSINESS_TIME_ZONE = "Africa/Nairobi";

/** Locale used for display when the caller does not pass one. */
export const DEFAULT_LOCALE = "en-GB";

const MS_SECOND = 1000;
const MS_MINUTE = 60_000;
const MS_DAY = 86_400_000;

// ---- Zones ---------------------------------------------------------------------------------------------------------

const formatterCache = new Map();

function cached(key, make) {
  let value = formatterCache.get(key);
  if (!value) {
    value = make();
    if (formatterCache.size > 500) formatterCache.clear();
    formatterCache.set(key, value);
  }
  return value;
}

/** True when the runtime knows this IANA zone name (or fixed offset zone such as "Etc/GMT+5"). */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    cached(`probe|${timeZone}`, () => new Intl.DateTimeFormat("en-US", { timeZone }));
    return true;
  } catch {
    return false;
  }
}

let userZoneOverride = null;

/**
 * Pin the viewer's zone (for a "my time zone" setting, or for tests). Pass null to go back to the device zone.
 * Throws on an unknown zone so a typo never silently becomes UTC.
 */
export function setUserTimeZone(timeZone) {
  if (timeZone === null || timeZone === undefined) {
    userZoneOverride = null;
    return;
  }
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone: ${timeZone}`);
  userZoneOverride = timeZone;
}

/** The viewer's IANA zone: the override if set, otherwise the device zone, otherwise "UTC". */
export function getUserTimeZone() {
  if (userZoneOverride) return userZoneOverride;
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(zone)) return zone;
  } catch {
    // fall through
  }
  return "UTC";
}

const zoneOrUser = (timeZone) => {
  if (timeZone === undefined || timeZone === null) return getUserTimeZone();
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone: ${timeZone}`);
  return timeZone;
};

// ---- Parsing instants ----------------------------------------------------------------------------------------------

const INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)$/;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** True only for a real calendar date. Date.parse would roll "2026-02-30" over to 2 March, so check the parts. */
function isRealDate(year, month, day) {
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Turn an API value into a Date, or null when it is not a real instant.
 * Accepts a Date, epoch milliseconds, or an ISO 8601 string that CARRIES ITS OFFSET: "…Z", "…+03:00", and the
 * Postgres spellings "2026-10-25 04:51:00+00" / "…+0300".
 * Rejects, on purpose, strings with no offset ("2026-10-25T04:51:00" means a different moment in every zone) and bare
 * dates ("2026-10-25" is a calendar day, not an instant).
 */
export function parseInstant(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? new Date(value) : null;
  if (typeof value !== "string") return null;
  const m = INSTANT_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0", frac = "", off] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  let offsetMinutes = 0;
  if (off.toUpperCase() !== "Z") {
    const digits = off.slice(1).replace(":", "");
    const oh = Number(digits.slice(0, 2));
    const om = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (oh > 23 || om > 59) return null;
    offsetMinutes = (off[0] === "-" ? -1 : 1) * (oh * 60 + om);
  }
  const millis = Number((frac + "000").slice(0, 3));
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMinutes * MS_MINUTE;
  return Number.isFinite(utc) ? new Date(utc) : null;
}

/** The canonical wire format: ISO 8601 in UTC with milliseconds, "2026-10-25T04:51:00.000Z". Null if not an instant. */
export function toUtcIso(value) {
  const date = parseInstant(value);
  return date ? date.toISOString() : null;
}

/** Now, as the canonical UTC ISO string. */
export const nowUtcIso = () => new Date().toISOString();

// ---- Reading a zone's wall clock -----------------------------------------------------------------------------------

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partsFormatter(timeZone) {
  // en-US + gregory + latn pins the digits and calendar, so a viewer whose locale is Thai (Buddhist year) or Arabic
  // (Arabic-Indic digits) still gets plain numbers here. Display formatters below honour the viewer's locale.
  return cached(`parts|${timeZone}`, () => new Intl.DateTimeFormat("en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short"
  }));
}

/** Milliseconds a zone is ahead of UTC at an instant (negative when behind). Includes daylight saving. */
function offsetMs(epochMs, timeZone) {
  const whole = Math.floor(epochMs / MS_SECOND) * MS_SECOND;
  const p = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(new Date(whole))) p[type] = value;
  const hour = Number(p.hour) % 24;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return asUtc - whole;
}

/** How many minutes a zone is ahead of UTC at this instant: 180 for Nairobi, -240 for New York in summer, 345 for Kathmandu. */
export function tzOffsetMinutes(value, timeZone) {
  const date = parseInstant(value);
  if (!date) return null;
  return offsetMs(date.getTime(), zoneOrUser(timeZone)) / MS_MINUTE;
}

/**
 * The wall clock in a zone at an instant: { year, month (1-12), day, hour, minute, second, weekday (0=Sunday),
 * offsetMinutes }. Null when the value is not an instant.
 */
export function zonedParts(value, timeZone) {
  const date = parseInstant(value);
  if (!date) return null;
  const zone = zoneOrUser(timeZone);
  const whole = Math.floor(date.getTime() / MS_SECOND) * MS_SECOND;
  const p = {};
  for (const { type, value: v } of partsFormatter(zone).formatToParts(new Date(whole))) p[type] = v;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  const second = Number(p.second);
  return {
    year, month, day, hour, minute, second,
    weekday: WEEKDAY_INDEX[p.weekday],
    offsetMinutes: (Date.UTC(year, month - 1, day, hour, minute, second) - whole) / MS_MINUTE
  };
}

const pad2 = (n) => String(n).padStart(2, "0");
const pad4 = (n) => String(n).padStart(4, "0");
const dayString = (y, m, d) => `${pad4(y)}-${pad2(m)}-${pad2(d)}`;

/** The calendar day ("YYYY-MM-DD") an instant falls on in a zone. */
export function zonedDay(value, timeZone) {
  const p = zonedParts(value, timeZone);
  return p ? dayString(p.year, p.month, p.day) : null;
}

/** The calendar day an instant falls on in the business zone. */
export const businessDay = (value) => zonedDay(value, BUSINESS_TIME_ZONE);

/** Minutes since midnight on the wall clock in a zone (0 to 1439). */
export function zonedMinutes(value, timeZone) {
  const p = zonedParts(value, timeZone);
  return p ? p.hour * 60 + p.minute : null;
}

// ---- Calendar days (no zone involved) ------------------------------------------------------------------------------

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real "YYYY-MM-DD" calendar day. */
export function isCalendarDay(value) {
  if (typeof value !== "string") return false;
  const m = DAY_RE.exec(value);
  return Boolean(m) && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function dayParts(day) {
  const m = typeof day === "string" ? DAY_RE.exec(day) : null;
  if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) throw new RangeError(`Invalid calendar day: ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Add whole calendar days. Pure date arithmetic, so a daylight saving day (23 or 25 hours) still counts as one day. */
export function addCalendarDays(day, count) {
  if (!Number.isInteger(count)) throw new RangeError("count must be an integer");
  const [y, m, d] = dayParts(day);
  return new Date(Date.UTC(y, m - 1, d + count)).toISOString().slice(0, 10);
}

/** Whole calendar days from a to b (b minus a). */
export function calendarDaysBetween(a, b) {
  const [ay, am, ad] = dayParts(a);
  const [by, bm, bd] = dayParts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_DAY);
}

/** 0 = Sunday ... 6 = Saturday, for a calendar day. */
export function calendarWeekday(day) {
  const [y, m, d] = dayParts(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---- Wall clock to instant (the daylight saving part) ----------------------------------------------------------------

/**
 * The UTC instant for a wall clock time in a zone.
 *
 * Daylight saving makes some wall clock times not exist and some exist twice:
 *   - Spring forward (a gap): New York 2026-03-08 02:30 never happens. By default we move forward by the length of
 *     the gap, to 03:30 EDT, which is what "2:30" meant to the person typing it.  gap: "backward" moves to 01:30 EST,
 *     gap: "throw" raises a RangeError so a form can ask the user to pick again.
 *   - Fall back (an overlap): New York 2026-11-01 01:30 happens twice. By default we take the FIRST one (01:30 EDT).
 *     overlap: "later" takes the second (01:30 EST), overlap: "throw" raises.
 * A zone that skips a whole day (Pacific/Apia, 30 Dec 2011) is handled by the same gap rule.
 *
 * fields: { year, month (1-12), day, hour = 0, minute = 0, second = 0, millisecond = 0 }. Returns a Date.
 */
export function zonedTimeToUtc(fields, timeZone, { gap = "forward", overlap = "earlier" } = {}) {
  const zone = zoneOrUser(timeZone);
  const { year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 } = fields ?? {};
  const whole = [year, month, day, hour, minute, second, millisecond].every(Number.isInteger);
  if (!whole || !isRealDate(year, month, day) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 || millisecond < 0 || millisecond > 999) {
    throw new RangeError("Invalid local date and time");
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  // The real offset is one of the two offsets in force a day either side of the wall clock reading.
  const before = offsetMs(wall - MS_DAY, zone);
  const after = offsetMs(wall + MS_DAY, zone);
  const valid = [];
  for (const offset of new Set([before, after])) {
    const candidate = wall - offset;
    if (offsetMs(candidate, zone) === offset) valid.push(candidate);
  }
  if (valid.length === 1) return new Date(valid[0]);
  if (valid.length > 1) {
    if (overlap === "throw") throw new RangeError("Ambiguous local time (it happens twice)");
    return new Date(overlap === "later" ? Math.max(...valid) : Math.min(...valid));
  }
  if (gap === "throw") throw new RangeError("Nonexistent local time (skipped by daylight saving)");
  return new Date(gap === "backward" ? wall - after : wall - before);
}

/** The instant a calendar day begins in a zone, as UTC ISO. A daylight saving day is 23 or 25 hours long, and this is exact. */
export function startOfDayUtcIso(day, timeZone) {
  const [year, month, d] = dayParts(day);
  return zonedTimeToUtc({ year, month, day: d }, timeZone).toISOString();
}

/** The half open range [start, end) of a calendar day in a zone, as UTC ISO. Use it for "everything that happened on this day". */
export function dayRangeUtcIso(day, timeZone) {
  return { start: startOfDayUtcIso(day, timeZone), end: startOfDayUtcIso(addCalendarDays(day, 1), timeZone) };
}

const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Value of an <input type="datetime-local"> ("2026-03-08T14:30") read in a zone, as UTC ISO. This is the one place a
 * zone-less string is allowed in, because the input's meaning is "this wall clock in the viewer's zone".
 * Empty or malformed input gives "".
 */
export function localInputToUtcIso(value, timeZone, rules) {
  const m = typeof value === "string" ? LOCAL_INPUT_RE.exec(value.trim()) : null;
  if (!m) return "";
  try {
    return zonedTimeToUtc({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]), second: Number(m[6] ?? 0) }, timeZone, rules).toISOString();
  } catch {
    return "";
  }
}

/** An instant as the value for <input type="datetime-local"> in a zone: "2026-03-08T14:30". "" when not an instant. */
export function utcToLocalInput(value, timeZone) {
  const p = zonedParts(value, timeZone);
  return p ? `${dayString(p.year, p.month, p.day)}T${pad2(p.hour)}:${pad2(p.minute)}` : "";
}

// ---- Display ---------------------------------------------------------------------------------------------------------

function displayFormatter(locale, options) {
  return cached(`fmt|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options));
}

/**
 * Draw an instant in a zone. This is the only conversion from UTC to a local time, and it happens at display time.
 * options are Intl.DateTimeFormat options plus { timeZone, locale }. The zone defaults to the viewer's.
 * Returns "" for anything that is not an instant, so a missing value renders as nothing instead of "Invalid Date".
 */
export function formatInstant(value, { timeZone, locale = DEFAULT_LOCALE, ...intl } = {}) {
  const date = parseInstant(value);
  if (!date) return "";
  return displayFormatter(locale, { ...intl, timeZone: zoneOrUser(timeZone) }).format(date);
}

/** "25 Oct 2026" in the viewer's zone. */
export const formatDate = (value, options = {}) => formatInstant(value, { day: "numeric", month: "short", year: "numeric", ...options });

/** "25 Oct, 7:51 pm" in the viewer's zone. Add { year: "numeric" } or { timeZoneName: "short" } to taste. */
export const formatDateTime = (value, options = {}) =>
  formatInstant(value, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, ...options });

/** "7:51 pm" in the viewer's zone. */
export const formatTime = (value, options = {}) => formatInstant(value, { hour: "numeric", minute: "2-digit", hour12: true, ...options });

/**
 * The short name of a zone at an instant, to print next to a time. Intl names zones per locale, and en-KE gives
 * Kenyans "EAT" and everyone else the unambiguous "GMT-4" / "GMT+5:30" form, which is what we want.
 */
export function zoneLabel(value, timeZone, locale = "en-KE") {
  const date = parseInstant(value);
  if (!date) return "";
  const parts = displayFormatter(locale, { timeZone: zoneOrUser(timeZone), timeZoneName: "short" }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** A calendar day ("2026-10-25") drawn as text. No zone is applied, so it reads the same in every zone. */
export function formatCalendarDay(day, { locale = DEFAULT_LOCALE, ...intl } = {}) {
  if (!isCalendarDay(day)) return "";
  const [y, m, d] = dayParts(day);
  // Noon UTC, drawn in UTC: no zone can push it onto a neighbouring day.
  return displayFormatter(locale, { day: "numeric", month: "short", year: "numeric", ...intl, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * A business calendar day as text. Takes either a calendar day ("2026-10-25") or an instant that marks one
 * (businesses.paid_until is the instant Nairobi midnight begins). Both read the same in every viewer's zone.
 */
export function formatBusinessDay(value, { locale = DEFAULT_LOCALE, ...intl } = {}) {
  if (isCalendarDay(value)) return formatCalendarDay(value, { locale, ...intl });
  const day = businessDay(value);
  return day ? formatCalendarDay(day, { locale, ...intl }) : "";
}

/**
 * Whole calendar days from `now` to an instant, counted on the viewer's calendar: 0 = today, 1 = tomorrow, -1 = yesterday.
 * Counts days, not 24 hour blocks, so it stays right across a daylight saving change.
 */
export function daysFromToday(value, now = new Date(), timeZone) {
  const target = zonedDay(value, timeZone);
  const today = zonedDay(now, timeZone);
  return target && today ? calendarDaysBetween(today, target) : null;
}
