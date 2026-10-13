import { DAY_MIN, STEP, WEEK, isTime, toMinutes, fromMinutes, parseDateKey } from "./time.js";
import { cleanText, LABEL_MAX } from "./message.js";

export const MAX_INTERVALS = 4;
export const MAX_EXCEPTIONS = 60;

export const emptyDay = () => ({ closed: true, open24: false, intervals: [] });

const cleanInterval = (raw) => {
  const out = { start: isTime(raw?.start) ? raw.start : "", end: isTime(raw?.end) ? raw.end : "" };
  const label = cleanText(raw?.label).slice(0, LABEL_MAX);
  if (label) out.label = label;
  return out;
};

export function normalizeDay(raw) {
  if (Array.isArray(raw)) return { closed: false, open24: false, intervals: [cleanInterval({ start: raw[0], end: raw[1] })] };
  if (!raw || typeof raw !== "object") return emptyDay();
  return {
    closed: Boolean(raw.closed),
    open24: Boolean(raw.open24),
    intervals: Array.isArray(raw.intervals) ? raw.intervals.map(cleanInterval) : []
  };
}

export function normalizeHours(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(WEEK.map((d) => [d, normalizeDay(source[d])]));
}

export const endsNextDay = (interval) => {
  const s = toMinutes(interval?.start);
  const e = toMinutes(interval?.end);
  return !Number.isNaN(s) && !Number.isNaN(e) && e <= s;
};

export function spansOf(day) {
  if (!day || day.closed) return [];
  if (day.open24) return [[0, DAY_MIN]];
  const out = [];
  for (const i of day.intervals ?? []) {
    const s = toMinutes(i.start);
    const e = toMinutes(i.end);
    if (Number.isNaN(s) || Number.isNaN(e) || s === e) continue;
    out.push([s, e < s ? e + DAY_MIN : e]);
  }
  return out;
}

export function mergeSpans(spans) {
  const sorted = spans.map((s) => [s[0], s[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push(s);
  }
  return out;
}

export function mergedIntervals(day) {
  return mergeSpans(spansOf(day)).map(([s, e]) => ({ start: fromMinutes(s), end: fromMinutes(e), endsNextDay: e > DAY_MIN, endMinutes: e }));
}

export function validateDay(day) {
  const problems = [];
  if (!day || day.closed || day.open24) return problems;
  const list = day.intervals ?? [];
  if (list.length === 0) problems.push({ code: "empty", message: "Add at least one opening time, or mark the day as closed." });
  if (list.length > MAX_INTERVALS) problems.push({ code: "too_many", message: `Use at most ${MAX_INTERVALS} opening times per day.` });
  const valid = [];
  list.forEach((i, index) => {
    if (!isTime(i.start) || !isTime(i.end)) {
      problems.push({ code: "invalid_time", index, message: "Choose both an opening and a closing time." });
      return;
    }
    if (toMinutes(i.start) % STEP || toMinutes(i.end) % STEP) {
      problems.push({ code: "step", index, message: `Times must be in ${STEP}-minute steps.` });
      return;
    }
    if (i.start === i.end) {
      problems.push({ code: "same_time", index, message: "Opening and closing time cannot be the same." });
      return;
    }
    const s = toMinutes(i.start);
    const e = toMinutes(i.end);
    valid.push({ index, s, e: e < s ? e + DAY_MIN : e });
  });
  for (let a = 0; a < valid.length; a += 1) {
    for (let b = a + 1; b < valid.length; b += 1) {
      if (valid[a].s < valid[b].e && valid[b].s < valid[a].e) {
        problems.push({ code: "overlap", index: Math.max(valid[a].index, valid[b].index), message: "These times overlap another opening time." });
      }
    }
  }
  return problems;
}

export function validateWeek(hours) {
  const week = normalizeHours(hours);
  const days = {};
  let ok = true;
  for (const d of WEEK) {
    days[d] = validateDay(week[d]);
    if (days[d].length) ok = false;
  }
  return { ok, days };
}

export function validateException(raw) {
  const day = normalizeDay(raw);
  const problems = validateDay(day);
  if (Number.isNaN(parseDateKey(raw?.date))) problems.unshift({ code: "date", message: "Choose a valid date." });
  return problems;
}

export function normalizeException(raw) {
  const day = normalizeDay(raw);
  const out = { date: String(raw?.date ?? ""), ...day };
  const note = cleanText(raw?.note).slice(0, LABEL_MAX);
  if (note) out.note = note;
  return out;
}

export function normalizeExceptions(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(normalizeException)
    .filter((e) => !Number.isNaN(parseDateKey(e.date)) && !seen.has(e.date) && seen.add(e.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function copyDayToAll(hours, from) {
  const week = normalizeHours(hours);
  const src = week[from];
  return Object.fromEntries(WEEK.map((d) => [d, { closed: src.closed, open24: src.open24, intervals: src.intervals.map((i) => ({ ...i })) }]));
}

export const hoursEqual = (a, b) => JSON.stringify(normalizeHours(a)) === JSON.stringify(normalizeHours(b));

export const exceptionsEqual = (a, b) => JSON.stringify(normalizeExceptions(a)) === JSON.stringify(normalizeExceptions(b));

export const defaultHours = () => ({
  ...Object.fromEntries(WEEK.map((d) => [d, { closed: false, open24: false, intervals: [{ start: "08:00", end: "18:00" }] }])),
  sun: emptyDay()
});

export function serializeHours(hours) {
  const week = normalizeHours(hours);
  return Object.fromEntries(
    WEEK.map((d) => [d, { closed: week[d].closed, open24: week[d].open24 && !week[d].closed, intervals: week[d].closed || week[d].open24 ? [] : week[d].intervals }])
  );
}

export function serializeException(raw) {
  const e = normalizeException(raw);
  const out = { date: e.date, closed: e.closed, open24: e.open24 && !e.closed, intervals: e.closed || e.open24 ? [] : e.intervals };
  if (e.note) out.note = e.note;
  return out;
}
