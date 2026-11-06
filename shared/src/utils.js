import { BUSINESS_TIME_ZONE, startOfDayUtcIso, zonedParts } from "./time.js";
import { safeShopZone, shopDayInViewer, shopIntervalView, shopZoneLabel } from "./shopTime.js";
import { addDays } from "./seller/exceptions.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const slugify = (value) => normalizeText(value).replace(/\s/g, "-");

/** Digits only, country code included, no "+". Kenyan local numbers get 254. Other countries need their code. */
export const toE164 = (phone) => {
  const s = String(phone ?? "").replace(/[\s\-().]/g, "");
  if (/^(?:\+|00)[1-9]\d{7,14}$/.test(s)) return s.replace(/^(?:\+|00)/, "");
  const digits = s.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};
export const toE164KE = toE164;

export const isValidPhone = (phone) => {
  const s = String(phone ?? "").replace(/[\s\-().]/g, "");
  return /^(?:254|0)[1-9]\d{8}$/.test(s) || /^(?:\+|00)[1-9]\d{7,14}$/.test(s);
};
export const isValidPhoneKE = isValidPhone;

/** Kenyan numbers show as 0712 345 678, others as +CC and the rest. */
export const formatPhone = (phone) => {
  const d = toE164(phone);
  if (/^254\d{9}$/.test(d)) return `0${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return `+${d}`;
};
export const formatPhoneKE = formatPhone;

export const telLink = (phone) => `tel:+${toE164(phone)}`;

export const whatsappLink = (phone, text) =>
  `https://wa.me/${toE164(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const directionsLink = (lat, lng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/**
 * The one KES formatter.
 *
 * - Whole amounts show no decimals ("KES 1,500"); fractional amounts show
 *   exactly `decimals` places ("KES 999.99", "KES 12.50"). Rounding happens
 *   first, so 1299.999 is "KES 1,300", not "KES 1,300.00".
 * - `decimals` defaults to 2, the smallest unit of the shilling. Pass 0 to round
 *   to whole shillings.
 * - A missing amount (null or undefined) returns `empty`, "KES 0" by default.
 *   Pass `empty: ""` or `empty: "–"` where it should look missing.
 * - An amount that is not a finite number (NaN, "abc", Infinity) is a bug in
 *   the data, not a missing value, so it returns `invalid` ("–") instead of
 *   passing for "KES 0".
 */
export function formatKes(amount, { decimals = 2, empty = "KES 0", invalid = "–" } = {}) {
  if (amount === null || amount === undefined) return empty;
  const value = Number(amount);
  if (!Number.isFinite(value)) return invalid;
  const rounded = Number(value.toFixed(decimals));
  const places = Number.isInteger(rounded) ? 0 : decimals;
  return `KES ${rounded.toLocaleString("en-KE", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const formatDistance = (km) =>
  km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1)} km`;

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/**
 * The wall clock at the business, as { day, minutes, date }. Read in BUSINESS_TIME_ZONE (Nairobi) unless another IANA
 * zone is passed, so a shop's hours mean the same thing to every viewer and follow that zone's daylight saving.
 */
export function nairobiNow(date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const p = zonedParts(date, timeZone);
  if (!p) throw new RangeError("nairobiNow needs a valid date");
  return {
    day: DAYS[p.weekday],
    minutes: p.hour * 60 + p.minute,
    // The business calendar date, "YYYY-MM-DD". Exceptions are keyed by this.
    date: `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
  };
}
export const businessNow = nairobiNow;

export function todayHours(hours, date, timeZone) {
  return hours[nairobiNow(date, timeZone).day] ?? null;
}

export function isOpenNow(hours, date, timeZone) {
  const { day, minutes } = nairobiNow(date, timeZone);
  const slot = hours[day];
  if (!slot) return false;
  const start = toMinutes(slot[0]);
  const end = endOf(slot);
  return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

// ---- Opening hours with exceptions -------------------------------------------------------------------------------
// An exception is { date: "YYYY-MM-DD", kind: "closed" | "special" | "break", intervals: [["09:00","13:00"], ...], note }.
// The exception for a Nairobi calendar date replaces the weekly hours for that date.
//   closed  -> closed all day.
//   special -> open only inside its intervals.
//   break   -> the normal hours apply, except inside its intervals (1 to 3, each within one day). It does not replace the
//              day: it applies on `date` alone, on every date up to `until`, or (with `weekdays`) on those weekdays from
//              `date` until `until` (no `until` repeats for good). Breaks stack; a closed or special date ignores them.
// An interval (weekly or exception) with end <= start runs past midnight. The part after midnight belongs to the
// NEXT date: it carries over unless that date has a "closed" exception. A "special" exception on the next date takes
// over at its first interval's start, so the carried-over time before that still counts as open.

const isTime = (t) => typeof t === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t);
const isInterval = (iv) => Array.isArray(iv) && iv.length === 2 && isTime(iv[0]) && isTime(iv[1]);
const pad2 = (n) => String(n).padStart(2, "0");
const toTime = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
export const isFullDay = (iv) => Array.isArray(iv) && iv[0] === "00:00" && iv[1] === "23:59";
const endOf = (iv) => (isFullDay(iv) ? 1440 : toMinutes(iv[1]));
const weekdayOf = (dateStr) => DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];

/** The exception that applies to one calendar date, or null. Entries that are not closed/special are ignored. */
export function exceptionFor(exceptions, dateStr) {
  if (!Array.isArray(exceptions)) return null;
  return exceptions.find((e) => e && e.date === dateStr && (e.kind === "closed" || e.kind === "special")) ?? null;
}

const breakApplies = (e, dateStr) => {
  if (!e || e.kind !== "break" || typeof e.date !== "string" || e.date > dateStr) return false;
  if (Array.isArray(e.weekdays)) return (!e.until || dateStr <= e.until) && e.weekdays.includes(weekdayOf(dateStr));
  if (e.until) return dateStr <= e.until;
  return e.date === dateStr;
};

/** The break windows in force on a calendar date, soonest first: { from, to, start, end, note }. None on a closed or special date. */
export function breaksOn(exceptions, dateStr) {
  if (!Array.isArray(exceptions) || exceptionFor(exceptions, dateStr)) return [];
  const found = [];
  for (const e of exceptions) {
    if (!breakApplies(e, dateStr)) continue;
    const note = typeof e.note === "string" && e.note.trim() ? e.note.trim() : null;
    for (const iv of e.intervals ?? []) {
      if (isInterval(iv) && toMinutes(iv[0]) < toMinutes(iv[1])) found.push({ from: iv[0], to: iv[1], start: toMinutes(iv[0]), end: toMinutes(iv[1]), note });
    }
  }
  return found.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Open minute ranges with the break windows taken out. The part before a break closes at the break's start, the part after it opens at its end. */
function cutWindows(windows, cuts) {
  let out = windows;
  for (const cut of cuts) {
    out = out.flatMap((w) => {
      if (cut.end <= w.start || cut.start >= w.end) return [w];
      const pieces = [];
      if (cut.start > w.start) pieces.push({ ...w, end: cut.start, closes: cut.from, fullDay: false });
      if (cut.end < w.end) pieces.push({ ...w, start: cut.end, startLabel: cut.end > w.start ? cut.to : w.startLabel, fullDay: false });
      return pieces;
    });
  }
  return out;
}

/** The intervals that START on a calendar date: its exception if it has one, otherwise the weekly slot for that weekday. */
export function intervalsOn(hours, exceptions, dateStr) {
  const exception = exceptionFor(exceptions, dateStr);
  if (exception) return exception.kind === "special" ? (exception.intervals ?? []).filter(isInterval) : [];
  const slot = hours?.[weekdayOf(dateStr)];
  return isInterval(slot) ? [slot] : [];
}

// Minute ranges that are open on one calendar date, 0 to 1440, each with the clock time it closes at.
function windowsOn(hours, exceptions, dateStr, withBreaks = true) {
  const windows = [];
  const nextDayClosed = exceptionFor(exceptions, addDays(dateStr, 1))?.kind === "closed";
  for (const [from, to] of intervalsOn(hours, exceptions, dateStr)) {
    const start = toMinutes(from);
    const end = endOf([from, to]);
    if (end > start) windows.push({ start, end, startLabel: from, closes: isFullDay([from, to]) ? "00:00" : to, fullDay: isFullDay([from, to]) });
    else windows.push({ start, end: 1440, startLabel: from, closes: nextDayClosed ? "00:00" : to });
  }
  if (exceptionFor(exceptions, dateStr)?.kind !== "closed") {
    for (const [from, to] of intervalsOn(hours, exceptions, addDays(dateStr, -1))) {
      const end = toMinutes(to);
      if (end <= toMinutes(from) && end > 0) windows.push({ start: 0, end, startLabel: "00:00", closes: to });
    }
  }
  return withBreaks ? cutWindows(windows, breaksOn(exceptions, dateStr)) : windows;
}

/** The open stretches of a calendar date as minute ranges, breaks taken out: [{ start, end }]. A stretch that runs past midnight ends at 1440. */
export const openMinutesOn = (hours, exceptions, dateStr) => windowsOn(hours, exceptions, dateStr).map(({ start, end }) => ({ start, end }));

/** The break in force right now, or null. Only counts when the shop would be open this minute without it. */
export function activeBreak(hours, exceptions, date, timeZone) {
  const now = nairobiNow(date, timeZone);
  const scheduled = windowsOn(hours, exceptions, now.date, false).some((w) => now.minutes >= w.start && now.minutes < w.end);
  return scheduled ? breaksOn(exceptions, now.date).find((b) => now.minutes >= b.start && now.minutes < b.end) ?? null : null;
}

/** Is the business open at this moment (default now)? Exceptions override the weekly hours for that Nairobi date. */
export function isOpenOn(hours, exceptions, date, timeZone) {
  const now = nairobiNow(date, timeZone);
  return windowsOn(hours, exceptions, now.date).some((w) => now.minutes >= w.start && now.minutes < w.end);
}

export function openAllDayNow(hours, exceptions, date, timeZone) {
  const now = nairobiNow(date, timeZone);
  const current = windowsOn(hours, exceptions, now.date).find((w) => now.minutes >= w.start && now.minutes < w.end);
  if (!current?.fullDay) return false;
  return windowsOn(hours, exceptions, addDays(now.date, 1)).some((w) => w.start === 0);
}

// The clock time an open stretch ends, following it across midnight while the next date picks up at 00:00. Null when the
// stretch has no end within a day (a 24-hour shop), because a clock time alone would then name the wrong day.
function closingClock(hours, exceptions, now, current) {
  let day = now.date;
  let w = current;
  let elapsed = 0;
  for (let step = 0; step < 8; step += 1) {
    if (w.end < 1440) return elapsed + w.end - now.minutes < 1440 ? w.closes : null;
    day = addDays(day, 1);
    elapsed += 1440;
    const next = windowsOn(hours, exceptions, day).filter((x) => x.start === 0).sort((a, b) => b.end - a.end)[0];
    if (!next) return elapsed - now.minutes < 1440 ? w.closes : null;
    w = next;
  }
  return null;
}

/**
 * { closesAt: "HH:MM" | null, opensAt: { day, time, date } | null }.
 * Open now: closesAt is set. Closed: opensAt is the next opening today or in the next 7 days, exceptions included.
 * (Old calls closingInfo(hours, date) still work.)
 */
export function closingInfo(hours, exceptions, date, timeZone) {
  if (exceptions instanceof Date) {
    date = exceptions;
    exceptions = null;
  }
  const now = nairobiNow(date, timeZone);
  const today = windowsOn(hours, exceptions, now.date);
  const current = today.find((w) => now.minutes >= w.start && now.minutes < w.end);
  if (current) return { closesAt: closingClock(hours, exceptions, now, current), opensAt: null };
  const later = today.filter((w) => w.start > now.minutes).sort((a, b) => a.start - b.start)[0];
  if (later) return { closesAt: null, opensAt: { day: now.day, time: later.startLabel, date: now.date } };
  for (let step = 1; step <= 7; step += 1) {
    const day = addDays(now.date, step);
    const first = windowsOn(hours, exceptions, day).sort((a, b) => a.start - b.start)[0];
    if (first) return { closesAt: null, opensAt: { day: weekdayOf(day), time: first.startLabel, date: day } };
  }
  return { closesAt: null, opensAt: null };
}

/**
 * The next 7 Nairobi dates starting today, each with the weekday, its exception (or null) and the intervals that
 * apply. Every weekday appears exactly once, so a hours table can show Mon to Sun with the exception for that date.
 */
export function weekSchedule(hours, exceptions, date, timeZone) {
  const first = nairobiNow(date, timeZone).date;
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(first, i);
    return { day: weekdayOf(day), date: day, today: i === 0, exception: exceptionFor(exceptions, day), intervals: intervalsOn(hours, exceptions, day), breaks: breaksOn(exceptions, day) };
  });
}

const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13:05" -> "1:05 PM". */
export const formatClock = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? "PM" : "AM"}`;
};

const breakRow = (date, b, shopZone, viewerZone) => {
  const view = shopIntervalView(date, [b.from, b.to], { shopZone, viewerZone });
  return { from: b.from, to: b.to, text: view?.shopText ?? `${formatClock(b.from)} to ${formatClock(b.to)}`, viewerText: view?.viewerText ?? null, viewerLabel: view?.viewerLabel ?? "", note: b.note };
};

/**
 * Rows for the "Opening hours" table, Monday to Sunday, for the coming 7 days so each weekday is its next date.
 * { day, name, date, dateLabel, today, text, changed, note, shopZone, shopLabel, viewerText, viewerLabel }
 *   text        the shop's own hours in the shop's zone ("9:00 AM to 6:00 PM"), "Closed" on a closed day.
 *   shopLabel   the shop zone's short name ("EAT"), so the hours are never ambiguous.
 *   viewerText  the same hours in the viewer's zone ("3:00 AM to 12:00 PM", "Sun 6:30 PM to Mon 1:00 AM"), or null when
 *               no viewerZone was passed or it reads the same as the shop. For an all-day "closed" exception it is the
 *               stretch of the viewer's clock that day covers. A weekly day off has no viewerText.
 * `changed` is true when an exception replaces the weekly hours for that date, `dateLabel` is that date as "20 Oct", and
 * `note` is the exception's note (plain text) or null.
 *
 * timeZone is the SHOP's zone (default Nairobi). viewerZone is opt in: pass getUserTimeZone() in a browser, nothing on a
 * server, where there is no viewer.
 */
export function hoursRowsFor(hours, exceptions, date, timeZone, viewerZone) {
  const shopZone = safeShopZone(timeZone);
  return weekSchedule(hours, exceptions, date, shopZone)
    .map((d) => {
      const views = d.intervals.filter((iv) => !isFullDay(iv)).map((iv) => shopIntervalView(d.date, iv, { shopZone, viewerZone })).filter(Boolean);
      const closedDay = d.exception?.kind === "closed" ? shopDayInViewer(d.date, { shopZone, viewerZone }) : null;
      const viewerParts = views.map((v) => v.viewerText ?? v.shopText);
      return {
        day: d.day,
        name: DAY_LABELS[d.day],
        date: d.date,
        dateLabel: `${Number(d.date.slice(8))} ${MONTH_SHORT[Number(d.date.slice(5, 7)) - 1]}`,
        today: d.today,
        text: d.intervals.length ? d.intervals.map((iv) => (isFullDay(iv) ? "Open 24 hours" : `${formatClock(iv[0])} to ${formatClock(iv[1])}`)).join(", ") : "Closed",
        breaks: d.intervals.length ? d.breaks.map((b) => breakRow(d.date, b, shopZone, viewerZone)) : [],
        changed: Boolean(d.exception),
        note: d.exception?.note ? String(d.exception.note) : null,
        shopZone,
        shopLabel: d.intervals.length && d.intervals.every(isFullDay) ? "" : shopZoneLabel(startOfDayUtcIso(d.date, shopZone), shopZone),
        viewerText: views.some((v) => v.viewerText) ? viewerParts.join(", ") : closedDay ? `Closed ${closedDay.from} to ${closedDay.to}` : null,
        viewerLabel: views.find((v) => v.viewerText)?.viewerLabel ?? closedDay?.label ?? ""
      };
    })
    .sort((a, b) => WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day));
}
