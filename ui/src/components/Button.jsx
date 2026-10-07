import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./Button.module.css";

export default function Button({
  as: Tag = "button",
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  className = "",
  children,
  ...rest
}) {
  const props = Tag === "button" ? { type: "button", ...rest } : rest;
  return (
    <Tag className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`} {...props}>
      {icon && <FontAwesomeIcon icon={icon} className={styles.iconLeft} />}
      <span>{children}</span>
      {iconRight && <FontAwesomeIcon icon={iconRight} className={styles.iconRight} />}
    </Tag>
  );
}
