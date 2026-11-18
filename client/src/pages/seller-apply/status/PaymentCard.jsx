import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCopy, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { PayByPhone } from "@epicmkt/ui";
import { formatDay } from "@epicmkt/shared/billing";
import { formatPrice } from "../../../shared/billing.js";
import { getStkPayment, startStkPayment } from "../../../api/applications";
import styles from "./status.module.css";

const POLL_MS = 10000;
const MONTH_CHOICES = [1, 2, 3, 6, 12];

// Two ways to pay, and the client never types an M-Pesa code in either:
//   * Pay now: we send an M-Pesa PIN prompt to the phone; entering the PIN is all it takes.
//   * Paybill: pay the business number with the account number shown; Safaricom tells our backend.
// Either way the backend records the payment and this card flips to "payment received" by itself.
export default function PaymentCard({ app, session, onDone, onExpired }) {
  const [copied, setCopied] = useState("");
  const [months, setMonths] = useState(1);
  const [paybillOpen, setPaybillOpen] = useState(false);
  const pay = app.payment;
  const waiting = app.status === "approved";
  const refresh = useRef(onDone);
  refresh.current = onDone;

  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => refresh.current?.(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting]);

  const start = useCallback(async ({ phone }) => {
    try {
      return await startStkPayment(session, { phone, months });
    } catch (e) {
      if (e?.code === "session_expired") onExpired?.();
      throw e;
    }
  }, [session, months, onExpired]);
  const poll = useCallback((id) => getStkPayment(session, id), [session]);
  const paid = useCallback(() => refresh.current?.(), []);
  const fallback = useCallback(() => setPaybillOpen(true), []);

  if (app.status === "payment_confirming") {
    return (
      <section className={styles.card} aria-labelledby="pay-title">
        <h2 id="pay-title">
          <FontAwesomeIcon icon={faCircleCheck} /> Payment received
        </h2>
        <p>
          We received your M-Pesa payment{pay?.code ? <> (code <strong>{pay.code}</strong>)</> : null}
          {pay?.months > 1 ? <>, which covers <strong>{pay.months} months</strong></> : null}. We are setting up your business page now and will send your
          login details by SMS. You do not need to do anything else.
        </p>
      </section>
    );
  }

  const copy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setCopied("");
    }
  };

  const copyBtn = (key, value, label) => (
    <button type="button" className={styles.iconBtn} onClick={() => copy(key, value)} aria-label={label}>
      <FontAwesomeIcon icon={faCopy} />
      <span>{copied === key ? "Copied" : "Copy"}</span>
    </button>
  );

  const isPaybill = pay?.method === "paybill" && pay?.number && pay?.account;
  const received = Number(pay?.received ?? 0);
  const balance = Number(pay?.balance ?? pay?.amount ?? 0);
  const price = Number(pay?.amount ?? 0);
  const maxMonths = Math.max(1, Number(pay?.maxMonths ?? 12));
  const choices = MONTH_CHOICES.filter((m) => m <= maxMonths);
  const dueNow = Math.max(price * months - received, 0);

  const paybillSteps = isPaybill ? (
    <>
      <ol className={styles.paySteps}>
        <li>Open <strong>M-Pesa</strong> on your phone and choose <strong>Lipa na M-Pesa</strong>, then <strong>Paybill</strong>.</li>
        <li>
          Business number: <strong>{pay.number}</strong> {copyBtn("number", pay.number, "Copy business number")}
        </li>
        <li>
          Account number: <strong>{pay.account}</strong> {copyBtn("account", pay.account, "Copy account number")}
          <span className={styles.payHint}> Type it exactly as shown. This short code is yours alone, so we always know the payment is for your shop, even if another shop has the same name.</span>
        </li>
        <li>
          Amount: <strong>{formatPrice(balance > 0 ? balance : pay.amount)}</strong>
          <span className={styles.payHint}>
            {" "}You can pay for more months now if you like: {formatPrice(pay.amount * 2)} for 2 months, {formatPrice(pay.amount * 3)} for 3 months. Extra months are added to your listing automatically. If you pay a different amount, nothing is lost: it is recorded and counted toward your payment.
          </span>
        </li>
        <li>Enter your M-Pesa PIN and send.</li>
      </ol>
      <p className={styles.payHint} role="status">
        <FontAwesomeIcon icon={faHourglassHalf} /> That is all. This page updates by itself when your payment arrives.
      </p>
    </>
  ) : null;

  return (
    <section className={styles.card} aria-labelledby="pay-title">
      <h2 id="pay-title">Pay by M-Pesa</h2>
      {received > 0 && balance > 0 && (
        <p role="status" className={styles.payHint}>
          We already received <strong>{formatPrice(received)}</strong>. Please pay the remaining <strong>{formatPrice(balance)}</strong> to finish your first month.
        </p>
      )}

      {pay?.stk ? (
        <>
          {choices.length > 1 && (
            <label className={styles.payMonths}>
              <span>Pay for</span>
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {choices.map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"} ({formatPrice(Math.max(price * m - received, 0))})</option>)}
              </select>
            </label>
          )}
          <PayByPhone
            amount={dueNow}
            defaultPhone={app.phone}
            start={start}
            poll={poll}
            onPaid={paid}
            onFallback={fallback}
            formatDay={formatDay}
            title="Pay now with an M-Pesa prompt"
          />
          {isPaybill && (
            <details className={styles.payOther} open={paybillOpen} onToggle={(e) => setPaybillOpen(e.currentTarget.open)}>
              <summary>Or pay with Paybill yourself</summary>
              {paybillSteps}
            </details>
          )}
        </>
      ) : isPaybill ? paybillSteps : (
        <p>We will send you the payment details by SMS shortly.</p>
      )}
    </section>
  );
}
