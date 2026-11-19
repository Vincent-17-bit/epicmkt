import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import styles from "./ClosedBanner.module.css";

// Says why the shop is closed or on special hours today, and when it next opens. The reason is the shop's own words. Only when there
// is a reason: plain "closed outside its hours" is already the status chip beside the shop's name ("Closed · Opens 8:00 AM"), and a
// banner saying it again (and a third time in the hours table) only repeated it.
export default function ClosedBanner({ status, showCloses = true }) {
  if (!status) return null;
  const { isOpen, reasonText, reopens, closes } = status;
  if (!reasonText) return null;
  const title = reasonText;
  const detail = isOpen ? (showCloses ? closes : null) : reopens;
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
