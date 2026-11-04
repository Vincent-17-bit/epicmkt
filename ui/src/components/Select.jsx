import styles from "./Select.module.css";

/**
 * A native select. `variant="form"` is the one inside dialogs (inherits the page font). `variant="filter"` is the
 * one in a row of filters (the browser's own select font, medium weight, a visible focus ring).
 */
export default function Select({ variant = "form", className = "", children, ...rest }) {
  return (
    <select className={`${styles.select} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </select>
  );
}
