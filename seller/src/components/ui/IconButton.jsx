import { forwardRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./IconButton.module.css";

const IconButton = forwardRef(function IconButton({ icon, label, className = "", ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} title={label} className={`${styles.btn} ${className}`} {...rest}>
      <FontAwesomeIcon icon={icon} aria-hidden="true" />
    </button>
  );
});

export default IconButton;
