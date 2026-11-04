import styles from "./Field.module.css";

/** A label wrapped around one control: the label text above, the control (and any message) below. */
export default function Field({ label, className = "", children, ...rest }) {
  return (
    <label className={`${styles.field} ${className}`} {...rest}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}
