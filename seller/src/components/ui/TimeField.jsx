import { useId } from "react";
import { snapTime, STEP } from "@epicmkt/shared/hours";
import styles from "./TimeField.module.css";

export default function TimeField({ label, value, onChange, invalid = false, describedBy, hideLabel = false, className = "", ...rest }) {
  const id = useId();
  return (
    <div className={`${styles.field} ${className}`}>
      <label htmlFor={id} className={hideLabel ? styles.srOnly : styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="time"
        step={STEP * 60}
        className={`${styles.input} ${invalid ? styles.invalid : ""}`}
        value={value ?? ""}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const snapped = snapTime(e.target.value);
          if (snapped !== e.target.value) onChange(snapped);
        }}
        {...rest}
      />
    </div>
  );
}
