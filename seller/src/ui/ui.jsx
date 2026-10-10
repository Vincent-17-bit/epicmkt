import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./ui.module.css";
import { useToasts } from "./toasts.js";

const cx = (...c) => c.filter(Boolean).join(" ");

// Label, hint, error and a live character counter around one control. children receives the props to spread on it.
export function Field({ label, hint, error, count, max, children, className, optional }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      <div className={styles.meta}>
        <span>
          {hint && <span id={hintId} className={styles.hint}>{hint}</span>}
          {error && <span id={errId} role="alert" className={styles.error}>{error}</span>}
        </span>
        {max ? <span className={cx(styles.count, count > max && styles.error)} aria-hidden="true">{count}/{max}</span> : null}
      </div>
    </div>
  );
}

export function TextInput({ value, onChange, maxLength, ...rest }) {
  return <input className={styles.input} type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function TextArea({ value, onChange, rows = 3, ...rest }) {
  return <textarea className={styles.input} rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// Whole numbers only. Typing anything but digits is ignored, so cents and minus signs cannot be entered.
export function NumberInput({ value, onChange, ...rest }) {
  return (
    <input
      className={styles.input}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value ?? ""}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
        onChange(digits === "" ? null : Number(digits));
      }}
      {...rest}
    />
  );
}

export function SelectInput({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select className={styles.input} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
}

export function DateInput({ value, onChange, ...rest }) {
  return <input className={styles.input} type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Toggle({ checked, onChange, label, ...rest }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx(styles.switch, checked && styles.on)} onClick={() => onChange(!checked)} {...rest}>
      <span className={styles.knob} />
    </button>
  );
}

export function CheckRow({ checked, onChange, label, hint }) {
  const id = useId();
  return (
    <div className={styles.checkRow}>
      <input id={id} type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}{hint && <span className={styles.hint}> {hint}</span>}</label>
    </div>
  );
}

export function Chips({ values, onChange, max, maxLength, label, error, placeholder = "Type and press Enter" }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && (!max || next.length < max)) next.push(p.slice(0, maxLength ?? 60));
    onChange(next);
    setDraft("");
  };
  return (
    <div>
      <ul className={styles.chips} aria-label={label}>
        {values.map((v, i) => (
          <li key={v} className={styles.chip}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, k) => k !== i))}><FontAwesomeIcon icon={faXmark} /></button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        className={styles.input}
        type="text"
        value={draft}
        placeholder={placeholder}
        aria-label={`Add to ${label}`}
        aria-invalid={error ? true : undefined}
        disabled={max ? values.length >= max : false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); e.stopPropagation(); add(); }
          else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

// A list of rows with add and remove. renderRow(item, patch) draws the inputs for one row.
export function RowList({ items, onChange, blank, renderRow, addLabel, max, label, errors = {} }) {
  const update = (i, patch) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  return (
    <div className={styles.rowList}>
      {items.map((it, i) => (
        <div key={it.id ?? i} className={styles.rowItem} role="group" aria-label={`${label} ${i + 1}`}>
          <div className={styles.rowFields}>{renderRow(it, (patch) => update(i, patch), i, errors)}</div>
          <button type="button" className={styles.iconBtn} aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
      ))}
      {(!max || items.length < max) && (
        <button type="button" className={styles.addBtn} onClick={() => onChange([...items, blank()])}>
          <FontAwesomeIcon icon={faPlus} /> {addLabel}
        </button>
      )}
    </div>
  );
}

export function StringList({ items, onChange, addLabel, max, label, placeholder, maxLength = 80, errors = {} }) {
  return (
    <div className={styles.rowList}>
      {items.map((v, i) => (
        <div key={i} className={styles.rowItem}>
          <input
            className={styles.input}
            type="text"
            value={v}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            aria-invalid={errors[i] ? true : undefined}
            onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
          />
          <button type="button" className={styles.iconBtn} aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
      ))}
      {(!max || items.length < max) && (
        <button type="button" className={styles.addBtn} onClick={() => onChange([...items, ""])}>
          <FontAwesomeIcon icon={faPlus} /> {addLabel}
        </button>
      )}
    </div>
  );
}

export function Button({ variant = "secondary", className, ...rest }) {
  return <button type="button" className={cx(styles.btn, styles[variant], className)} {...rest} />;
}

export function Modal({ open, onClose, title, children, actions, labelledBy }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={labelledBy ?? id} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {open && (
        <div className={styles.dialogBody}>
          <h2 id={labelledBy ?? id} className={styles.dialogTitle}>{title}</h2>
          {children}
          {actions && <div className={styles.dialogActions}>{actions}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className={styles.toaster} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx(styles.toast, t.tone === "error" && styles.toastError)}>
          <span>{t.message}</span>
          {t.actionLabel && (
            <button type="button" onClick={() => { dismiss(t.id); t.onAction?.(); }}>{t.actionLabel}</button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
      ))}
    </div>
  );
}

export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, [query]);
  return matches;
}
