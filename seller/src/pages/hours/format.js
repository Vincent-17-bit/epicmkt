import { formatClock, toMinutes, fromMinutes, mergedIntervals, DAY_NAMES, parseDateKey, dowOf, dateKeyOf, formatMinutesLong, snapTime } from "@epicmkt/shared/hours";

export const fmtInterval = (i) => `${formatClock(i.start)} to ${formatClock(i.end)}${i.endsNextDay ? " (next day)" : ""}`;

export function daySummary(day) {
  if (!day || day.closed) return "Closed";
  if (day.open24) return "Open 24 hours";
  const merged = mergedIntervals(day);
  return merged.length ? merged.map(fmtInterval).join(", ") : "No hours set";
}

export function breaksOf(day) {
  if (!day || day.closed || day.open24) return [];
  const merged = mergedIntervals(day);
  const out = [];
  for (let i = 0; i + 1 < merged.length; i += 1) {
    const from = merged[i].endMinutes;
    const to = toMinutes(merged[i + 1].start);
    if (from > 1440 || to <= from) continue;
    const length = to - from;
    const lunch = from >= 660 && from <= 900 && length >= 30 && length <= 180;
    out.push({ start: fromMinutes(from), end: merged[i + 1].start, label: lunch ? "Lunch break" : "Break", minutes: length });
  }
  return out;
}

export const longDate = (key) => {
  const ms = parseDateKey(key);
  if (Number.isNaN(ms)) return key;
  const d = new Date(ms + 3 * 3600000);
  return `${DAY_NAMES[dowOf(ms)].slice(0, 3)} ${d.getUTCDate()} ${d.toLocaleString("en-KE", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
};

export const todayKey = (nowMs) => dateKeyOf(nowMs);

export const newInterval = (list) => {
  const merged = mergedIntervals({ closed: false, open24: false, intervals: list });
  if (!merged.length) return { start: "09:00", end: "17:00" };
  const last = merged[merged.length - 1];
  const startMin = Math.min(last.endMinutes + 60, 22 * 60 + 55);
  const start = fromMinutes(startMin);
  const end = fromMinutes(startMin + 180);
  return { start: snapTime(start), end: snapTime(end) };
};

export const allowance = (ms) => formatMinutesLong(Math.floor(ms / 60000));

const pad = (n) => String(n).padStart(2, "0");

export const toLocalDateTime = (ms) => {
  const d = new Date(ms + 3 * 3600000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export const parseLocalDateTime = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - 3 * 3600000;
  return toLocalDateTime(ms) === value ? ms : null;
};
