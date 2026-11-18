import { useCallback, useId, useState } from "react";
import { Link } from "react-router-dom";
import { PayByPhone } from "@epicmkt/ui";
import { formatPrice, formatDay, PAYMENT_KIND_LABELS, renewalPlan } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { copyText } from "../../lib/copy.js";
import { errorText } from "../../lib/errors.js";
import { now as clockNow } from "../../lib/clock.js";
import ui from "../../styles/ui.module.css";
import styles from "./subscription.module.css";

function CopyButton({ value, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={styles.copy}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        setDone(await copyText(value));
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

const TITLES = { first: "Pay for your first month", upgrade: "Upgrade to Premium", category_change: "Pay for your category change" };
const monthsText = (n) => (n === 1 ? "1 month" : `${n} months`);

// The renewal heading and the line under it, for where the subscription stands.
function renewalHead(purpose, state, plan, graceEndsDay) {
  if (purpose === "first") return { title: TITLES.first, lead: "Your shop goes live as soon as the payment arrives." };
  if (state === "expired" || state === "none") {
    return { title: "Renew now", lead: "Your shop shows to customers again as soon as the payment arrives. The new time starts today." };
  }
  if (state === "grace") {
    return { title: "Renew now", lead: `Pay by ${formatDay(graceEndsDay)} to stay visible. The new time carries on from ${formatDay(plan.start)}, so you lose no days.` };
  }
  return { title: "Renew early", lead: `The new time is added after ${formatDay(plan.start)}, so you lose no days by paying early.` };
}

/**
 * The one place a seller pays. Nobody types an M-Pesa code. Two ways:
 *   * Pay now: an M-Pesa PIN prompt is sent to the seller's phone; entering the PIN is all it takes.
 *   * Paybill: the seller pays the Paybill with the account number shown.
 * Either way Safaricom tells our server, and this page updates by itself. Any amount is safe: whole months are added
 * automatically and the rest is kept as credit toward the next payment.
 * `mode` is what is being paid for ({ purpose, targetPlan, category, changeId }); the server works out the amount from it.
 * For a renewal the seller picks how many months; each choice shows its price and the paid-until date it gives, by the same rule
 * the server credits with (renewalPlan), and only the months the server will add are offered.
 */
export default function PaymentCard({ instructions, openPayment, received, onApplyCredit, onDismissReceived, mode = {}, onPaid, business = null, view = null }) {
  const id = useId();
  const [months, setMonths] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paybillOpen, setPaybillOpen] = useState(false);
  // While a prompt is on the phone its amount is fixed, so the months cannot be changed under it.
  const [waiting, setWaiting] = useState(false);
  const purpose = instructions?.purpose;
  const prepay = purpose === "first" || purpose === "renewal";
  const plan = prepay
    ? renewalPlan({ paidUntil: business?.paidUntil ?? null, graceDays: view?.graceDays ?? business?.graceDays ?? 1, now: clockNow(), maxMonths: instructions?.maxPrepayMonths ?? 12 })
    : null;
  const n = !prepay ? 1 : plan.choices.includes(months) ? months : plan.choices[0] ?? 1;
  const start = useCallback(({ phone }) => api.startStkPayment({
    phone, months: n, purpose: mode.purpose ?? null, targetPlan: mode.targetPlan ?? null, category: mode.category ?? null, changeId: mode.changeId ?? null,
  }), [n, mode.purpose, mode.targetPlan, mode.category, mode.changeId]);
  const poll = useCallback((requestId) => api.getStkPayment(requestId), []);
  const paid = useCallback(() => onPaid?.(), [onPaid]);
  const fallback = useCallback(() => setPaybillOpen(true), []);

  if (received) {
    const count = received.months ?? 1;
    return (
      <section className={`${ui.card} ${ui.tone_ok}`} aria-labelledby="pay-title" data-testid="payment-received">
        <h2 id="pay-title">Payment received</h2>
        <p style={{ margin: 0 }}>
          Thank you. We received {formatPrice(received.amount)}
          {count > 1 ? <>, which covers <strong>{count} months</strong></> : null}
          {received.periodEnd ? <> and your listing is paid until <strong>{formatDay(received.periodEnd)}</strong></> : null}.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {received.receiptNo ? <Link className={ui.btn} to={`/business/subscription/receipts/${received.id}`}>View receipt {received.receiptNo}</Link> : null}
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onDismissReceived}>Done</button>
        </div>
      </section>
    );
  }

  // A payment an admin recorded by hand and is still confirming.
  if (openPayment) {
    return (
      <section className={ui.card} aria-labelledby="pay-title" data-testid="payment-confirming">
        <h2 id="pay-title">Payment under confirmation</h2>
        <p style={{ margin: 0 }}>
          We have your payment{openPayment.mpesaCode ? <> (M-Pesa code <strong className={styles.mono}>{openPayment.mpesaCode}</strong>)</> : null} for {formatPrice(openPayment.amount)}
          {" "}({PAYMENT_KIND_LABELS[openPayment.kind] ?? openPayment.kind}). We will confirm it shortly. This page updates by itself.
        </p>
      </section>
    );
  }

  if (!instructions) return <section className={`${ui.card} ${styles.payLoading}`} aria-busy="true"><p className={ui.muted}>Loading payment options…</p></section>;
  const { configured, method, number, name, account, amount, creditKes = 0, maxPrepayMonths = 12 } = instructions;
  const paybill = method !== "till";
  const total = Math.max(amount * n - creditKes, 0);
  const canUseCredit = creditKes >= amount && amount > 0;
  const head = prepay ? renewalHead(purpose, view?.state, plan, view?.graceEndsDay) : { title: TITLES[purpose] ?? "Pay by M-Pesa", lead: null };
  const full = prepay && plan.allowed === 0;

  const useCredit = async () => {
    setError("");
    setBusy(true);
    try {
      await onApplyCredit();
    } catch (err) {
      setError(errorText(err, "We could not use your credit. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const manual = (
    <>
      <dl className={styles.pay}>
        <div>
          <dt>{paybill ? "Paybill number" : "Buy Goods till number"}</dt>
          <dd data-testid="pay-number"><span>{number}</span><CopyButton value={number} label="paybill number" /></dd>
        </div>
        {name && (
          <div>
            <dt>Business name</dt>
            <dd data-testid="pay-name">{name}</dd>
          </div>
        )}
        {paybill && (
          <div>
            <dt>Account number</dt>
            <dd data-testid="pay-account"><span>{account}</span><CopyButton value={account} label="account number" /></dd>
          </div>
        )}
        <div>
          <dt>Amount</dt>
          <dd data-testid="pay-amount"><span>{formatPrice(total)}</span><CopyButton value={total} label="amount" /></dd>
        </div>
      </dl>
      <ol className={styles.steps}>
        <li>Open M-Pesa on your phone and choose {paybill ? "Lipa na M-Pesa, then Pay Bill" : "Lipa na M-Pesa, then Buy Goods and Services"}.</li>
        <li>Enter {paybill ? "the Paybill number" : "the till number"} <strong>{number}</strong>.</li>
        {paybill && <li>Type <strong>{account}</strong> as the account number, exactly as shown.</li>}
        <li>Enter the amount, <strong>{formatPrice(total)}</strong>, and your M-Pesa PIN.</li>
      </ol>
      <p className={ui.muted} style={{ margin: 0 }} role="status">
        That is all. You do not need to send us any code: this page updates by itself when your payment arrives.
        {prepay ? " If you pay a different amount, nothing is lost. Whole months are added automatically and the rest is kept as credit." : ""}
      </p>
    </>
  );

  const ways = instructions.stk && total > 0 ? (
    <>
      <PayByPhone
        key={purpose}
        amount={total}
        defaultPhone={instructions.phone ?? ""}
        start={start}
        poll={poll}
        onPaid={paid}
        onFallback={fallback}
        formatDay={formatDay}
        title="Pay with an M-Pesa prompt"
        onWaitingChange={setWaiting}
        buttonClassName={ui.btn}
        secondaryButtonClassName={`${ui.btn} ${ui.btnGhost}`}
      />
      <details className={styles.payOther} open={paybillOpen} onToggle={(e) => setPaybillOpen(e.currentTarget.open)} data-testid="pay-paybill">
        <summary>Or pay with {paybill ? "Paybill" : "Buy Goods"} yourself</summary>
        {manual}
      </details>
    </>
  ) : (
    <section className={styles.manual} aria-labelledby={`${id}-paybill`}>
      <h3 id={`${id}-paybill`} className={styles.manualTitle}>Pay with M-Pesa {paybill ? "Paybill" : "Buy Goods"}</h3>
      {manual}
    </section>
  );

  return (
    <section className={`${ui.card} ${styles.payCard}`} aria-labelledby="pay-title" data-testid="payment-card" id="renew">
      <header className={styles.payHead}>
        <h2 id="pay-title">{head.title}</h2>
        {head.lead && !full && <p className={ui.muted}>{head.lead}</p>}
      </header>

      {creditKes > 0 && !full && (
        <p className={styles.credit} role="status" data-testid="pay-credit">
          You have <strong>{formatPrice(creditKes)}</strong> credit from earlier payments.
          {canUseCredit ? " It covers this payment." : <> It is already taken off, so you only need to pay <strong>{formatPrice(total)}</strong>.</>}
        </p>
      )}
      {canUseCredit && !full && (
        <div>
          <button type="button" className={ui.btn} disabled={busy} onClick={useCredit}>{busy ? "Applying" : `Use my ${formatPrice(amount)} credit`}</button>
          {error && <p className={ui.error} role="alert">{error}</p>}
        </div>
      )}

      {full ? (
        <p className={styles.full} role="status" data-testid="pay-full">
          You are paid ahead for the most allowed, {monthsText(maxPrepayMonths)} from today, until <strong>{formatDay(plan.start)}</strong>. There is nothing to pay now.
          {creditKes > 0 ? <> Your {formatPrice(creditKes)} credit is kept for your next renewal.</> : null}
        </p>
      ) : !configured ? (
        <p style={{ margin: 0 }} data-testid="pay-pending-details">We will send you the payment details by SMS shortly.</p>
      ) : prepay ? (
        <div className={styles.payGrid}>
          <div className={styles.choose}>
            {plan.choices.length > 1 && (
              <fieldset className={styles.months} disabled={waiting}>
                <legend className={ui.label}>How many months do you want to pay for?</legend>
                <div className={styles.monthGrid}>
                  {plan.choices.map((m) => (
                    <label key={m} className={styles.month} data-checked={m === n}>
                      <input type="radio" name={`${id}-months`} value={m} checked={m === n} onChange={() => setMonths(m)} />
                      <span className={styles.monthDot} aria-hidden="true" />
                      <span className={styles.monthCount}>{monthsText(m)}</span>
                      <span className={styles.monthPrice}>{formatPrice(amount * m)}</span>
                      <span className={styles.monthUntil}>to {formatDay(plan.until(m))}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {plan.allowed < maxPrepayMonths && (
              <p className={styles.note} data-testid="pay-cap">
                You can add up to {monthsText(plan.allowed)} now. Nobody is paid more than {monthsText(maxPrepayMonths)} ahead.
              </p>
            )}
            <div className={styles.total} data-testid="pay-total" aria-live="polite">
              <div>
                <span>You pay</span>
                <strong>{formatPrice(total)}</strong>
                {creditKes > 0 && total < amount * n ? <small>{formatPrice(amount * n)} less {formatPrice(Math.min(creditKes, amount * n))} credit</small> : <small>{monthsText(n)} × {formatPrice(amount)}</small>}
              </div>
              <div>
                <span>Paid until</span>
                <strong data-testid="pay-new-date">{formatDay(plan.until(n))}</strong>
                <small>{plan.startsToday ? "Starts today" : `Added after ${formatDay(plan.start)}`}</small>
              </div>
            </div>
          </div>
          <div className={styles.ways}>{ways}</div>
        </div>
      ) : ways}

      {prepay && (
        <p className={styles.fine}>
          Each payment covers calendar months: a month that starts on 31 Jan runs to 28 Feb. After the paid time ends you have {view?.graceDays ?? 1} day{(view?.graceDays ?? 1) === 1 ? "" : "s"} of grace.
        </p>
      )}
    </section>
  );
}
