import { labels } from "../labels.js";
import styles from "./AvailabilityDot.module.css";

export default function AvailabilityDot({ availability = "available" }) {
  return (
    <span className={styles.avail}>
      <span className={`${styles.dot} ${styles[availability]}`} aria-hidden="true" />
      <span className={styles.sr}>{labels.availability[availability]}</span>
    </span>
  );
}
