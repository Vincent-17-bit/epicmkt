import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { currentPlan, formatKes, planLabel, planUsage, sortPlans, upgradeSummary } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { Button } from "../ui/ui.jsx";
import { UsageMeter } from "../catalog/Usage.jsx";
import { supportChannels, supportContact, upgradeRequest } from "../lib/support.js";
import styles from "./plan.module.css";

// Plan changes are handled by the EpicMKT team: the database has no plan-change request type, so the upgrade action
// is a real contact action (email, WhatsApp, phone) carrying the seller, the current plan and the plan wanted.
function UpgradeContact({ ctx, summary }) {
  const req = upgradeRequest({ business: ctx.business, plan: ctx.plan });
  const channels = supportChannels(req);
  const { hours } = supportContact();
  const target = planLabel(summary.to.key);
  return (
    <section className={styles.contact} aria-labelledby="upgrade-h">
      <h2 id="upgrade-h">Contact EpicMKT to upgrade</h2>
      <p>Plan changes are handled by the EpicMKT team. Tell us you want {target} and we will take it from there.</p>
      {channels.length ? (
        <div className={styles.channels}>
          {channels.map((c, i) => (
            <Button key={c.key} as="a" variant={i === 0 ? "primary" : "secondary"} href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {c.label} <span className={styles.detail}>{c.detail}</span>
            </Button>
          ))}
        </div>
      ) : (
        <p role="status" className={styles.noContact}>EpicMKT contact details are not set up for this site yet, so an upgrade request cannot be sent from here.</p>
      )}
      {hours && <p className={styles.muted}>Support hours: {hours}</p>}
    </section>
  );
}

export function PlanPage() {
  const [state, setState] = useState({ loading: true, error: null, ctx: null, total: 0 });

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([api.getCatalogContext(), api.catalogStats()])
      .then(([ctx, stats]) => setState({ loading: false, error: null, ctx, total: stats?.total ?? 0 }))
      .catch((error) => setState({ loading: false, error, ctx: null, total: 0 }));
  };
  useEffect(load, []);

  if (state.loading) return <p role="status">Loading your plan…</p>;
  if (state.error) {
    return (
      <div role="alert" className={styles.page}>
        <h1>Your plan</h1>
        <p>We could not load your plan. Check your connection and try again.</p>
        <Button variant="primary" onClick={load}>Try again</Button>
      </div>
    );
  }

  const { ctx } = state;
  const plans = sortPlans(ctx.plan.plans);
  const current = currentPlan(ctx.plan);
  const summary = upgradeSummary(ctx.plan);
  const usage = planUsage(state.total, ctx.itemsLimit ?? current?.itemsLimit ?? null);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Your plan</h1>
        <UsageMeter usage={usage} />
      </header>

      {plans.length === 0 ? (
        <p role="status">Plan details are not available right now.</p>
      ) : (
        <ul className={styles.grid} aria-label="Plans">
          {plans.map((p) => {
            const isCurrent = p.key === ctx.plan.current;
            return (
              <li key={p.key} className={`${styles.card} ${isCurrent ? styles.current : ""}`} aria-current={isCurrent ? "true" : undefined}>
                <div className={styles.cardHead}>
                  <h2>{planLabel(p.key)}</h2>
                  {isCurrent && <span className={styles.badge}>Your plan</span>}
                </div>
                <p className={styles.price}>{formatKes(p.priceKes)} <span>a month</span></p>
                <p className={styles.limit}>Up to {p.itemsLimit} items</p>
                <ul className={styles.benefits}>{p.topBenefits.map((b) => <li key={b}>{b}</li>)}</ul>
              </li>
            );
          })}
        </ul>
      )}

      {summary ? (
        <>
          <section aria-labelledby="adds-h" className={styles.adds}>
            <h2 id="adds-h">What {planLabel(summary.to.key)} adds</h2>
            <ul>
              <li>
                {summary.extraItems > 0
                  ? `${summary.extraItems} more items: up to ${summary.to.itemsLimit} instead of ${summary.from.itemsLimit}`
                  : `Up to ${summary.to.itemsLimit} items, the same as ${planLabel(summary.from.key)}`}
              </li>
              {summary.to.topBenefits.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </section>
          <UpgradeContact ctx={ctx} summary={summary} />
        </>
      ) : (
        current && <p className={styles.top}>You are on our highest plan. Delete an item you no longer sell to make room, or contact EpicMKT to raise your limit.</p>
      )}

      <Link to="/business/catalog">Back to your catalog</Link>
    </div>
  );
}
