import { Link } from "react-router-dom";
import { needsSetup } from "../lib/onboarding.js";
import { useSetupProgress } from "../lib/useSetupProgress.js";
import styles from "./onboarding.module.css";

// Shown at the top of Subscription (the landing page) until every step is done.
export default function SetupCard() {
  const { ready, settings, progress } = useSetupProgress();
  if (!ready || !needsSetup(progress, settings)) return null;
  const skipped = settings.onboarding.status === "skipped";
  return (
    <section className={styles.card} aria-label="Setup guide">
      <h2>{skipped ? "Pick up your setup" : "Finish setting up"}</h2>
      <p className={styles.count}>{progress.count} of {progress.total} steps done{progress.next ? `. Next: ${progress.next.title}.` : ""}</p>
      <div className={styles.bar} aria-hidden="true"><div className={styles.fill} style={{ width: `${progress.percent}%` }} /></div>
      <div><Link to="/business/onboarding" className={styles.link}>{skipped ? "Resume setup" : "Continue setup"}</Link></div>
    </section>
  );
}
