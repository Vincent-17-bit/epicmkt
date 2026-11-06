// Exceptions to the opening hours. The database functions seller_save_exception / exception_normalize apply the
// same rules (a test keeps them equal); the seller screen and the mock API use this copy for instant feedback.
export const EXCEPTION_LIMIT = 60;
export const EXCEPTION_MAX_INTERVALS = 3;
export const EXCEPTION_NOTE_MAX = 120;
export const EXCEPTION_MAX_DAYS_AHEAD = 730;

const DAY_MS = 86_400_000;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const BREAK_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (day) => new Date(`${day}T00:00:00Z`);
export const isRealDate = (day) => DATE.test(day ?? "") && utc(day).toISOString().slice(0, 10) === day;
export const addDays = (day, n) => new Date(utc(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** The last date an exception can still matter on: a repeating break with no end never expires. */
export const lastDayOf = (e) => (e.until ? e.until : Array.isArray(e.weekdays) ? "9999-12-31" : e.date);

/** Only the ones still to come or running, soonest first. Past ones are hidden. */
export const upcomingExceptions = (list, today) =>
  [...(list ?? [])].filter((e) => lastDayOf(e) >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export function dayLabel(day) {
  const d = utc(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** An interval whose end is not after its start runs past midnight, to that time on the next day. */
export const isOvernight = ([start, end]) => end <= start;

export const describeIntervals = (intervals) => (intervals ?? []).map((iv) => `${iv[0]} to ${iv[1]}${isOvernight(iv) ? " the next day" : ""}`).join(", ");
const WEEKDAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const describeWeekdays = (days) => {
  const set = BREAK_WEEKDAYS.filter((d) => (days ?? []).includes(d));
  if (set.length === 7) return "Every day";
  if (set.join() === "mon,tue,wed,thu,fri") return "Every weekday";
  if (set.join() === "sat,sun") return "Every weekend";
  return `Every ${set.map((d) => WEEKDAY_NAMES[d]).join(", ")}`;
};
export const describeException = (e) => (e.kind === "closed" ? "Closed all day" : e.kind === "break" ? `Closed ${(e.intervals ?? []).map((iv) => `${iv[0]} to ${iv[1]}`).join(", ")}` : `Special hours: ${describeIntervals(e.intervals)}`);

/**
 * Returns { ok: true, value } or { ok: false, error, index? } with the same codes as the database.
 * options.nowTime ("HH:MM", the shop clock) refuses special or break times that start before it; options.keep lists
 * intervals already saved, which stay allowed.
 */
export function validateException({ date, kind, intervals, note, until, weekdays }, today, { nowTime = null, keep = [] } = {}) {
  if (!isRealDate(date)) return { ok: false, error: "invalid_date" };
  if (date < today) return { ok: false, error: "date_in_past" };
  if (date > addDays(today, EXCEPTION_MAX_DAYS_AHEAD)) return { ok: false, error: "date_too_far" };
  if (kind !== "closed" && kind !== "special" && kind !== "break") return { ok: false, error: "invalid_kind" };
  const text = String(note ?? "").trim();
  // eslint-disable-next-line no-control-regex
  if (text.length > EXCEPTION_NOTE_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, error: "invalid_note" };

  let clean = [];
  let lastDay = null;
  let days = null;
  if (kind === "break") {
    if (until !== null && until !== undefined && until !== "") {
      if (!isRealDate(until)) return { ok: false, error: "invalid_date" };
      if (until < date) return { ok: false, error: "until_before_date" };
      if (until > addDays(today, EXCEPTION_MAX_DAYS_AHEAD)) return { ok: false, error: "date_too_far" };
      lastDay = until;
    }
    if (weekdays !== null && weekdays !== undefined) {
      if (!Array.isArray(weekdays) || weekdays.length === 0 || weekdays.some((d) => !BREAK_WEEKDAYS.includes(d))) return { ok: false, error: "invalid_weekdays" };
      days = BREAK_WEEKDAYS.filter((d) => weekdays.includes(d));
    }
  }
  if (kind === "special" || kind === "break") {
    if (!Array.isArray(intervals) || intervals.length === 0) return { ok: false, error: "intervals_required" };
    if (intervals.length > EXCEPTION_MAX_INTERVALS) return { ok: false, error: "too_many_intervals" };
    for (let i = 0; i < intervals.length; i++) {
      const iv = intervals[i];
      if (!Array.isArray(iv) || iv.length !== 2 || !TIME.test(iv[0] ?? "") || !TIME.test(iv[1] ?? "")) return { ok: false, error: "invalid_time", index: i };
      if (kind === "break" && iv[1] <= iv[0]) return { ok: false, error: "break_order", index: i };
      if (nowTime && date === today && iv[0] < nowTime && !keep.some((k) => k[0] === iv[0] && k[1] === iv[1])) return { ok: false, error: "time_in_past", index: i };
    }
    clean = [...intervals].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([a, b]) => [a, b]);
    // An overnight interval (end <= start) occupies the rest of this date, so nothing later the same date may touch it.
    // The part after midnight belongs to the next date and is not compared with this date's other intervals.
    const lastMinute = (iv) => (isOvernight(iv) ? "24:00" : iv[1]);
    for (let i = 1; i < clean.length; i++) if (clean[i][0] <= lastMinute(clean[i - 1])) return { ok: false, error: "intervals_overlap", index: i };
  }
  const value = { date, kind, intervals: clean, note: text || null };
  return { ok: true, value: kind === "break" ? { ...value, until: lastDay, weekdays: days } : value };
}
