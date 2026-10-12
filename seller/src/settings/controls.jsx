import { useEffect, useId, useState } from "react";
import styles from "./settings.module.css";

export function Section({ id, title, intro, children }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={styles.sectionTitle}>{title}</h2>
      {intro && <p className={styles.intro}>{intro}</p>}
      <div className={styles.rows}>{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, stack, id }) {
  return (
    <div className={styles.row} data-stack={stack ? "true" : undefined}>
      <div className={styles.rowText}>
        <p className={styles.rowLabel} id={id}>{label}</p>
        {hint && <p className={styles.rowHint}>{hint}</p>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, describedBy }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={describedBy} disabled={disabled} className={styles.switch} onClick={() => onChange(!checked)}>
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={styles.segBtn} onClick={() => value !== o.value && onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label, disabled }) {
  return (
    <select className={styles.select} value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// A text box that saves when you leave it or press Enter, and shows why a value is not accepted.
export function CommitField({ label, value, onCommit, validate, multiline, maxLength, hint, placeholder, disabled, type = "text", inputMode, rows = 3, liveError, counter, onDraft }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(null);
  useEffect(() => { setDraft(value); setError(null); onDraft?.(value); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const problem = validate ? validate(draft) : null;
  const shown = error ?? (liveError && draft !== value ? problem : null);
  const commit = () => {
    if (draft === value) { setError(null); return; }
    const p = validate ? validate(draft) : null;
    if (p) { setError(p); return; }
    setError(null);
    onCommit(draft);
  };
  const common = {
    id, value: draft, maxLength: undefined, placeholder, disabled, inputMode,
    className: multiline ? styles.textarea : styles.input,
    "aria-invalid": shown ? "true" : undefined,
    "aria-describedby": shown ? `${id}-e` : hint ? `${id}-h` : undefined,
    onChange: (e) => { setDraft(e.target.value); onDraft?.(e.target.value); if (error) setError(null); },
    onBlur: commit
  };
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
      {multiline ? <textarea rows={rows} {...common} /> : <input type={type} {...common} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />}
      {counter && <p className={styles.counter} aria-live="off">{draft.length} / {maxLength}</p>}
      {hint && !shown && <p id={`${id}-h`} className={styles.rowHint}>{hint}</p>}
      {shown && <p id={`${id}-e`} className={styles.error} role="alert">{shown}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}
