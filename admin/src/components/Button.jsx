import { forwardRef } from "react";
import { cx } from "./cx.js";
import styles from "./Button.module.css";

/**
 * variant: primary | secondary | ghost | danger     size: sm | md | lg
 * loading keeps the button focusable (aria-disabled, aria-busy) so keyboard focus is not lost when an
 * action starts; clicks are ignored while it is loading. `disabled` uses the real attribute.
 */
export const Button = forwardRef(function Button(
  { variant = "secondary", size = "md", loading = false, icon = null, iconRight = null, type = "button", disabled = false, onClick, className, children, ...rest },
  ref,
) {
  const handleClick = (event) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.root, styles[variant], styles[size], loading && styles.loading, className)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
      {children != null && <span className={styles.label}>{children}</span>}
      {iconRight && !loading ? <span className={styles.icon} aria-hidden="true">{iconRight}</span> : null}
    </button>
  );
});
