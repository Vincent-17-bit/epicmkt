import { Link } from "react-router-dom";
import { PLAN_PRICE_KES } from "@epicmkt/shared";
import { Button } from "../ui/ui.jsx";
import styles from "./catalog.module.css";

export function UpgradePrompt({ usage, planKey, onDismiss }) {
  const premium = planKey === "premium";
  return (
    <div className={styles.upgrade} role="alert">
      <div>
        <strong>{usage.limit != null ? `You have used all ${usage.limit} items on your plan.` : "You have reached your plan's item limit."}</strong>
        <p>
          {premium
            ? "Delete an item you no longer sell to make room, or contact support to raise your limit."
            : `Upgrade to Premium (KSh ${PLAN_PRICE_KES.premium.toLocaleString("en-KE")} a month) to list more, or delete an item you no longer sell.`}
        </p>
      </div>
      <div className={styles.upgradeActions}>
        {!premium && <Link className={styles.upgradeLink} to="/business/plan">See Premium</Link>}
        {onDismiss && <Button onClick={onDismiss}>Not now</Button>}
      </div>
    </div>
  );
}

export function UsageMeter({ usage }) {
  const pct = usage.limit ? Math.min(100, Math.round((usage.count / usage.limit) * 100)) : 0;
  return (
    <div className={styles.meter} data-testid="usage-meter">
      <div className={styles.meterText}>
        <strong>{usage.label}</strong>
        {usage.limit != null && (usage.atLimit ? <span className={styles.meterFull}>Plan full</span> : <span className={styles.muted}>{usage.remaining} left</span>)}
      </div>
      {usage.limit != null && (
        <div
          className={`${styles.bar} ${usage.atLimit ? styles.barFull : usage.nearLimit ? styles.barNear : ""}`}
          role="progressbar"
          aria-label="Items used on your plan"
          aria-valuemin={0}
          aria-valuemax={usage.limit}
          aria-valuenow={usage.count}
          aria-valuetext={usage.label}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
