import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../state/session.js";
import { useSettings } from "../state/settings.js";
import { onboardingProgress } from "../lib/onboarding.js";
import styles from "./onboarding.module.css";

export default function Onboarding() {
  const me = useSession((s) => s.me);
  const settings = useSettings((s) => s.settings);
  const loaded = useSettings((s) => s.loaded);
  const update = useSettings((s) => s.update);
  const navigate = useNavigate();
  const progress = onboardingProgress({ business: me.business, catalog: me.catalog, usage: me.usage, settings });
  const status = settings.onboarding.status;

  // Finishing every step closes the checklist for good.
  useEffect(() => {
    if (loaded && progress.complete && status !== "done") update({ onboarding: { status: "done", completed_at: new Date().toISOString() } }, { quiet: true });
  }, [loaded, progress.complete, status, update]);

  const skip = async () => {
    await update({ onboarding: { status: "skipped" } }, { message: "You can pick this up again from Home" });
    navigate("/", { replace: true });
  };
  const resume = () => update({ onboarding: { status: "active" } }, { quiet: true });
  const openQr = () => update({ onboarding: { qr_seen: true } }, { quiet: true });

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Welcome to EpicMKT Business</h1>
        <p>Five quick steps to get your listing ready. Steps tick themselves as you finish them.</p>
      </header>
      <div role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.count} aria-valuetext={`${progress.count} of ${progress.total} steps done`}>
        <div className={styles.bar}><div className={styles.fill} style={{ width: `${progress.percent}%` }} /></div>
      </div>
      <p className={styles.count} aria-live="polite">{progress.count} of {progress.total} done</p>

      {status === "skipped" && !progress.complete && (
        <div className={styles.tip} role="status">
          <p>Setup is on hold. Pick up where you left off any time.</p>
          <button type="button" onClick={resume}>Resume setup</button>
        </div>
      )}

      <ol className={styles.list} aria-label="Setup steps">
        {progress.steps.map((s, i) => (
          <li key={s.key} className={styles.step} data-done={s.done ? "true" : "false"} data-current={progress.next?.key === s.key ? "true" : undefined}>
            <span className={styles.mark} aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <div className={styles.body}>
              <h2>{s.title}<span className="sr-only"> {s.done ? "(done)" : "(to do)"}</span></h2>
              <p>{s.text}</p>
              {!s.done && (
                <div className={styles.actions}>
                  <Link to={s.to} className={styles.link} onClick={s.key === "qr" ? openQr : undefined}>{s.cta}</Link>
                  {s.key === "qr" && <button type="button" className={styles.ghost} onClick={openQr}>I have it</button>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.footer}>
        {progress.complete ? <Link to="/" className={styles.link}>Go to Home</Link> : <button type="button" className={styles.ghost} onClick={skip}>Skip for now</button>}
      </div>
    </div>
  );
}
