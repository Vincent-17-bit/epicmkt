import { useId } from "react";
import styles from "./Switch.module.css";

export default function Switch({ checked, onChange, label, disabled = false, className = "" }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`${styles.wrap} ${disabled ? styles.disabled : ""} ${className}`}>
      <input id={id} type="checkbox" role="switch" className={styles.input} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={styles.text}>{label}</span>
    </label>
  );
}
