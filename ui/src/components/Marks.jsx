import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faStore } from "@fortawesome/free-solid-svg-icons";
import styles from "./Marks.module.css";

/**
 * The small icons that say something about a store, drawn the same everywhere on the site: a gold store chip for a
 * featured store, a blue tick for a verified one and a coloured dot for open or closed. Product tiles, store cards
 * and badges all use these, so a mark never changes shape or colour from one card to the next.
 */

export function FeaturedMark({ label = "Featured store", className = "" }) {
  return (
    <span className={`${styles.gold} ${className}`} title={label}>
      <FontAwesomeIcon icon={faStore} aria-hidden="true" />
      <span className={styles.sr}>{label}. </span>
    </span>
  );
}

export function VerifiedMark({ label = "Verified store", className = "" }) {
  return (
    <span className={`${styles.tick} ${className}`} title={label}>
      <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" />
      <span className={styles.sr}>{label}</span>
    </span>
  );
}

export function OpenStatus({ isOpen, labels = { open: "Open", closed: "Closed" }, className = "" }) {
  return (
    <span className={`${styles.status} ${isOpen ? styles.open : styles.closed} ${className}`}>
      <span className={styles.dot} aria-hidden="true" />
      {isOpen ? labels.open : labels.closed}
    </span>
  );
}
