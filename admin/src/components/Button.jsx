import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const VARIANTS = { primary: "admin-button--primary", danger: "admin-button--danger", ghost: "admin-button--ghost" };

/**
 * `size` is kept for call-site compatibility: every button now meets the 44px
 * touch target, so "sm" no longer shrinks it.
 */
// eslint-disable-next-line no-unused-vars
export default function Button({ variant = "secondary", size, icon, className = "", type = "button", children, ...rest }) {
  const iconOnly = icon && !children;
  const classes = ["admin-button", VARIANTS[variant], iconOnly && "admin-button--icon", className].filter(Boolean).join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <FontAwesomeIcon icon={icon} className="admin-icon" /> : null}
      {children}
    </button>
  );
}
