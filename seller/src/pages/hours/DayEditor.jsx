import { faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { MAX_INTERVALS, validateDay, mergedIntervals, endsNextDay, formatClock, toMinutes, DAY_MIN } from "@epicmkt/shared/hours";
import { Button, IconButton, Switch, TimeField } from "../../components/ui/index.js";
import { breaksOf, daySummary, newInterval } from "./format.js";
import styles from "./hours.module.css";

const TICKS = [0, 6, 12, 18, 24];

function Timeline({ day }) {
  const merged = mergedIntervals(day);
  return (
    <div className={styles.timeline} aria-hidden="true">
      <div className={styles.bar}>
        {day.open24 && !day.closed ? <span className={styles.seg} style={{ left: 0, width: "100%" }} /> : null}
        {!day.open24 && !day.closed
          ? merged.map((m) => {
              const s = toMinutes(m.start);
              const e = Math.min(m.endMinutes, DAY_MIN);
              return <span key={`${m.start}-${m.end}`} className={styles.seg} style={{ left: `${(s / DAY_MIN) * 100}%`, width: `${Math.max(0.6, ((e - s) / DAY_MIN) * 100)}%` }} />;
            })
          : null}
      </div>
      <div className={styles.ticks}>
        {TICKS.map((t) => (
          <span key={t}>{t === 24 ? "24" : String(t).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

export default function DayEditor({ day, onChange, idPrefix, closedLabel = "Closed", compact = false }) {
  const problems = validateDay(day);
  const dayProblems = problems.filter((p) => p.index == null);
  const byIndex = (i) => problems.filter((p) => p.index === i);
  const setClosed = (closed) => onChange({ ...day, closed, open24: closed ? false : day.open24, intervals: !closed && !day.open24 && day.intervals.length === 0 ? [newInterval([])] : day.intervals });
  const setOpen24 = (open24) => onChange({ ...day, open24, closed: open24 ? false : day.closed });
  const setInterval = (i, patch) => onChange({ ...day, intervals: day.intervals.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
  const remove = (i) => onChange({ ...day, intervals: day.intervals.filter((_, n) => n !== i) });
  const add = () => onChange({ ...day, intervals: [...day.intervals, newInterval(day.intervals)] });
  const breaks = breaksOf(day);
  const editing = !day.closed && !day.open24;

  return (
    <div className={styles.dayBody}>
      <div className={styles.toggles}>
        <Switch checked={day.closed} onChange={setClosed} label={closedLabel} />
        <Switch checked={day.open24 && !day.closed} onChange={setOpen24} label="Open 24 hours" disabled={day.closed} />
      </div>

      {editing && (
        <ol className={styles.intervals}>
          {day.intervals.map((interval, i) => {
            const errs = byIndex(i);
            const errId = `${idPrefix}-err-${i}`;
            const invalid = errs.length > 0;
            return (
              <li key={i} className={styles.interval}>
                <div className={styles.intervalHead}>
                  <span className={styles.intervalName}>Opening time {i + 1}</span>
                  <IconButton icon={faTrashCan} label={`Remove opening time ${i + 1}`} onClick={() => remove(i)} />
                </div>
                <div className={styles.timeGrid}>
                  <TimeField label="Opens" value={interval.start} onChange={(v) => setInterval(i, { start: v })} invalid={invalid} describedBy={invalid ? errId : undefined} />
                  <TimeField label="Closes" value={interval.end} onChange={(v) => setInterval(i, { end: v })} invalid={invalid} describedBy={invalid ? errId : undefined} />
                </div>
                {endsNextDay(interval) && !errs.some((e) => e.code === "same_time") && <p className={styles.hint}>Ends next day</p>}
                {invalid && (
                  <p id={errId} className={styles.error} role="alert">
                    {errs.map((e) => e.message).join(" ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <div className={styles.addRow}>
          <Button icon={faPlus} size="sm" onClick={add} disabled={day.intervals.length >= MAX_INTERVALS}>
            Add opening time
          </Button>
          {day.intervals.length >= MAX_INTERVALS && <span className={styles.hint}>Up to {MAX_INTERVALS} opening times per day</span>}
        </div>
      )}

      {dayProblems.length > 0 && (
        <p className={styles.error} role="alert">
          {dayProblems.map((p) => p.message).join(" ")}
        </p>
      )}

      {!compact && <Timeline day={day} />}
      <p className={styles.summary}>
        <span className={styles.summaryLabel}>Customers see</span> {daySummary(day)}
      </p>
      {breaks.length > 0 && (
        <p className={styles.hint}>
          {breaks.map((b) => `${b.label} ${formatClock(b.start)} to ${formatClock(b.end)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
