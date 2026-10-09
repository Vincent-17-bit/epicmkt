import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { passwordChecklist, passwordStrength } from "../lib/password.js";
import styles from "./auth.module.css";

export function TextField({ label, error, hint, className = "", ...rest }) {
  const id = useId();
  return (
    <div className={`${styles.field} ${className}`}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <input id={id} className={styles.input} aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
      {hint && !error && <p id={`${id}-h`} className={styles.hint}>{hint}</p>}
      {error && <p id={`${id}-e`} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

export function PasswordField({ label, error, hint, autoComplete = "current-password", ...rest }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.inputWrap}>
        <input id={id} className={styles.input} type={shown ? "text" : "password"} autoComplete={autoComplete} aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
        <button type="button" className={styles.toggle} onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
          <FontAwesomeIcon icon={shown ? faEyeSlash : faEye} aria-hidden="true" />
        </button>
      </div>
      {hint && !error && <p id={`${id}-h`} className={styles.hint}>{hint}</p>}
      {error && <p id={`${id}-e`} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

export function OtpField({ value, onChange, error, disabled }) {
  return (
    <TextField
      label="6-digit code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      pattern="[0-9]{6}"
      error={error}
      disabled={disabled}
      className={styles.otp}
    />
  );
}

export function StrengthMeter({ password, context }) {
  const { level, label } = passwordStrength(password, context);
  return (
    <div className={styles.strength} data-level={level}>
      <div className={styles.bars} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= level ? styles.barOn : styles.bar} />
        ))}
      </div>
      <p className={styles.strengthLabel} aria-live="polite">{label ? `Password strength: ${label}` : "Password strength"}</p>
    </div>
  );
}

export function Checklist({ password, context }) {
  const items = passwordChecklist(password, context);
  return (
    <ul className={styles.checklist} aria-label="Password rules">
      {items.map((i) => (
        <li key={i.key} className={i.ok ? styles.ok : styles.todo} data-ok={i.ok ? "true" : "false"}>
          <span aria-hidden="true">{i.ok ? "✓" : "○"}</span>
          <span>{i.label}</span>
          <span className={styles.srOnly}>{i.ok ? " (done)" : " (needed)"}</span>
        </li>
      ))}
    </ul>
  );
}

export function NewPassword({ password, confirm, onPassword, onConfirm, context, error }) {
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <PasswordField label="New password" value={password} onChange={(e) => onPassword(e.target.value)} autoComplete="new-password" error={error} />
      <StrengthMeter password={password} context={context} />
      <Checklist password={password} context={context} />
      <PasswordField label="Confirm new password" value={confirm} onChange={(e) => onConfirm(e.target.value)} autoComplete="new-password" error={mismatch ? "Passwords do not match." : undefined} />
    </>
  );
}
