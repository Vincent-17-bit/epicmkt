import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXCEPTION_LIMIT, EXCEPTION_MAX_DAYS_AHEAD, EXCEPTION_MAX_INTERVALS, EXCEPTION_NOTE_MAX,
  addDays, dayLabel, describeException, isOvernight, upcomingExceptions, validateException,
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
  return (
    <form className={ui.card} onSubmit={submit} noValidate aria-labelledby="exc-form-title">
      <h2 id="exc-form-title">{title}</h2>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="exc-date">Date</label>
        <input
          ref={dateRef} id="exc-date" type="date" className={ui.input} value={date} min={today} max={addDays(today, EXCEPTION_MAX_DAYS_AHEAD)}
          onChange={(e) => setDate(e.target.value)} aria-invalid={error && !date ? true : undefined}
        />
      </div>

      <fieldset className={styles.fieldset}>
        <legend>What happens that day</legend>
        <div className={styles.radios}>
          <label className={styles.radio}><input type="radio" name="exc-kind" checked={kind === "closed"} onChange={() => setKind("closed")} />Closed all day</label>
          <label className={styles.radio}><input type="radio" name="exc-kind" checked={kind === "special"} onChange={() => setKind("special")} />Special hours</label>
        </div>
      </fieldset>

      {kind === "special" && (
        <fieldset className={styles.fieldset}>
          <legend>Opening intervals (up to {EXCEPTION_MAX_INTERVALS})</legend>
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
        <span id="exc-note-count" className={styles.count}>{note.length} / {EXCEPTION_NOTE_MAX}. Customers may see this note.</span>
      </div>

      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save"}</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
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
        </div>
        <button type="button" className={ui.btn} onClick={() => setForm({ initial: null })} disabled={full || !!form}>Add exception</button>
      </div>
      <p className={ui.muted}>Days when you are closed or open at different times from your usual hours. Dates that have passed are removed automatically.</p>

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
        <p className={ui.muted} data-testid="empty">No upcoming exceptions. Add one for a holiday, a stock take or an early close.</p>
      ) : (
        <ul className={styles.list} aria-label="Upcoming exceptions">
          {list.map((e) => (
            <li key={e.id} className={styles.row} data-kind={e.kind} data-testid="exception">
              <div>
                <h2>
                  <span>{dayLabel(e.date)}</span>
                  {todayLabel(e.date) && <span className={`${ui.pill} ${ui.tone_info}`}>{todayLabel(e.date)}</span>}
                </h2>
                <p>{describeException(e)}</p>
                {e.note && <p className={styles.note}>{e.note}</p>}
              </div>
              <div className={styles.actions}>
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setForm({ initial: e })} aria-label={`Edit ${dayLabel(e.date)}`}>Edit</button>
                <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => remove(e)} aria-label={`Delete ${dayLabel(e.date)}`}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
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
