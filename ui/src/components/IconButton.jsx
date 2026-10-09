import { forwardRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./IconButton.module.css";

const IconButton = forwardRef(function IconButton({ icon, label, className = "", ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} className={`${styles.btn} ${className}`} {...rest}>
      <FontAwesomeIcon icon={icon} className={styles.icon} />
    </button>
  );
});

export default IconButton;
