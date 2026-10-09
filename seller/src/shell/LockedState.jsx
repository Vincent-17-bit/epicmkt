import { Link } from "react-router-dom";
import { LOCK_COPY } from "../lib/listing.js";
import styles from "./shell.module.css";

export default function LockedState({ state, reason }) {
  const copy = LOCK_COPY[state] ?? LOCK_COPY.unlisted;
  return (
    <section className={styles.locked} data-testid="locked-state" aria-labelledby="locked-title">
      <h1 id="locked-title" className={styles.lockedTitle}>{copy.title}</h1>
      <p>{copy.text}</p>
      {reason && <p className={styles.reason}>{reason}</p>}
      <div className={styles.lockedLinks}>
        <Link to="/subscription" className={styles.bannerBtn}>Subscription</Link>
        <Link to="/notifications" className={styles.ghostBtn}>Notifications</Link>
        <Link to="/help" className={styles.ghostBtn}>Help</Link>
      </div>
    </section>
  );
}
