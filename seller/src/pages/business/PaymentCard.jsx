import { useState } from "react";
import { Link } from "react-router-dom";
import { formatKes, formatDay, normalizeMpesaCode, isMpesaCode, PAYMENT_KIND_LABELS } from "@epicmkt/shared/billing";
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

/**
 * The one place a seller pays. It only shows what the server computed (account number and exact amount),
 * so automatic payment matching can confirm a payment later without any change here.
 */
export default function PaymentCard({ instructions, openPayment, received, onSubmit, onDismissReceived }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (received) {
    return (
      <section className={`${ui.card} ${ui.tone_ok}`} aria-labelledby="pay-title" data-testid="payment-received">
        <h2 id="pay-title">Payment received</h2>
        <p style={{ margin: 0 }}>
          Thank you. We received {formatKes(received.amount)}
          {received.periodEnd ? <> and your listing is paid until <strong>{formatDay(received.periodEnd)}</strong></> : null}.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <Link className={ui.btn} to={`/business/subscription/receipts/${received.id}`}>View receipt {received.receiptNo}</Link>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onDismissReceived}>Done</button>
        </div>
      </section>
    );
  }

  if (openPayment) {
    return (
      <section className={ui.card} aria-labelledby="pay-title" data-testid="payment-confirming">
        <h2 id="pay-title">Payment under confirmation</h2>
        <p style={{ margin: 0 }}>
          We have your M-Pesa code <strong className={styles.mono}>{openPayment.mpesaCode}</strong> for {formatKes(openPayment.amount)}
          {" "}({PAYMENT_KIND_LABELS[openPayment.kind] ?? openPayment.kind}). We will confirm it shortly. This page updates by itself.
        </p>
      </section>
    );
  }

  if (!instructions) return null;
  const { configured, method, number, name, account, amount, purpose } = instructions;
  const paybill = method !== "till";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const value = normalizeMpesaCode(code);
    if (!isMpesaCode(value)) return setError(errorText({ code: "invalid_code_format" }));
    setBusy(true);
    try {
      await onSubmit(value);
      setCode("");
    } catch (err) {
      setError(errorText(err, "We could not save your code. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={ui.card} aria-labelledby="pay-title" data-testid="payment-card">
      <h2 id="pay-title">{TITLES[purpose] ?? "Pay by M-Pesa"}</h2>
      {configured ? (
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
              <dd data-testid="pay-amount"><span>{formatKes(amount)}</span><CopyButton value={amount} label="amount" /></dd>
            </div>
          </dl>
          <ol className={styles.steps}>
            <li>Open M-Pesa on your phone and choose {paybill ? "Lipa na M-Pesa, then Pay Bill" : "Lipa na M-Pesa, then Buy Goods and Services"}.</li>
            <li>Enter {paybill ? "the Paybill number" : "the till number"} <strong>{number}</strong>.</li>
            {paybill && <li>Type <strong>{account}</strong> as the account number, exactly as shown.</li>}
            <li>Enter the exact amount, <strong>{formatKes(amount)}</strong>, and your M-Pesa PIN.</li>
            <li>Type the 10 character code from the M-Pesa SMS below and press I have paid.</li>
          </ol>
        </>
      ) : (
        <p style={{ margin: 0 }} data-testid="pay-pending-details">We will send you the payment details by SMS shortly.</p>
      )}
      <form onSubmit={submit} noValidate className={ui.field}>
        <label className={ui.label} htmlFor="mpesa-code">M-Pesa transaction code</label>
        <input
          id="mpesa-code" className={`${ui.input} ${styles.mono}`} value={code} maxLength={10} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={error ? true : undefined} aria-describedby={error ? "mpesa-err" : undefined}
        />
        {error && <p id="mpesa-err" className={ui.error} role="alert">{error}</p>}
        <button type="submit" className={ui.btn} disabled={busy} style={{ justifySelf: "start" }}>{busy ? "Saving" : "I have paid"}</button>
      </form>
    </section>
  );
}
