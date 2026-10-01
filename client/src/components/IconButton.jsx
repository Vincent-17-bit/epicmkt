import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./IconButton.module.css";

export default function IconButton({ icon, label, className = "", ...rest }) {
  return (
    <button type="button" aria-label={label} className={`${styles.btn} ${className}`} {...rest}>
      <FontAwesomeIcon icon={icon} className={styles.icon} />
    </button>
  );
}
