import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown, faStar } from "@fortawesome/free-solid-svg-icons";
import { STATE_LABELS, STATE_TONES } from "../lib/listing.js";
import styles from "./shell.module.css";

export function PlanBadge({ plan }) {
  const premium = plan === "premium";
  return (
    <span className={`${styles.plan} ${premium ? styles.premium : styles.standard}`} data-plan={premium ? "premium" : "standard"}>
      <FontAwesomeIcon icon={premium ? faCrown : faStar} aria-hidden="true" />
      <span className={styles.badgeText}>{premium ? "Premium" : "Standard"}</span>
    </span>
  );
}

export function StatusChip({ state }) {
  return (
    <span className={`${styles.chip} ${styles[STATE_TONES[state]]}`} data-state={state}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.badgeText}>{STATE_LABELS[state]}</span>
    </span>
  );
}
