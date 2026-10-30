import { useSettings } from "../state/settings.js";
import styles from "./onboarding.module.css";

// A short hint that shows until the seller dismisses it. Dismissals are saved, so it stays gone.
export default function Tip({ id, children }) {
  const loaded = useSettings((s) => s.loaded);
  const dismissed = useSettings((s) => s.settings.onboarding.dismissed_tips.includes(id));
  const dismissTip = useSettings((s) => s.dismissTip);
  if (!loaded || dismissed) return null;
  return (
    <aside className={styles.tip} aria-label="Tip" data-tip={id}>
      <p>{children}</p>
      <button type="button" onClick={() => dismissTip(id)} aria-label="Dismiss this tip for good">Got it</button>
    </aside>
  );
}
