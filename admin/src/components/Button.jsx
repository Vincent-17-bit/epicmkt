import { forwardRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const VARIANTS = { primary: "admin-button--primary", danger: "admin-button--danger", ghost: "admin-button--ghost" };

/**
 * `size` is kept for call-site compatibility: every button now meets the 44px
 * touch target, so "sm" no longer shrinks it.
 */
const Button = forwardRef(function Button({ variant = "secondary", size, icon, className = "", type = "button", children, ...rest }, ref) {
  const iconOnly = icon && !children;
  const classes = ["admin-button", VARIANTS[variant], iconOnly && "admin-button--icon", className].filter(Boolean).join(" ");

  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {icon ? <FontAwesomeIcon icon={icon} className="admin-icon" /> : null}
      {children}
    </button>
  );
});

export default Button;
