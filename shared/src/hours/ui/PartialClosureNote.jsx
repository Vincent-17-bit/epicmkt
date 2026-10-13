import { partialSummary } from "../status.js";
import StatusIcon from "./StatusIcon.jsx";
import styles from "./hoursUi.module.css";

export default function PartialClosureNote({ partial, now = Date.now(), className = "" }) {
  if (!partial) return null;
  const text = partial.message || partialSummary(partial, now);
  return (
    <p className={`${styles.note} ${className}`} role="status" data-testid="partial-note">
      <StatusIcon name="pause" size={18} className={styles.noteIcon} />
      <span>{text}</span>
    </p>
  );
}
