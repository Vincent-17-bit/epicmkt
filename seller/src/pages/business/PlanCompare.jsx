import { formatPrice, planLabel } from "@epicmkt/shared/billing";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

function PlanColumn({ planKey, plan, current, canUpgrade, upgradeBlocked, onUpgrade, onRenewOn, renewing }) {
  return (
    <article className={styles.plan} data-current={current} data-testid={`plan-${planKey}`} aria-label={`${planLabel(planKey)} plan`}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center" }}>
        <h3>{planLabel(planKey)}</h3>
        {current ? <span className={`${ui.pill} ${ui.tone_info}`}>Your plan</span> : plan.badge ? <span className={`${ui.pill} ${ui.tone_ok}`}>{plan.badge}</span> : null}
      </header>
      <p className={styles.price} style={{ margin: 0 }}>{formatPrice(plan.price)}<span className={ui.muted} style={{ fontSize: "var(--text-sm)", fontWeight: 400 }}> / month</span></p>
      <p style={{ margin: 0 }}><strong>Unlimited</strong> items</p>
      <ul aria-label="Top benefits">{(plan.topBenefits ?? []).map((b) => <li key={b}>{b}</li>)}</ul>
      {Object.entries(plan.features ?? {}).map(([group, list]) => (
        <section key={group}>
          <h4 style={{ fontSize: "var(--text-sm)" }}>{group}</h4>
          <ul>{list.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      ))}
      {canUpgrade && !(upgradeBlocked && onRenewOn) && (
        <>
          <button type="button" className={ui.btn} onClick={onUpgrade} disabled={upgradeBlocked}>Upgrade to Premium</button>
          {upgradeBlocked
            ? <p className={ui.muted}>Renew your subscription first, then upgrade.</p>
            : <p className={ui.muted}>Upgrade now for the days left of this month only.</p>}
        </>
      )}
      {onRenewOn && !current && (
        renewing
          ? <p className={ui.muted} data-testid={`renewing-${planKey}`}>Chosen for your renewal above.</p>
          : <button type="button" className={canUpgrade && !upgradeBlocked ? `${ui.btn} ${ui.btnGhost}` : ui.btn} onClick={() => onRenewOn(planKey)}>Renew on {planLabel(planKey)}</button>
      )}
    </article>
  );
}

/**
 * Standard and Premium for the seller's OWN category only. Prices, items and features come from the plan tables.
 * "Renew on …" picks the plan for the renewal card above (when the server offers the choice, migration 0138); "Upgrade to
 * Premium" stays for moving up mid-period without renewing.
 */
export default function PlanCompare({ subscription, listingState, onUpgrade, canRenewOn = false, renewingOn = null, onRenewOn = null }) {
  const { business, plans } = subscription;
  const available = ["standard", "premium"].filter((k) => plans?.[k]);
  return (
    <section className={ui.card} aria-labelledby="plans-title">
      <h2 id="plans-title">Standard or Premium for {business.categoryName}</h2>
      {/* A category can be missing a plan row. Show the plans that exist instead of crashing the page. */}
      {available.length === 0 && <p className={ui.muted} role="status">Plan prices for your category are not set up yet. Please contact EpicMKT support.</p>}
      <div className={styles.compare}>
        {available.map((k) => (
          <PlanColumn
            key={k} planKey={k} plan={plans[k]} current={business.planKey === k}
            canUpgrade={k === "premium" && business.planKey === "standard"} upgradeBlocked={listingState !== "active"} onUpgrade={onUpgrade}
            onRenewOn={canRenewOn ? onRenewOn : null} renewing={renewingOn === k}
          />
        ))}
      </div>
    </section>
  );
}
