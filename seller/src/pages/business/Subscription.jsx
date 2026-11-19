import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionView } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import Banners from "../../components/Banners.jsx";
import SetupCard from "../../onboarding/SetupCard.jsx";
import { now } from "../../lib/clock.js";
import { useRealtime } from "../../lib/useRealtime.js";
import PaymentCard from "./PaymentCard.jsx";
import SubscriptionStatus from "./SubscriptionStatus.jsx";
import PlanCompare from "./PlanCompare.jsx";
import PaymentHistory from "./PaymentHistory.jsx";
import CategoryChange from "./CategoryChange.jsx";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

// The status card says these itself; the banners above it only add paused or suspended.
const IN_STATUS = ["expiring", "grace", "expired", "first-payment"];

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
    // Switching plan or months keeps the card on screen while the new amounts load.
    placeholderData: (prev) => prev,
  });

  // The seller's own payment and business rows. When a payment arrives (automatically, or confirmed by an admin),
  // these change and everything below refetches by itself: no reload.
  useRealtime(["payments", "businesses"], () => {
    qc.invalidateQueries({ queryKey: ["subscription"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["instructions"] });
    qc.invalidateQueries({ queryKey: ["changes"] });
    qc.invalidateQueries({ queryKey: ["shop-preview"] });
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

  // A "Pay now" prompt was paid: fetch the new payment (the realtime feed does too; this makes it immediate).
  const refreshAfterPayment = useCallback(() => {
    for (const key of ["payments", "instructions", "subscription", "changes", "shop-preview"]) qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);

  const applyCredit = async () => {
    await api.applyCredit({ purpose: mode.purpose, targetPlan: mode.targetPlan ?? null, category: mode.category ?? null, changeId: mode.changeId ?? null });
    await Promise.all([qc.invalidateQueries({ queryKey: ["payments"] }), qc.invalidateQueries({ queryKey: ["instructions"] }), qc.invalidateQueries({ queryKey: ["subscription"] })]);
  };

  if (sub.isLoading) return <div className={ui.page}><p role="status">Loading</p></div>;
  if (sub.error) return <div className={ui.page}><p className={ui.error} role="alert">We could not load your subscription. Check your connection and refresh.</p></div>;

  const { business } = sub.data;
  const today = now();
  const view = subscriptionView(business, today);
  const open = (payments.data ?? []).find((p) => p.status === "submitted") ?? null;
  // Paying always works. Changing the plan or the category does not: the server refuses those for a suspended seller, so the page does not offer them.
  const suspended = business.status === "suspended";
  const price = sub.data.plans[business.planKey]?.price ?? null;

  return (
    <div className={ui.page}>
      <div className={ui.pageHead}>
        <h1>Subscription</h1>
        <p className={ui.muted}>{business.name}</p>
      </div>

      <Banners business={business} skip={suspended ? ["suspended", ...IN_STATUS] : IN_STATUS} />
      <SubscriptionStatus business={business} view={view} price={price} now={today} />

      <div ref={payRef} className={styles.payArea}>
        {mode.purpose && (
          <div className={styles.modeRow} role="group" aria-label="What are you paying for">
            <button type="button" className={ui.chip} onClick={() => choose({ purpose: null })}>Back to {business.paidUntil ? "renewal" : "first payment"}</button>
            {mode.purpose === "upgrade" && <span className={ui.muted}>Upgrading to Premium</span>}
          </div>
        )}
        {instr.error && !open && !received ? (
          <section className={ui.card}><p className={ui.error} role="alert">{instr.error.code === "renew_first" ? "Renew your subscription first." : "We could not load the payment details."}</p></section>
        ) : (
          <PaymentCard
            instructions={instr.data} openPayment={open} received={received} onApplyCredit={applyCredit} onDismissReceived={() => setReceived(null)}
            mode={mode} onPaid={refreshAfterPayment} business={business} view={view}
            onPlan={suspended ? null : (k) => { setReceived(null); setMode({ purpose: null, targetPlan: k }); }}
          />
        )}
      </div>

      <SetupCard />
      {suspended ? null : (
        <PlanCompare
          subscription={sub.data} listingState={view.state} onUpgrade={() => choose({ purpose: "upgrade", targetPlan: "premium" })}
          canRenewOn={!!instr.data?.planChoices && instr.data?.purpose !== "first"}
          renewingOn={mode.purpose ? null : mode.targetPlan ?? business.planKey}
          onRenewOn={(k) => choose({ purpose: null, targetPlan: k === business.planKey ? null : k })}
        />
      )}
      {suspended ? null : <CategoryChange business={business} payments={payments.data ?? []} onPay={choose} />}
      <PaymentHistory payments={payments.data ?? []} />
    </div>
  );
}
