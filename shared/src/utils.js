import { BUSINESS_TIME_ZONE, zonedParts } from "./time.js";
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

export const formatKes = (amount) => `KES ${Number(amount).toLocaleString("en-KE")}`;

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
  const end = toMinutes(slot[1]);
  return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

// ---- Opening hours with exceptions -------------------------------------------------------------------------------
// An exception is { date: "YYYY-MM-DD", kind: "closed" | "special", intervals: [["09:00","13:00"], ...], note }.
// The exception for a Nairobi calendar date replaces the weekly hours for that date.
//   closed  -> closed all day.
//   special -> open only inside its intervals.
// An interval (weekly or exception) with end <= start runs past midnight. The part after midnight belongs to the
// NEXT date: it carries over unless that date has a "closed" exception. A "special" exception on the next date takes
// over at its first interval's start, so the carried-over time before that still counts as open.

const isTime = (t) => typeof t === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t);
const isInterval = (iv) => Array.isArray(iv) && iv.length === 2 && isTime(iv[0]) && isTime(iv[1]);
const pad2 = (n) => String(n).padStart(2, "0");
const toTime = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
const weekdayOf = (dateStr) => DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];

/** The exception that applies to one calendar date, or null. Entries that are not closed/special are ignored. */
export function exceptionFor(exceptions, dateStr) {
  if (!Array.isArray(exceptions)) return null;
  return exceptions.find((e) => e && e.date === dateStr && (e.kind === "closed" || e.kind === "special")) ?? null;
}

/** The intervals that START on a calendar date: its exception if it has one, otherwise the weekly slot for that weekday. */
export function intervalsOn(hours, exceptions, dateStr) {
  const exception = exceptionFor(exceptions, dateStr);
  if (exception) return exception.kind === "special" ? (exception.intervals ?? []).filter(isInterval) : [];
  const slot = hours?.[weekdayOf(dateStr)];
  return isInterval(slot) ? [slot] : [];
}

// Minute ranges that are open on one calendar date, 0 to 1440, each with the clock time it closes at.
function windowsOn(hours, exceptions, dateStr) {
  const windows = [];
  const nextDayClosed = exceptionFor(exceptions, addDays(dateStr, 1))?.kind === "closed";
  for (const [from, to] of intervalsOn(hours, exceptions, dateStr)) {
    const start = toMinutes(from);
    const end = toMinutes(to);
    if (end > start) windows.push({ start, end, startLabel: from, closes: to });
    else windows.push({ start, end: 1440, startLabel: from, closes: nextDayClosed ? "00:00" : to });
  }
  if (exceptionFor(exceptions, dateStr)?.kind !== "closed") {
    for (const [from, to] of intervalsOn(hours, exceptions, addDays(dateStr, -1))) {
      const end = toMinutes(to);
      if (end <= toMinutes(from) && end > 0) windows.push({ start: 0, end, startLabel: "00:00", closes: to });
    }
  }
  return windows;
}

/** Is the business open at this moment (default now)? Exceptions override the weekly hours for that Nairobi date. */
export function isOpenOn(hours, exceptions, date, timeZone) {
  const now = nairobiNow(date, timeZone);
  return windowsOn(hours, exceptions, now.date).some((w) => now.minutes >= w.start && now.minutes < w.end);
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
  if (current) return { closesAt: current.closes, opensAt: null };
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
    return { day: weekdayOf(day), date: day, today: i === 0, exception: exceptionFor(exceptions, day), intervals: intervalsOn(hours, exceptions, day) };
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

/**
 * Rows for the "Opening hours" table, Monday to Sunday, for the coming 7 days so each weekday is its next date.
 * { day, name, date, dateLabel, today, text, changed, note }: `changed` is true when an exception replaces the weekly
 * hours for that date, `dateLabel` is that date as "20 Oct", and `note` is the exception's note (plain text) or null.
 */
export function hoursRowsFor(hours, exceptions, date, timeZone) {
  return weekSchedule(hours, exceptions, date, timeZone)
    .map((d) => ({
      day: d.day,
      name: DAY_LABELS[d.day],
      date: d.date,
      dateLabel: `${Number(d.date.slice(8))} ${MONTH_SHORT[Number(d.date.slice(5, 7)) - 1]}`,
      today: d.today,
      text: d.intervals.length ? d.intervals.map(([a, b]) => `${formatClock(a)} to ${formatClock(b)}`).join(", ") : "Closed",
      changed: Boolean(d.exception),
      note: d.exception?.note ? String(d.exception.note) : null
    }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day));
}
