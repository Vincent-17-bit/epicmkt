import { forwardRef } from "react";
import { cx } from "./cx.js";
import styles from "./IconButton.module.css";

/**
 * An icon-only button. `aria-label` is required: without it a screen reader announces just "button".
 * In development a missing label throws; in production it logs so the page still renders.
 * variant: ghost | secondary | primary | danger | inverse (for toasts)     size: sm | md
 */
export const IconButton = forwardRef(function IconButton(
  { icon, "aria-label": ariaLabel, variant = "ghost", size = "md", type = "button", loading = false, onClick, className, title, ...rest },
  ref,
) {
  if (!ariaLabel || !String(ariaLabel).trim()) {
    const message = "IconButton needs an aria-label that says what it does, for example aria-label=\"Close\".";
    if (import.meta.env?.DEV) throw new Error(message);
    console.error(message);
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.root, styles[variant], styles[size], className)}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      title={title ?? ariaLabel}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      <span className={styles.icon} aria-hidden="true">
        {loading ? <span className={styles.spinner} /> : icon}
      </span>
    </button>
  );
});
