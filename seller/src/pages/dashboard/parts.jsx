import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./dashboard.module.css";

const STAGES = ["Applied", "Reviewed", "Approved", "Paid", "Live"];
const INDEX = { applied: 0, reviewed: 1, approved: 2, paid: 3, live: 4 };

export function Card({ title, id, children, className = "", action }) {
  return (
    <section className={`${styles.card} ${className}`} aria-labelledby={id}>
      <div className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children, to, cta }) {
  return (
    <div className={styles.empty}>
      <p>{children}</p>
      {to && <Link to={to} className={styles.linkBtn}>{cta}</Link>}
    </div>
  );
}

export function Stepper({ stage, outcome }) {
  const current = INDEX[stage] ?? 0;
  return (
    <div>
      <ol className={styles.stepper} aria-label="Listing progress">
        {STAGES.map((label, i) => (
          <li key={label} className={styles.step} data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
            <span className={styles.stepDot} aria-hidden="true">{i < current ? "✓" : i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </li>
        ))}
      </ol>
      {outcome === "changes_requested" && <p className={styles.callout}>The EpicMKT team asked for changes to your application.</p>}
      {outcome === "rejected" && <p className={styles.calloutDanger}>Your application was not approved.</p>}
    </div>
  );
}

export function Ring({ score }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={styles.ring} role="img" aria-label={`Listing health ${score} percent`}>
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className={styles.ringTrack} />
        <circle cx="60" cy="60" r={r} className={styles.ringBar} strokeDasharray={c} strokeDashoffset={c - (c * shown) / 100} transform="rotate(-90 60 60)" />
      </svg>
      <span className={styles.ringText}>{score}%</span>
    </div>
  );
}

export function TodoList({ title, tone, items, emptyText }) {
  return (
    <div className={styles.todo}>
      <h3 className={`${styles.todoTitle} ${tone === "blocking" ? styles.blocking : styles.recommended}`}>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.muted}>{emptyText}</p>
      ) : (
        <ul className={styles.todoList}>
          {items.map((i) => (
            <li key={i.key}>
              <Link to={i.to} className={styles.todoItem}>{i.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Meter({ label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = limit > 0 && used >= limit;
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span>{label}</span>
        <span className={styles.muted}>{used} of {limit}</span>
      </div>
      <div className={styles.meterTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <span className={full ? styles.meterFull : styles.meterFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
