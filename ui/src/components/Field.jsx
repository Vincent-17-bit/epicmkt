import styles from "./Field.module.css";

/**
 * A label above one control (and any message below it).
 * By default the label wraps the control, so clicking the text focuses it. A control that holds more than one button or input
 * (the phone number with its country picker) must not be wrapped: pass as="div" and htmlFor, the id of the control to name.
 */
export default function Field({ label, className = "", children, as: Tag = "label", htmlFor, ...rest }) {
  if (Tag === "div") {
    return (
      <div className={`${styles.field} ${className}`} {...rest}>
        <label className={styles.label} htmlFor={htmlFor}>{label}</label>
        {children}
      </div>
    );
  }
  return (
    <label className={`${styles.field} ${className}`} {...rest}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}
