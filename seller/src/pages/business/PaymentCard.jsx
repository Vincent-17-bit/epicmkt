import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { PayByPhone } from "@epicmkt/ui";
import { formatPrice, formatDay, PAYMENT_KIND_LABELS } from "@epicmkt/shared/billing";
import * as api from "../../api/index.js";
import { copyText } from "../../lib/copy.js";
import { errorText } from "../../lib/errors.js";
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

const TITLES = { first: "Pay for your first month", renewal: "Renew your subscription", upgrade: "Upgrade to Premium", category_change: "Pay for your category change" };
const MONTH_CHOICES = [1, 2, 3, 6, 12];

/**
 * The one place a seller pays. Nobody types an M-Pesa code. Two ways:
 *   * Pay now: an M-Pesa PIN prompt is sent to the seller's phone; entering the PIN is all it takes.
 *   * Paybill: the seller pays the Paybill with the account number shown.
 * Either way Safaricom tells our server, and this page updates by itself. Any amount is safe: whole months are added
 * automatically and the rest is kept as credit toward the next payment.
 * `mode` is what is being paid for ({ purpose, targetPlan, category, changeId }); the server works out the amount from it.
 */
export default function PaymentCard({ instructions, openPayment, received, onApplyCredit, onDismissReceived, mode = {}, onPaid }) {
  const [months, setMonths] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paybillOpen, setPaybillOpen] = useState(false);
  const prepayNow = instructions?.purpose === "first" || instructions?.purpose === "renewal";
  const monthsNow = prepayNow ? months : 1;
  const start = useCallback(({ phone }) => api.startStkPayment({
    phone, months: monthsNow, purpose: mode.purpose ?? null, targetPlan: mode.targetPlan ?? null, category: mode.category ?? null, changeId: mode.changeId ?? null,
  }), [monthsNow, mode.purpose, mode.targetPlan, mode.category, mode.changeId]);
  const poll = useCallback((id) => api.getStkPayment(id), []);
  const paid = useCallback(() => onPaid?.(), [onPaid]);
  const fallback = useCallback(() => setPaybillOpen(true), []);

  if (received) {
    const n = received.months ?? 1;
    return (
      <section className={`${ui.card} ${ui.tone_ok}`} aria-labelledby="pay-title" data-testid="payment-received">
        <h2 id="pay-title">Payment received</h2>
        <p style={{ margin: 0 }}>
          Thank you. We received {formatPrice(received.amount)}
          {n > 1 ? <>, which covers <strong>{n} months</strong></> : null}
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

  if (!instructions) return null;
  const { configured, method, number, name, account, amount, purpose, creditKes = 0, maxPrepayMonths = 12 } = instructions;
  const paybill = method !== "till";
  const prepay = purpose === "first" || purpose === "renewal";
  const choices = MONTH_CHOICES.filter((m) => m <= maxPrepayMonths);
  const n = prepay ? months : 1;
  const total = Math.max(amount * n - creditKes, 0);
  const canUseCredit = creditKes >= amount && amount > 0;

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

  return (
    <section className={ui.card} aria-labelledby="pay-title" data-testid="payment-card">
      <h2 id="pay-title">{TITLES[purpose] ?? "Pay by M-Pesa"}</h2>

      {creditKes > 0 && (
        <p style={{ margin: 0 }} role="status" data-testid="pay-credit">
          You have <strong>{formatPrice(creditKes)}</strong> credit from earlier payments.
          {canUseCredit ? " It covers this payment." : <> It is already counted below, so you only need to pay <strong>{formatPrice(total)}</strong>.</>}
        </p>
      )}
      {canUseCredit && (
        <div>
          <button type="button" className={ui.btn} disabled={busy} onClick={useCredit}>{busy ? "Applying" : `Use my ${formatPrice(amount)} credit`}</button>
          {error && <p className={ui.error} role="alert">{error}</p>}
        </div>
      )}

      {configured ? (
        <>
          {prepay && choices.length > 1 && (
            <div className={ui.field}>
              <label className={ui.label} htmlFor="pay-months">How many months do you want to pay for?</label>
              <select id="pay-months" className={ui.input} value={n} onChange={(e) => setMonths(Number(e.target.value))}>
                {choices.map((m) => <option key={m} value={m}>{m === 1 ? "1 month" : `${m} months`}: {formatPrice(amount * m)}</option>)}
              </select>
            </div>
          )}
          {instructions.stk && total > 0 ? (
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
                title="Pay now with an M-Pesa prompt"
              />
              <details className={styles.payOther} open={paybillOpen} onToggle={(e) => setPaybillOpen(e.currentTarget.open)} data-testid="pay-paybill">
                <summary>Or pay with {paybill ? "Paybill" : "Buy Goods"} yourself</summary>
                {manual}
              </details>
            </>
          ) : manual}
        </>
      ) : (
        <p style={{ margin: 0 }} data-testid="pay-pending-details">We will send you the payment details by SMS shortly.</p>
      )}
    </section>
  );
}
