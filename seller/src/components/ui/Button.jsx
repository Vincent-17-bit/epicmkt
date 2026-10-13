import { forwardRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./Button.module.css";

const Button = forwardRef(function Button({ variant = "secondary", size = "md", icon, busy = false, className = "", children, disabled, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon ? <FontAwesomeIcon icon={icon} aria-hidden="true" /> : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
});

export default Button;
