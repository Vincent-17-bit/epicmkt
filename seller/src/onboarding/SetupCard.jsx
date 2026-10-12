import { Link } from "react-router-dom";
import { useSession } from "../state/session.js";
import { useSettings } from "../state/settings.js";
import { needsSetup, onboardingProgress } from "../lib/onboarding.js";
import styles from "./onboarding.module.css";

// Shown on Home until every step is done.
export default function SetupCard() {
  const me = useSession((s) => s.me);
  const settings = useSettings((s) => s.settings);
  const loaded = useSettings((s) => s.loaded);
  const progress = onboardingProgress({ business: me.business, catalog: me.catalog, usage: me.usage, settings });
  if (!loaded || !needsSetup(progress, settings)) return null;
  const skipped = settings.onboarding.status === "skipped";
  return (
    <section className={styles.card} aria-label="Setup guide">
      <h2>{skipped ? "Pick up your setup" : "Finish setting up"}</h2>
      <p className={styles.count}>{progress.count} of {progress.total} steps done{progress.next ? `. Next: ${progress.next.title}.` : ""}</p>
      <div className={styles.bar} aria-hidden="true"><div className={styles.fill} style={{ width: `${progress.percent}%` }} /></div>
      <div><Link to="/onboarding" className={styles.link}>{skipped ? "Resume setup" : "Continue setup"}</Link></div>
    </section>
  );
}
