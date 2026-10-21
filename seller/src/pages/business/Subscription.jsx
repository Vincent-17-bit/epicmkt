import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { daysLeft, formatDay, formatKes, planLabel, subscriptionView } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import Banners from "../../components/Banners.jsx";
import { now } from "../../lib/clock.js";
import { useRealtime } from "../../lib/useRealtime.js";
import PaymentCard from "./PaymentCard.jsx";
import PlanCompare from "./PlanCompare.jsx";
import PaymentHistory from "./PaymentHistory.jsx";
import CategoryChange from "./CategoryChange.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

const STATUS_LABEL = { pending: "Pending", live: "Live", paused: "Paused (unlisted)", suspended: "Suspended", expired: "Expired", deleted: "Deleted" };
const STATE_LABEL = { none: "Not paid yet", active: "Active", grace: "Grace period", expired: "Expired" };

export default function Subscription() {
  const qc = useQueryClient();
  const payRef = useRef(null);
  const [mode, setMode] = useState({ purpose: null });
  const [received, setReceived] = useState(null);
  const watching = useRef(new Set());
  const seen = useRef(null);

  const sub = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription });
  const payments = useQuery({ queryKey: ["payments"], queryFn: api.listPayments });
  const instr = useQuery({
    queryKey: ["instructions", mode],
    queryFn: () => api.getPaymentInstructions({ purpose: mode.purpose, targetPlan: mode.targetPlan ?? null, category: mode.category ?? null }),
    enabled: !!sub.data,
    retry: false,
  });

  // The seller's own payment and business rows. When a payment arrives (automatically, or confirmed by an admin),
  // these change and everything below refetches by itself: no reload.
  useRealtime(["payments", "businesses"], () => {
    qc.invalidateQueries({ queryKey: ["subscription"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["instructions"] });
    qc.invalidateQueries({ queryKey: ["changes"] });
  });

  // A payment that appears after the page opened is a payment that just arrived (automatic, or confirmed by an admin).
  useEffect(() => {
    const list = payments.data;
    if (!list) return;
    if (seen.current === null) {
      seen.current = new Set(list.map((p) => p.id));
      for (const p of list) if (p.status === "submitted") watching.current.add(p.id);
      return;
    }
    for (const p of list) {
      const isNew = !seen.current.has(p.id);
      seen.current.add(p.id);
      if (p.status === "submitted") watching.current.add(p.id);
      if (p.status === "confirmed" && (isNew || watching.current.has(p.id))) {
        watching.current.delete(p.id);
        setReceived(p);
        setMode({ purpose: null });
      }
      if (p.status === "rejected") watching.current.delete(p.id);
    }
  }, [payments.data]);

  // Tell the server what is being paid for, so money for an upgrade is applied as the upgrade and not as a renewal.
  useEffect(() => {
    api.setPaymentIntent({ purpose: mode.purpose, targetPlan: mode.targetPlan ?? null, category: mode.category ?? null, changeId: mode.changeId ?? null }).catch(() => {});
  }, [mode]);

  const choose = useCallback((next) => {
    setReceived(null);
    setMode(next);
    payRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);

  const applyCredit = async () => {
    await api.applyCredit({ purpose: mode.purpose, targetPlan: mode.targetPlan ?? null, category: mode.category ?? null, changeId: mode.changeId ?? null });
    await Promise.all([qc.invalidateQueries({ queryKey: ["payments"] }), qc.invalidateQueries({ queryKey: ["instructions"] }), qc.invalidateQueries({ queryKey: ["subscription"] })]);
  };

  if (sub.isLoading) return <div className={ui.page}><p role="status">Loading</p></div>;
  if (sub.error) return <div className={ui.page}><p className={ui.error} role="alert">We could not load your subscription. Check your connection and refresh.</p></div>;

  const { business } = sub.data;
  const view = subscriptionView(business, now());
  const open = (payments.data ?? []).find((p) => p.status === "submitted") ?? null;
  const left = daysLeft(business.paidUntil, now());

  return (
    <div className={ui.page}>
      <div className={ui.pageHead}>
        <h1>Subscription</h1>
        <p className={ui.muted}>{business.name}</p>
      </div>

      <Banners business={business} onAction={() => choose({ purpose: null })} />

      <section className={ui.card} aria-labelledby="sum-title">
        <h2 id="sum-title" className={ui.srOnly}>Your subscription</h2>
        <dl className={styles.summary}>
          <div><dt>Plan</dt><dd data-testid="sum-plan">{planLabel(business.planKey)} · {business.categoryName}</dd></div>
          <div><dt>Listing</dt><dd data-testid="sum-status">{STATUS_LABEL[business.status] ?? business.status}</dd></div>
          <div><dt>Subscription</dt><dd data-testid="sum-state">{STATE_LABEL[view.state]}</dd></div>
          <div><dt>Paid until</dt><dd data-testid="sum-paid-until">{business.paidUntil ? formatDay(business.paidUntil) : "Not paid yet"}</dd></div>
          <div>
            <dt>{view.state === "grace" ? "Grace ends" : "Days left"}</dt>
            <dd data-testid="sum-days">
              {view.state === "none" ? "" : view.state === "grace" ? formatDay(view.graceEndsDay) : view.state === "expired" ? "0" : left}
            </dd>
          </div>
        </dl>
        <p className={ui.muted}>Each payment covers one calendar month: a month that starts on 31 Jan runs to 28 Feb. After it ends you have {view.graceDays} day{view.graceDays === 1 ? "" : "s"} of grace.</p>
      </section>

      <div ref={payRef}>
        <div className={styles.modeRow} role="group" aria-label="What are you paying for" style={{ marginBottom: "var(--space-3)" }}>
          {mode.purpose && <button type="button" className={ui.chip} onClick={() => choose({ purpose: null })}>Back to {business.paidUntil ? "renewal" : "first payment"}</button>}
          {mode.purpose === "upgrade" && <span className={ui.muted}>Upgrading to Premium</span>}
        </div>
        {instr.error && !open && !received ? (
          <section className={ui.card}><p className={ui.error} role="alert">{instr.error.code === "renew_first" ? "Renew your subscription first." : "We could not load the payment details."}</p></section>
        ) : (
          <PaymentCard instructions={instr.data} openPayment={open} received={received} onApplyCredit={applyCredit} onDismissReceived={() => setReceived(null)} />
        )}
      </div>

      <PlanCompare subscription={sub.data} listingState={view.state} onUpgrade={() => choose({ purpose: "upgrade", targetPlan: "premium" })} />
      <CategoryChange business={business} payments={payments.data ?? []} onPay={choose} />
      <PaymentHistory payments={payments.data ?? []} />
      <p className={ui.muted}>{formatKes(sub.data.plans[business.planKey].price)} per month is your current price.</p>
    </div>
  );
}
