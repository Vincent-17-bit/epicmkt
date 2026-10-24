import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import styles from "./ClosedBanner.module.css";

// Says why the shop is closed or on special hours today, and when it next opens. The reason is the seller's own words.
export default function ClosedBanner({ status }) {
  if (!status) return null;
  const { isOpen, reasonText, reopens, closes } = status;
  if (isOpen && !reasonText) return null;
  const title = reasonText ?? "Closed right now";
  const detail = isOpen ? closes : reopens;
  return (
    <div className={styles.banner} data-open={isOpen || undefined} data-testid="closed-banner" role="status">
      <span className={styles.badge} aria-hidden="true">
        <FontAwesomeIcon icon={faClock} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {detail && <p className={styles.detail}>{detail}</p>}
      </div>
    </div>
  );
}
