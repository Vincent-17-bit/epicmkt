import { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye } from "@fortawesome/free-solid-svg-icons";
import { useAutosize } from "./hooks.js";
import styles from "./editor.module.css";

// A button that is only an icon. It always carries its name (aria-label and a tooltip) and a 44px target.
export function IconBtn({ icon, label, tone, className = "", ...rest }) {
  return (
    <button type="button" className={`${styles.iconBtn} ${tone === "danger" ? styles.iconDanger : ""} ${className}`} aria-label={label} title={label} {...rest}>
      <FontAwesomeIcon icon={icon} aria-hidden="true" />
    </button>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true"><FontAwesomeIcon icon={icon} /></span>
      <div className={styles.emptyText}>
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
      {action}
    </div>
  );
}

// One section of the form: what it is, why it matters, and whether it can be skipped.
export function SectionCard({ id, title, why, required, children }) {
  return (
    <section id={`sec-${id}`} className={styles.card} aria-labelledby={`sec-${id}-title`} data-step={id}>
      <header className={styles.cardHead}>
        <div className={styles.cardTitles}>
          <h2 id={`sec-${id}-title`} className={styles.cardTitle} tabIndex={-1}>{title}</h2>
          <p className={styles.why}>{why}</p>
        </div>
        <span className={`${styles.badge} ${required ? styles.badgeReq : styles.badgeOpt}`}>{required ? "Required" : "Optional"}</span>
      </header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

// A running count. The visible number is decoration; only the last few characters are announced, so typing is not noisy.
export function Counter({ length, max }) {
  const left = max - length;
  return (
    <>
      <span className={`${styles.counter} ${left <= Math.min(20, max * 0.1) ? styles.counterLow : ""}`} aria-hidden="true">{length}/{max}</span>
      <span className={styles.sr} role="status">{left <= 10 ? `${left} ${left === 1 ? "character" : "characters"} left` : ""}</span>
    </>
  );
}

/**
 * A labelled control with its hint, count and error wired together.
 *   name     the form key, also the data-focus key the editor uses to put the cursor here
 *   area     which part of the live preview lights up while this field is focused
 *   seen     "Customers see this here" line
 */
export function Field({ name, label, hint, seen, error, max, value, as = "input", area, className = "", children, ...control }) {
  const uid = useId();
  const id = `${uid}-${name}`;
  const hintId = hint ? `${id}-hint` : null;
  const errId = error ? `${id}-err` : null;
  const grow = useAutosize(value);
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const props = { id, className: styles.input, value, "aria-invalid": error ? "true" : undefined, "aria-describedby": describedBy, "data-focus": name, maxLength: max, ...control };
  let input;
  if (as === "textarea") input = <textarea ref={grow} rows={3} {...props} />;
  else if (as === "select") input = <select {...props} maxLength={undefined}>{children}</select>;
  else input = <input {...props} />;
  return (
    <div className={`${styles.field} ${className}`} data-area={area}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {input}
      {(hint || (max && as !== "select")) && (
        <div className={styles.noteRow}>
          {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
          {max && as !== "select" && <Counter length={String(value ?? "").length} max={max} />}
        </div>
      )}
      {seen && <p className={styles.seen}><FontAwesomeIcon icon={faEye} aria-hidden="true" /> <span>{seen}</span></p>}
      {error && <p id={errId} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

export function CheckRow({ checked, onChange, children, ...rest }) {
  return (
    <label className={styles.checkRow}>
      <input type="checkbox" checked={checked} onChange={onChange} {...rest} />
      <span>{children}</span>
    </label>
  );
}
