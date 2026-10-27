// Shop wall-clock times shown to a viewer in another time zone.
//
// A shop's opening hours, exceptions ("closed 27 Oct", "special hours 13:00 to 14:00") and closing times are typed as
// wall-clock times IN THE SHOP'S ZONE. The status (open or closed) is always computed in that zone, so it is the same
// for every viewer. These helpers only change how a time is WRITTEN for a viewer: the shop's own time first, always
// labelled ("6:00 PM EAT"), then the same instant in the viewer's zone when that is a different clock reading
// ("7:00 PM your time"), with the weekday or date when the viewer's day is not the shop's day.
//
// Rules that keep it right in every zone:
//   - A shop time is turned into a real instant with zonedTimeToUtc (Intl and the IANA database), on the exact date it
//     applies to, and the viewer's reading is taken at that instant. So the viewer's daylight saving on that date is
//     used, not today's offset. A shop in Mumbai closing at 22:00 on 26 Oct is one fixed instant; a viewer in Sao Paulo,
//     Dubai, Auckland or Kathmandu each get the clock their own zone shows at that instant.
//   - Nothing here is a fixed offset. Nothing reads the device zone unless the caller passes getUserTimeZone().
//   - The viewer zone is OPT IN. Server code (statusLine strings built in the API) passes none and gets the shop time
//     with its label only, which is correct for everyone. Browsers pass getUserTimeZone().
//   - A shop wall time that does not exist (spring forward gap) moves forward by the gap, one that happens twice (fall
//     back) takes the first, exactly like zonedTimeToUtc. `adjusted` is true when that happened.

import {
  BUSINESS_TIME_ZONE,
  addCalendarDays,
  calendarDaysBetween,
  formatCalendarDay,
  isCalendarDay,
  isValidTimeZone,
  startOfDayUtcIso,
  zoneLabel,
  zonedParts,
  zonedTimeToUtc
} from "./time.js";

const TIME_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const pad2 = (n) => String(n).padStart(2, "0");
// Same text as formatClock in utils.js ("13:05" -> "1:05 PM"); kept here so the two modules do not import each other.
const formatClock = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? "PM" : "AM"}`;
};

/** A zone name that is safe to use: the given one if the runtime knows it, otherwise the business default. */
export const safeShopZone = (zone) => (isValidTimeZone(zone) ? zone : BUSINESS_TIME_ZONE);

/** The viewer's zone if valid, otherwise null (no conversion is shown). */
export const safeViewerZone = (zone) => (isValidTimeZone(zone) ? zone : null);

/**
 * Short zone name at an instant: "EAT" for Nairobi, "GMT+5:30" for Mumbai, "GMT-3" for Sao Paulo. The GMT form is used
 * on purpose where there is no unambiguous abbreviation ("IST" is India, Ireland and Israel).
 */
export function shopZoneLabel(instant, zone) {
  return zoneLabel(instant, safeShopZone(zone), "en-KE");
}

/**
 * Convert one shop wall-clock time on a shop calendar date to the viewer.
 * date: "YYYY-MM-DD" (shop calendar date), time: "HH:MM" (shop wall clock).
 * Returns null when date or time is not valid.
 * {
 *   instant: Date, iso,
 *   shop:   { date, time, clock, label, weekday },
 *   viewer: { date, time, clock, label, weekday } | null   // null when no viewer zone was given
 *   dayShift: viewer date minus shop date, in days (negative = viewer's date is earlier) | 0 without viewer,
 *   sameClock: true when the viewer's date and clock equal the shop's (same offset at that instant),
 *   adjusted: true when the shop time fell in a daylight saving gap or overlap
 * }
 */
export function shopClock(date, time, { shopZone, viewerZone } = {}) {
  const m = typeof time === "string" ? TIME_RE.exec(time) : null;
  if (!m || !isCalendarDay(date)) return null;
  const zone = safeShopZone(shopZone);
  const viewZone = safeViewerZone(viewerZone);
  const [year, month, day] = date.split("-").map(Number);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const instant = zonedTimeToUtc({ year, month, day, hour, minute }, zone);
  const s = zonedParts(instant, zone);
  const shopDate = `${String(s.year).padStart(4, "0")}-${pad2(s.month)}-${pad2(s.day)}`;
  const shopTime = `${pad2(s.hour)}:${pad2(s.minute)}`;
  const shop = { date: shopDate, time: shopTime, clock: formatClock(shopTime), label: shopZoneLabel(instant, zone), weekday: s.weekday };
  let viewer = null;
  let dayShift = 0;
  let sameClock = true;
  if (viewZone) {
    const v = zonedParts(instant, viewZone);
    const viewerDate = `${String(v.year).padStart(4, "0")}-${pad2(v.month)}-${pad2(v.day)}`;
    const viewerTime = `${pad2(v.hour)}:${pad2(v.minute)}`;
    viewer = { date: viewerDate, time: viewerTime, clock: formatClock(viewerTime), label: shopZoneLabel(instant, viewZone), weekday: v.weekday };
    dayShift = calendarDaysBetween(shopDate, viewerDate);
    sameClock = viewerDate === shopDate && viewerTime === shopTime;
  }
  return { instant, iso: instant.toISOString(), shop, viewer, dayShift, sameClock, adjusted: shopTime !== time || shopDate !== date };
}

/** "Sun" or "Sun 25 Oct" for a calendar day, no zone applied. */
function dayTag(day, style) {
  if (style === "date") return formatCalendarDay(day, { weekday: "short", day: "numeric", month: "short", year: undefined });
  return formatCalendarDay(day, { weekday: "short", day: undefined, month: undefined, year: undefined });
}

/**
 * The viewer's reading of a shop clock as text: "7:00 PM", or "Sun 6:30 PM" when the viewer's date differs from the
 * shop's date for that same time. dayStyle "date" adds the day and month ("Sun 25 Oct 6:30 PM").
 */
export function viewerClockText(clock, { dayStyle = "weekday" } = {}) {
  if (!clock?.viewer) return "";
  const prefix = clock.dayShift !== 0 ? `${dayTag(clock.viewer.date, dayStyle)} ` : "";
  return `${prefix}${clock.viewer.clock}`;
}

/**
 * One shop time as a label, for a single moment such as a closing time.
 *   no viewer, or the same reading: "6:00 PM EAT"
 *   different reading:              "6:00 PM EAT · 7:00 PM your time"  (with weekday/date when the day differs)
 * Returns "" for an invalid date or time.
 */
export function shopTimeText(date, time, { shopZone, viewerZone, dayStyle = "weekday", youLabel = "your time" } = {}) {
  const c = shopClock(date, time, { shopZone, viewerZone });
  if (!c) return "";
  const base = `${c.shop.clock} ${c.shop.label}`;
  if (!c.viewer || c.sameClock) return base;
  return `${base} · ${viewerClockText(c, { dayStyle })} ${youLabel}`;
}

/**
 * A shop interval on a shop date. end <= start runs past midnight into the next shop date (equal times = 24 hours).
 * {
 *   date, from, to, overnight,
 *   shopText: "9:00 AM to 6:00 PM", shopLabel: "EAT",
 *   viewerText: "3:00 AM to 12:00 PM" | null  (null when there is no viewer zone or it reads the same),
 *   viewerLabel: "GMT-3" | "",
 *   start, end: the two shopClock results
 * }
 */
export function shopIntervalView(date, interval, { shopZone, viewerZone, dayStyle = "weekday" } = {}) {
  if (!Array.isArray(interval) || interval.length !== 2) return null;
  const [from, to] = interval;
  const start = shopClock(date, from, { shopZone, viewerZone });
  const overnight = TIME_RE.test(to ?? "") && TIME_RE.test(from ?? "") && to <= from;
  const end = shopClock(overnight ? addCalendarDays(date, 1) : date, to, { shopZone, viewerZone });
  if (!start || !end) return null;
  const differs = Boolean(start.viewer) && (!start.sameClock || !end.sameClock);
  // If either end falls on another day for the viewer, name the day on both ends so the range cannot be misread.
  const tagBoth = differs && (start.dayShift !== 0 || end.dayShift !== 0);
  const viewerEnd = (c) => (tagBoth ? `${dayTag(c.viewer.date, dayStyle)} ${c.viewer.clock}` : viewerClockText(c, { dayStyle }));
  return {
    date,
    from,
    to,
    overnight,
    shopText: `${start.shop.clock} to ${end.shop.clock}`,
    shopLabel: start.shop.label,
    viewerText: differs ? `${viewerEnd(start)} to ${viewerEnd(end)}` : null,
    viewerLabel: differs ? start.viewer.label : "",
    start,
    end
  };
}

/**
 * A whole shop calendar day (an "all day closed" exception) as the viewer's range, or null when the viewer's clock
 * reads the same as the shop's, or there is no viewer zone. The day is exactly 23, 24 or 25 hours at a daylight saving
 * change, and the range follows the real instants.
 * { from: "Mon 26 Oct 6:00 PM", to: "Tue 27 Oct 6:00 PM", label }
 */
export function shopDayInViewer(date, { shopZone, viewerZone } = {}) {
  const view = safeViewerZone(viewerZone);
  if (!view || !isCalendarDay(date)) return null;
  const zone = safeShopZone(shopZone);
  const startIso = startOfDayUtcIso(date, zone);
  const endIso = startOfDayUtcIso(addCalendarDays(date, 1), zone);
  const a = zonedParts(startIso, view);
  const b = zonedParts(endIso, view);
  const sa = zonedParts(startIso, zone);
  const sb = zonedParts(endIso, zone);
  const same = a.hour === sa.hour && a.minute === sa.minute && a.day === sa.day && a.month === sa.month
    && b.hour === sb.hour && b.minute === sb.minute && b.day === sb.day && b.month === sb.month;
  if (same) return null;
  const part = (p) => {
    const day = `${String(p.year).padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}`;
    return `${dayTag(day, "date")} ${formatClock(`${pad2(p.hour)}:${pad2(p.minute)}`)}`;
  };
  return { from: part(a), to: part(b), label: shopZoneLabel(startIso, view), startIso, endIso };
}

/**
 * The next time a shop clock reading occurs, from `now`, as a shop calendar date. Used for "Closes 6:00 PM": the
 * closing clock is always the next one to come, today if it is still ahead of the shop's wall clock, else tomorrow.
 */
export function nextShopDateOf(time, now = new Date(), shopZone) {
  const m = typeof time === "string" ? TIME_RE.exec(time) : null;
  const p = zonedParts(now, safeShopZone(shopZone));
  if (!m || !p) return null;
  const today = `${String(p.year).padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}`;
  return Number(m[1]) * 60 + Number(m[2]) > p.hour * 60 + p.minute ? today : addCalendarDays(today, 1);
}

/** "Hours are in shop time (EAT)." line to print above a table of hours, or "" when nothing needs saying. */
export function shopTimeNote(now = new Date(), { shopZone, viewerZone } = {}) {
  const zone = safeShopZone(shopZone);
  const label = shopZoneLabel(now, zone);
  const view = safeViewerZone(viewerZone);
  if (!view) return `Hours are in shop time (${label}).`;
  const a = zonedParts(now, zone);
  const b = zonedParts(now, view);
  const sameOffset = a.offsetMinutes === b.offsetMinutes;
  return sameOffset ? `Hours are in shop time (${label}).` : `Hours are in shop time (${label}). Your time is shown too.`;
}

/**
 * An exception ({ date, kind, intervals }) in words, in the shop's zone and, when it reads differently, the viewer's.
 *   shopText:   "Closed all day (EAT)" | "Special hours: 1:00 PM to 2:00 PM EAT"
 *   viewerText: null | "Closed Mon 26 Oct 6:00 PM to Tue 27 Oct 6:00 PM your time" | "Special hours: 7:00 AM to 8:00 AM your time"
 * The exception stays attached to the shop's calendar date; only its wording is converted.
 */
export function describeExceptionForViewer(exception, { shopZone, viewerZone, dayStyle = "date" } = {}) {
  if (!exception || !isCalendarDay(exception.date)) return { shopText: "", viewerText: null };
  const zone = safeShopZone(shopZone);
  const label = shopZoneLabel(startOfDayUtcIso(exception.date, zone), zone);
  if (exception.kind === "closed") {
    const day = shopDayInViewer(exception.date, { shopZone: zone, viewerZone });
    return { shopText: `Closed all day (${label})`, viewerText: day ? `Closed ${day.from} to ${day.to} your time` : null };
  }
  const views = (exception.intervals ?? []).map((iv) => shopIntervalView(exception.date, iv, { shopZone: zone, viewerZone, dayStyle })).filter(Boolean);
  const shop = views.map((v) => v.shopText).join(", ");
  return {
    shopText: `Special hours: ${shop} ${label}`,
    viewerText: views.some((v) => v.viewerText) ? `Special hours: ${views.map((v) => v.viewerText ?? v.shopText).join(", ")} your time` : null
  };
}
