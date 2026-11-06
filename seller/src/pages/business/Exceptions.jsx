import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BREAK_WEEKDAYS, DAYS, EXCEPTION_LIMIT, EXCEPTION_MAX_DAYS_AHEAD, EXCEPTION_MAX_INTERVALS, EXCEPTION_NOTE_MAX,
  addDays, breaksOn, dayLabel, describeException, describeExceptionForViewer, describeWeekdays, formatClock, getUserTimeZone, hoursRowsFor, nairobiNow, openMinutesOn, safeShopZone, shopTimeNote, statusOf, isOvernight, upcomingExceptions, validateException, zonedTimeToUtc,
} from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { now } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import { useRealtime } from "../../lib/useRealtime.js";
import ui from "../../styles/ui.module.css";
import styles from "./exceptions.module.css";

export const UNDO_MS = 8000;
const todayOf = (zone) => nairobiNow(now(), zone).date;
// The same exception in the viewer's own clock, when that reads differently from the shop's.
const viewerLine = (e, shopZone) => describeExceptionForViewer(e, { shopZone, viewerZone: getUserTimeZone() }).viewerText;
const nextDayLabel = (date) => (date ? dayLabel(addDays(date, 1)) : "the next day");

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const utc = (day) => new Date(`${day}T00:00:00Z`);
const daysUntil = (day, from) => Math.round((utc(day) - utc(from)) / DAY_MS);
const monthKey = (day) => day.slice(0, 7);
const monthTitle = (day) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
const minutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** "In 5 days", "In 3 weeks", "In 4 months". Today and tomorrow are shown as pills instead. */
function relative(day, today) {
  const n = daysUntil(day, today);
  if (n <= 1) return null;
  if (n < 14) return `In ${n} days`;
  if (n < 60) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30)} months`;
}

/** The next Saturday or Sunday that is at least a day away. */
const nextWeekday = (today, weekday) => {
  const diff = (weekday - utc(today).getUTCDay() + 7) % 7 || 7;
  return addDays(today, diff);
};

const REASONS = ["Public holiday", "Stock take", "Early close", "Staff event", "Away"];
const BREAK_REASONS = ["Lunch", "Prayer", "Staff meeting", "Deliveries"];
const BREAK_PRESETS = [
  { label: "Lunch 1 to 2 PM", intervals: [["13:00", "14:00"]] },
  { label: "Short break 3 to 3:30 PM", intervals: [["15:00", "15:30"]] },
];
const MODES = [
  { id: "day", label: "This day only" },
  { id: "range", label: "Several days in a row" },
  { id: "weekly", label: "Every week" },
];
const DAY_FULL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const WEEKDAY_CHIPS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const weekdayOf = (day) => DAYS[utc(day).getUTCDay()];
const instantAt = (day, time, zone) => zonedTimeToUtc({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)), day: Number(day.slice(8)), hour: Number(time.slice(0, 2)), minute: Number(time.slice(3)) }, zone);

/** The first date a break applies on, so the preview can show what customers read on a real day. */
function sampleDate({ mode, date, until, weekdays }, today) {
  if (!date) return null;
  if (mode !== "weekly") return date;
  const from = date < today ? today : date;
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(from, i);
    if (weekdays.includes(weekdayOf(day)) && (!until || day <= until)) return day;
  }
  return null;
}

/** The dates a break covers, for the "usual hours" reminder: the one day, up to two weeks of a run, or the chosen weekdays. */
function coveredWeekdays({ mode, date, until, weekdays }) {
  if (!date) return [];
  if (mode === "day") return [weekdayOf(date)];
  if (mode === "weekly") return BREAK_WEEKDAYS.filter((d) => weekdays.includes(d));
  const found = new Set();
  for (let i = 0; i < 14 && (!until || addDays(date, i) <= until); i += 1) found.add(weekdayOf(addDays(date, i)));
  return BREAK_WEEKDAYS.filter((d) => found.has(d));
}

const exceptionTitle = (e) => {
  if (e.kind !== "break") return dayLabel(e.date);
  if (Array.isArray(e.weekdays)) return describeWeekdays(e.weekdays);
  if (e.until && e.until !== e.date) return `${dayLabel(e.date)} to ${dayLabel(e.until)}`;
  return dayLabel(e.date);
};
const exceptionSpan = (e, today) => {
  if (e.kind !== "break" || !Array.isArray(e.weekdays)) return null;
  const from = e.date > today ? `From ${dayLabel(e.date)} ` : "";
  return `${from}${e.until ? `until ${dayLabel(e.until)}` : "until you remove it"}`.replace(/^./, (c) => c.toUpperCase());
};
const appliesToday = (e, today) => (e.kind === "break" ? breaksOn([e], today).length > 0 : e.date === today);
const HOUR_PRESETS = [
  { label: "Mornings only", intervals: [["08:00", "13:00"]] },
  { label: "Afternoons only", intervals: [["13:00", "18:00"]] },
  { label: "Open late", intervals: [["20:00", "02:00"]] },
];

/** A 24 hour strip: the filled parts are when the shop is open. Overnight hours stop at midnight; the rest belongs to the next day. */
function DayBar({ intervals, spans }) {
  const parts = [];
  if (spans) for (const s of spans) parts.push({ from: s.start, to: s.end, spill: false });
  else for (const iv of intervals ?? []) {
    if (!iv?.[0] || !iv?.[1]) continue;
    const a = minutes(iv[0]);
    const b = minutes(iv[1]);
    parts.push({ from: a, to: isOvernight(iv) ? 1440 : b, spill: isOvernight(iv) });
  }
  return (
    <div className={styles.bar} aria-hidden="true">
      {parts.map((p, i) => (
        <span key={i} className={styles.barFill} data-spill={p.spill || undefined} style={{ left: `${(p.from / 1440) * 100}%`, width: `${Math.max(((p.to - p.from) / 1440) * 100, 1.5)}%` }} />
      ))}
    </div>
  );
}

/** What customers will read on the shop page for this date, built from the same wording the shop page uses. */
function previewOf({ kind, intervals, note }) {
  const clean = (note ?? "").trim();
  if (kind === "closed") return { head: "Closed", detail: clean || null };
  const ok = (intervals ?? []).filter((iv) => iv?.[0] && iv?.[1]);
  const text = ok.map((iv) => `${formatClock(iv[0])} to ${formatClock(iv[1])}${isOvernight(iv) ? " (next day)" : ""}`).join(", ");
  return { head: "Special hours", detail: [text, clean].filter(Boolean).join(". ") || null, hours: ok };
}

/** What customers read on a day the break is on: the same status line the shop page builds, from the same code. */
function breakPreview({ hours, shape, times, note, today, shopZone, viewerZone }) {
  const sample = sampleDate(shape, today);
  const ok = times.filter((iv) => iv?.[0] && iv?.[1] && iv[0] < iv[1]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const dateLine = shape.mode === "weekly" && shape.date ? `${describeWeekdays(shape.weekdays)} from ${dayLabel(shape.date < today ? today : shape.date)}` : shape.mode === "range" && shape.date && shape.until ? `${dayLabel(shape.date)} to ${dayLabel(shape.until)}` : null;
  const timeText = ok.map((iv) => `${formatClock(iv[0])} to ${formatClock(iv[1])}`).join(", ");
  if (!sample || ok.length === 0 || !hours) return { dateLine, head: "Closed for a while", detail: [timeText, "Your normal hours apply around it."].filter(Boolean).join(". ") };
  const draft = [{ id: "draft", kind: "break", date: sample, until: null, weekdays: null, intervals: ok, note: note.trim() || null }];
  const during = statusOf(hours, draft, instantAt(sample, ok[0][0], shopZone), shopZone, viewerZone);
  const spans = openMinutesOn(hours, draft, sample);
  if (during.reason?.kind !== "on_break") {
    const name = DAY_FULL[weekdayOf(sample)];
    return { dateLine, head: "No change for customers", detail: `You are normally closed at that time on ${name}, so customers will see no change.`, spans };
  }
  const after = statusOf(hours, draft, instantAt(sample, ok[0][1], shopZone), shopZone, viewerZone);
  const back = after.isOpen ? `Open again at ${formatClock(ok[0][1])}${after.closesAt ? `, then until ${formatClock(after.closesAt)} as usual` : ""}.` : after.reopens ? `${after.reopens}.` : null;
  return { dateLine, head: during.line, detail: back, spans };
}

function ExceptionForm({ initial, existing, onSave, onCancel, shopZone, hours }) {
  const today = todayOf(shopZone);
  const wasBreak = initial?.kind === "break";
  const [date, setDate] = useState(initial ? (wasBreak && initial.date < today ? today : initial.date) : "");
  const [kind, setKind] = useState(initial?.kind ?? "closed");
  const [intervals, setIntervals] = useState(initial?.kind === "special" && initial.intervals?.length ? initial.intervals.map((i) => [...i]) : [["09:00", "17:00"]]);
  const [breakTimes, setBreakTimes] = useState(wasBreak && initial.intervals?.length ? initial.intervals.map((i) => [...i]) : [["13:00", "14:00"]]);
  const [mode, setMode] = useState(wasBreak ? (Array.isArray(initial.weekdays) ? "weekly" : initial.until ? "range" : "day") : "day");
  const [until, setUntil] = useState(initial?.until ?? "");
  const [weekdays, setWeekdays] = useState(wasBreak && Array.isArray(initial.weekdays) ? initial.weekdays : ["mon", "tue", "wed", "thu", "fri"]);
  const [endless, setEndless] = useState(!(wasBreak && Array.isArray(initial.weekdays) && initial.until));
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dateRef = useRef(null);
  useEffect(() => { dateRef.current?.focus(); }, []);

  const isBreak = kind === "break";
  const times = isBreak ? breakTimes : intervals;
  const setTimes = isBreak ? setBreakTimes : setIntervals;
  const setTime = (i, k, value) => setTimes(times.map((iv, n) => (n === i ? (k === 0 ? [value, iv[1]] : [iv[0], value]) : iv)));
  const lastDay = mode === "range" || (mode === "weekly" && !endless) ? until : "";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (isBreak && (mode === "range" || (mode === "weekly" && !endless)) && !until) return setError(errorText({ code: "until_required" }));
    const v = validateException({ date, kind, intervals: times, note, until: isBreak && lastDay ? lastDay : null, weekdays: isBreak && mode === "weekly" ? weekdays : null }, today);
    if (!v.ok) return setError(errorText({ code: v.error }));
    if (kind !== "break" && existing.some((x) => x.date === date && x.kind !== "break" && x.id !== initial?.id)) return setError(errorText({ code: "date_taken" }));
    setBusy(true);
    try {
      await onSave({ id: initial?.id ?? null, ...v.value });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const title = initial ? "Edit exception" : "Add an exception";
  const viewerZone = getUserTimeZone();
  const shape = { mode, date, until: lastDay, weekdays };
  const usual = isBreak && hours ? hoursRowsFor(hours, [], now(), shopZone) : [];
  const usualFor = (day) => usual.find((r) => r.day === day);
  const covered = isBreak && hours ? coveredWeekdays(shape) : [];
  const preview = isBreak ? breakPreview({ hours, shape, times: breakTimes, note, today, shopZone, viewerZone }) : previewOf({ kind, intervals, note });
  const converted = date
    ? describeExceptionForViewer({ date, kind, intervals: (times ?? []).filter((iv) => iv?.[0] && iv?.[1]) }, { shopZone, viewerZone })
    : null;
  const quickDates = [
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "Next Saturday", value: nextWeekday(today, 6) },
    { label: "Next Sunday", value: nextWeekday(today, 0) },
  ];
  const dateLabel = !isBreak || mode === "day" ? "Date" : mode === "range" ? "First day" : "Starting";
  return (
    <form className={`${ui.card} ${styles.form}`} onSubmit={submit} noValidate aria-labelledby="exc-form-title">
      <div className={styles.formMain}>
        <h2 id="exc-form-title">{title}</h2>

        <fieldset className={styles.fieldset}>
          <legend>What happens</legend>
          <div className={styles.choices}>
            <div className={styles.choice} data-on={kind === "closed" || undefined}>
              <label>
                <input type="radio" name="exc-kind" checked={kind === "closed"} onChange={() => setKind("closed")} />
                <strong>Closed all day</strong>
              </label>
              <small>Customers see you are closed.</small>
            </div>
            <div className={styles.choice} data-on={kind === "break" || undefined}>
              <label>
                <input type="radio" name="exc-kind" checked={kind === "break"} onChange={() => setKind("break")} />
                <strong>Closed for a while</strong>
              </label>
              <small>Closed at set times, like lunch. Normal hours apply around it.</small>
            </div>
            <div className={styles.choice} data-on={kind === "special" || undefined}>
              <label>
                <input type="radio" name="exc-kind" checked={kind === "special"} onChange={() => setKind("special")} />
                <strong>Different hours</strong>
              </label>
              <small>Open only at set times, instead of normal hours.</small>
            </div>
          </div>
        </fieldset>

        {isBreak && (
          <fieldset className={styles.fieldset}>
            <legend>How often</legend>
            <div className={styles.choices}>
              {MODES.map((m) => (
                <div key={m.id} className={styles.choice} data-on={mode === m.id || undefined}>
                  <label>
                    <input type="radio" name="exc-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                    <strong>{m.label}</strong>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className={ui.field}>
          <label className={ui.label} htmlFor="exc-date">{dateLabel}</label>
          <input
            ref={dateRef} id="exc-date" type="date" className={ui.input} value={date} min={today} max={addDays(today, EXCEPTION_MAX_DAYS_AHEAD)}
            onChange={(e) => setDate(e.target.value)} aria-invalid={error && !date ? true : undefined}
          />
          <div className={styles.chips}>
            {quickDates.map((q) => (
              <button key={q.label} type="button" className={styles.chip} data-on={date === q.value || undefined} onClick={() => setDate(q.value)}>{q.label}</button>
            ))}
          </div>
        </div>

        {isBreak && mode === "weekly" && (
          <fieldset className={styles.fieldset}>
            <legend>On these days</legend>
            <div className={styles.chips}>
              {BREAK_WEEKDAYS.map((d) => (
                <button
                  key={d} type="button" role="checkbox" aria-checked={weekdays.includes(d)} className={styles.chip} data-on={weekdays.includes(d) || undefined}
                  onClick={() => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                >{WEEKDAY_CHIPS[d]}</button>
              ))}
            </div>
            <div className={styles.chips}>
              <button type="button" role="checkbox" aria-checked={endless} className={styles.chip} data-on={endless || undefined} onClick={() => setEndless(!endless)}>Keep repeating until I remove it</button>
            </div>
          </fieldset>
        )}

        {isBreak && (mode === "range" || (mode === "weekly" && !endless)) && (
          <div className={ui.field}>
            <label className={ui.label} htmlFor="exc-until">Last day</label>
            <input id="exc-until" type="date" className={ui.input} value={until} min={date || today} max={addDays(today, EXCEPTION_MAX_DAYS_AHEAD)} onChange={(e) => setUntil(e.target.value)} />
          </div>
        )}

        {isBreak && (
          <fieldset className={styles.fieldset}>
            <legend>Closed times (up to {EXCEPTION_MAX_INTERVALS})</legend>
            <div className={styles.chips}>
              {BREAK_PRESETS.map((p) => (
                <button key={p.label} type="button" className={styles.chip} onClick={() => setBreakTimes(p.intervals.map((iv) => [...iv]))}>{p.label}</button>
              ))}
            </div>
            <p className={styles.count} data-testid="shop-time-hint">{shopTimeNote(new Date(), { shopZone, viewerZone })} Type the times as they are on the shop's clock.</p>
            {breakTimes.map((iv, i) => (
              <div key={i} className={styles.interval}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`exc-from-${i}`}>{i === 0 ? "Closed from" : `Break ${i + 1} from`}</label>
                  <input id={`exc-from-${i}`} type="time" className={ui.input} value={iv[0]} onChange={(e) => setTime(i, 0, e.target.value)} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`exc-to-${i}`}>{i === 0 ? "Until" : `Break ${i + 1} until`}</label>
                  <input id={`exc-to-${i}`} type="time" className={ui.input} value={iv[1]} onChange={(e) => setTime(i, 1, e.target.value)} />
                </div>
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={breakTimes.length === 1} onClick={() => setBreakTimes(breakTimes.filter((_, n) => n !== i))} aria-label={`Remove break ${i + 1}`}>Remove</button>
              </div>
            ))}
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} style={{ justifySelf: "start" }} disabled={breakTimes.length >= EXCEPTION_MAX_INTERVALS} onClick={() => setBreakTimes([...breakTimes, ["", ""]])}>Add another break</button>
            {covered.length > 0 && (
              <div role="group" aria-label="Your usual hours">
                <p className={styles.count}>Your usual hours</p>
                {covered.map((d) => (
                  <p key={d} className={styles.count}>{usualFor(d)?.name ?? d}: {usualFor(d)?.text ?? "Closed"}</p>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {kind === "special" && (
          <fieldset className={styles.fieldset}>
            <legend>Opening intervals (up to {EXCEPTION_MAX_INTERVALS})</legend>
            <div className={styles.chips}>
              {HOUR_PRESETS.map((p) => (
                <button key={p.label} type="button" className={styles.chip} onClick={() => setIntervals(p.intervals.map((iv) => [...iv]))}>{p.label}</button>
              ))}
            </div>
            <p className={styles.count} data-testid="shop-time-hint">{shopTimeNote(new Date(), { shopZone, viewerZone })} Type the times as they are on the shop's clock.</p>
            <p className={styles.count} id="exc-overnight-hint">
              Open past midnight? Set the closing time earlier than the opening time, for example 20:00 to 02:00. The hours after midnight count for the next day.
            </p>
            {intervals.map((iv, i) => (
              <div key={i}>
                <div className={styles.interval}>
                  <div className={ui.field}>
                    <label className={ui.label} htmlFor={`exc-open-${i}`}>Interval {i + 1} opens</label>
                    <input id={`exc-open-${i}`} type="time" className={ui.input} value={iv[0]} onChange={(e) => setTime(i, 0, e.target.value)} />
                  </div>
                  <div className={ui.field}>
                    <label className={ui.label} htmlFor={`exc-close-${i}`}>Interval {i + 1} closes</label>
                    <input id={`exc-close-${i}`} type="time" className={ui.input} value={iv[1]} onChange={(e) => setTime(i, 1, e.target.value)} />
                  </div>
                  <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={intervals.length === 1} onClick={() => setIntervals(intervals.filter((_, n) => n !== i))} aria-label={`Remove interval ${i + 1}`}>Remove</button>
                </div>
                {iv[0] && iv[1] && isOvernight(iv) && (
                  <p className={styles.count} data-testid={`overnight-${i}`}>
                    Closes at {iv[1]} on {nextDayLabel(date)}. {iv[0] === iv[1] ? "Open for 24 hours." : "The hours after midnight are part of this interval."}
                  </p>
                )}
              </div>
            ))}
            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} style={{ justifySelf: "start" }} disabled={intervals.length >= EXCEPTION_MAX_INTERVALS} onClick={() => setIntervals([...intervals, ["", ""]])}>Add another interval</button>
          </fieldset>
        )}

        <div className={ui.field}>
          <label className={ui.label} htmlFor="exc-note">Note (optional)</label>
          <input id="exc-note" className={ui.input} value={note} maxLength={EXCEPTION_NOTE_MAX} onChange={(e) => setNote(e.target.value)} aria-describedby="exc-note-count" />
          <div className={styles.chips}>
            {(isBreak ? BREAK_REASONS : REASONS).map((r) => (
              <button key={r} type="button" className={styles.chip} data-on={note === r || undefined} onClick={() => setNote(r)}>{r}</button>
            ))}
          </div>
          <span id="exc-note-count" className={styles.count}>{note.length} / {EXCEPTION_NOTE_MAX}. Customers may see this note.{isBreak ? " It replaces the words \"On break\" on your shop's status." : ""}</span>
        </div>

        {error && <p className={ui.error} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save"}</button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>

      <aside className={styles.preview} aria-label="What customers will see" data-kind={kind}>
        <p className={styles.previewLabel}>What customers will see</p>
        <p className={styles.previewDate}>{preview.dateLine ?? (date ? dayLabel(date) : "Pick a date")}</p>
        <p className={styles.previewHead}>{preview.head}</p>
        {(kind === "special" || preview.spans) && <DayBar intervals={preview.hours} spans={preview.spans} />}
        {preview.detail && <p className={styles.previewDetail}>{preview.detail}</p>}
        {converted?.shopText && <p className={styles.previewDetail} data-testid="preview-shop-time">{converted.shopText}</p>}
        {converted?.viewerText && <p className={styles.previewDetail} data-testid="preview-viewer-time">{converted.viewerText}</p>}
      </aside>
    </form>
  );
}

export default function Exceptions() {
  const qc = useQueryClient();
  const [form, setForm] = useState(null); // null | { initial }
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState("");
  const timers = useRef(new Map());
  const q = useQuery({ queryKey: ["exceptions"], queryFn: api.listExceptions });
  const refresh = () => qc.invalidateQueries({ queryKey: ["exceptions"] });
  useRealtime(["businesses"], refresh);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const shop = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false });
  const shopZone = safeShopZone(shop.data?.shop?.timezone);
  const today = todayOf(shopZone);
  const list = upcomingExceptions(q.data, today);
  const full = list.length >= EXCEPTION_LIMIT;
  const months = Object.entries(list.reduce((acc, e) => { (acc[monthKey(e.date < today ? today : e.date)] ??= []).push(e); return acc; }, {}));

  const dropToast = (key) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setToasts((t) => t.filter((x) => x.key !== key));
  };

  const save = async (value) => {
    await api.saveException(value);
    await refresh();
    setForm(null);
  };

  const remove = async (e) => {
    setError("");
    try {
      await api.deleteException(e.id);
    } catch (err) {
      return setError(errorText(err));
    }
    if (form?.initial?.id === e.id) setForm(null);
    await refresh();
    const key = `${e.id}-${Date.now()}`;
    setToasts((t) => [...t, { key, item: e }]);
    timers.current.set(key, setTimeout(() => dropToast(key), UNDO_MS));
  };

  const undo = async (toast) => {
    setError("");
    try {
      await api.saveException(toast.item);
      dropToast(toast.key);
      await refresh();
    } catch (err) {
      dropToast(toast.key);
      setError(`We could not restore the exception for ${dayLabel(toast.item.date)}. ${errorText(err)}`);
    }
  };

  const todayLabel = (d) => (d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : null);

  return (
    <div className={ui.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1>Opening exceptions</h1>
          <p className={styles.count} data-testid="exc-count">{list.length} of {EXCEPTION_LIMIT} upcoming</p>
          <div className={styles.meter} aria-hidden="true"><span style={{ width: `${Math.min(100, (list.length / EXCEPTION_LIMIT) * 100)}%` }} data-full={full || undefined} /></div>
        </div>
        <button type="button" className={ui.btn} onClick={() => setForm({ initial: null })} disabled={full || !!form}>Add exception</button>
      </div>
      <p className={ui.muted}>Days when you are closed or open at different times from your usual hours. Customers see these on your shop page. Dates that have passed are removed automatically.</p>

      {full && (
        <div className={styles.notice} role="status" data-testid="limit-notice">
          <p><strong>You have {EXCEPTION_LIMIT} upcoming exceptions, the most we can keep.</strong> Delete one you no longer need, or wait for a date to pass, and you can add another. You can still edit the ones you have.</p>
        </div>
      )}
      {error && <p className={ui.error} role="alert">{error}</p>}

      {form && <ExceptionForm key={form.initial?.id ?? "new"} shopZone={shopZone} hours={shop.data?.shop?.hours ?? null} initial={form.initial} existing={list} onSave={save} onCancel={() => setForm(null)} />}

      {q.isLoading ? (
        <p role="status">Loading</p>
      ) : q.error ? (
        <p className={ui.error} role="alert">We could not load your exceptions. Check your connection and refresh.</p>
      ) : list.length === 0 ? (
        <div className={styles.empty} data-testid="empty">
          <p><strong>No upcoming exceptions.</strong> Add one for a holiday, a stock take or an early close, so customers do not turn up to a locked door.</p>
        </div>
      ) : (
        months.map(([key, items]) => (
          <section key={key} className={styles.month} aria-label={monthTitle(`${key}-01`)}>
            <h2 className={styles.monthTitle}>{monthTitle(`${key}-01`)}</h2>
            <ul className={styles.list} aria-label={`Exceptions in ${monthTitle(`${key}-01`)}`}>
              {items.map((e) => (
                <li key={e.id} className={styles.row} data-kind={e.kind} data-testid="exception">
                  <div className={styles.leaf} aria-hidden="true">
                    <span className={styles.leafTop}>{WEEKDAYS[utc(e.date < today ? today : e.date).getUTCDay()]}</span>
                    <span className={styles.leafDay}>{Number((e.date < today ? today : e.date).slice(8))}</span>
                  </div>
                  <div className={styles.rowBody}>
                    <h3>
                      <span>{exceptionTitle(e)}</span>
                      {appliesToday(e, today) ? <span className={`${ui.pill} ${ui.tone_info}`}>Today</span> : todayLabel(e.date) && <span className={`${ui.pill} ${ui.tone_info}`}>{todayLabel(e.date)}</span>}
                    </h3>
                    <p>{describeException(e)}</p>
                    {exceptionSpan(e, today) && <p className={styles.when}>{exceptionSpan(e, today)}</p>}
                    {viewerLine(e, shopZone) && <p className={styles.when} data-testid="exception-viewer-time">{viewerLine(e, shopZone)}</p>}
                    {e.kind === "special" && <DayBar intervals={e.intervals} />}
                    {e.note && <p className={styles.note}>{e.note}</p>}
                    {relative(e.date, today) && <p className={styles.when}>{relative(e.date, today)}</p>}
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setForm({ initial: e })} aria-label={`Edit ${exceptionTitle(e)}`}>Edit</button>
                    <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => remove(e)} aria-label={`Delete ${exceptionTitle(e)}`}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <div className={styles.toasts} role="status" aria-live="polite" data-testid="toasts">
        {toasts.map((t) => (
          <div key={t.key} className={styles.toast}>
            <span>Exception for {dayLabel(t.item.date)} deleted.</span>
            <button type="button" className={styles.toastBtn} onClick={() => undo(t)}>Undo</button>
          </div>
        ))}
      </div>
    </div>
  );
}
