import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXCEPTION_LIMIT, EXCEPTION_MAX_DAYS_AHEAD, EXCEPTION_MAX_INTERVALS, EXCEPTION_NOTE_MAX,
  addDays, dayLabel, describeException, formatClock, isOvernight, upcomingExceptions, validateException,
} from "@epicmkt/shared";
import { dayOf } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { now } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import { useRealtime } from "../../lib/useRealtime.js";
import ui from "../../styles/ui.module.css";
import styles from "./exceptions.module.css";

export const UNDO_MS = 8000;
const todayOf = () => dayOf(now());
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
const HOUR_PRESETS = [
  { label: "Mornings only", intervals: [["08:00", "13:00"]] },
  { label: "Afternoons only", intervals: [["13:00", "18:00"]] },
  { label: "Open late", intervals: [["20:00", "02:00"]] },
];

/** A 24 hour strip: the filled parts are when the shop is open. Overnight hours stop at midnight; the rest belongs to the next day. */
function DayBar({ intervals }) {
  const parts = [];
  for (const iv of intervals ?? []) {
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

function ExceptionForm({ initial, existing, onSave, onCancel }) {
  const today = todayOf();
  const [date, setDate] = useState(initial?.date ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "closed");
  const [intervals, setIntervals] = useState(initial?.intervals?.length ? initial.intervals.map((i) => [...i]) : [["09:00", "17:00"]]);
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dateRef = useRef(null);
  useEffect(() => { dateRef.current?.focus(); }, []);

  const setTime = (i, k, value) => setIntervals(intervals.map((iv, n) => (n === i ? (k === 0 ? [value, iv[1]] : [iv[0], value]) : iv)));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const v = validateException({ date, kind, intervals, note }, today);
    if (!v.ok) return setError(errorText({ code: v.error }));
    if (existing.some((x) => x.date === date && x.id !== initial?.id)) return setError(errorText({ code: "date_taken" }));
    setBusy(true);
    try {
      await onSave({ id: initial?.id ?? null, ...v.value });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const title = initial ? "Edit exception" : "Add an exception";
  const preview = previewOf({ kind, intervals, note });
  const quickDates = [
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "Next Saturday", value: nextWeekday(today, 6) },
    { label: "Next Sunday", value: nextWeekday(today, 0) },
  ];
  return (
    <form className={`${ui.card} ${styles.form}`} onSubmit={submit} noValidate aria-labelledby="exc-form-title">
      <div className={styles.formMain}>
        <h2 id="exc-form-title">{title}</h2>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="exc-date">Date</label>
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

        <fieldset className={styles.fieldset}>
          <legend>What happens that day</legend>
          <div className={styles.choices}>
            <div className={styles.choice} data-on={kind === "closed" || undefined}>
              <label>
                <input type="radio" name="exc-kind" checked={kind === "closed"} onChange={() => setKind("closed")} />
                <strong>Closed all day</strong>
              </label>
              <small>Customers see you are closed.</small>
            </div>
            <div className={styles.choice} data-on={kind === "special" || undefined}>
              <label>
                <input type="radio" name="exc-kind" checked={kind === "special"} onChange={() => setKind("special")} />
                <strong>Special hours</strong>
              </label>
              <small>Open at different times.</small>
            </div>
          </div>
        </fieldset>

        {kind === "special" && (
          <fieldset className={styles.fieldset}>
            <legend>Opening intervals (up to {EXCEPTION_MAX_INTERVALS})</legend>
            <div className={styles.chips}>
              {HOUR_PRESETS.map((p) => (
                <button key={p.label} type="button" className={styles.chip} onClick={() => setIntervals(p.intervals.map((iv) => [...iv]))}>{p.label}</button>
              ))}
            </div>
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
            {REASONS.map((r) => (
              <button key={r} type="button" className={styles.chip} data-on={note === r || undefined} onClick={() => setNote(r)}>{r}</button>
            ))}
          </div>
          <span id="exc-note-count" className={styles.count}>{note.length} / {EXCEPTION_NOTE_MAX}. Customers may see this note.</span>
        </div>

        {error && <p className={ui.error} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save"}</button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>

      <aside className={styles.preview} aria-label="What customers will see" data-kind={kind}>
        <p className={styles.previewLabel}>What customers will see</p>
        <p className={styles.previewDate}>{date ? dayLabel(date) : "Pick a date"}</p>
        <p className={styles.previewHead}>{preview.head}</p>
        {kind === "special" && <DayBar intervals={preview.hours} />}
        {preview.detail && <p className={styles.previewDetail}>{preview.detail}</p>}
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

  const today = todayOf();
  const list = upcomingExceptions(q.data, today);
  const full = list.length >= EXCEPTION_LIMIT;
  const months = Object.entries(list.reduce((acc, e) => { (acc[monthKey(e.date)] ??= []).push(e); return acc; }, {}));

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

      {form && <ExceptionForm key={form.initial?.id ?? "new"} initial={form.initial} existing={list} onSave={save} onCancel={() => setForm(null)} />}

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
                    <span className={styles.leafTop}>{WEEKDAYS[utc(e.date).getUTCDay()]}</span>
                    <span className={styles.leafDay}>{Number(e.date.slice(8))}</span>
                  </div>
                  <div className={styles.rowBody}>
                    <h3>
                      <span>{dayLabel(e.date)}</span>
                      {todayLabel(e.date) && <span className={`${ui.pill} ${ui.tone_info}`}>{todayLabel(e.date)}</span>}
                    </h3>
                    <p>{describeException(e)}</p>
                    {e.kind === "special" && <DayBar intervals={e.intervals} />}
                    {e.note && <p className={styles.note}>{e.note}</p>}
                    {relative(e.date, today) && <p className={styles.when}>{relative(e.date, today)}</p>}
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setForm({ initial: e })} aria-label={`Edit ${dayLabel(e.date)}`}>Edit</button>
                    <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => remove(e)} aria-label={`Delete ${dayLabel(e.date)}`}>Delete</button>
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
