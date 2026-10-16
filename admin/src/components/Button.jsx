import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function Button({ variant = "secondary", size, icon, className = "", type = "button", children, ...rest }) {
  const classes = [
    "admin-button",
    variant === "primary" ? "primary-button" : "secondary-button",
    size === "sm" ? "admin-button--sm" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <FontAwesomeIcon icon={icon} /> : null}
      {children}
    </button>
  );
}
