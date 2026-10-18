import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCopy, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "../../../shared/billing.js";
import styles from "./status.module.css";

const POLL_MS = 10000;

// The client never types an M-Pesa code. Paying the Paybill is enough: Safaricom tells our backend,
// the backend records the transaction code, and this card flips to "payment received" by itself.
export default function PaymentCard({ app, onDone }) {
  const [copied, setCopied] = useState("");
  const pay = app.payment;
  const waiting = app.status === "approved";
  const refresh = useRef(onDone);
  refresh.current = onDone;

  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => refresh.current?.(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting]);

  if (app.status === "payment_confirming") {
    return (
      <section className={styles.card} aria-labelledby="pay-title">
        <h2 id="pay-title">
          <FontAwesomeIcon icon={faCircleCheck} /> Payment received
        </h2>
        <p>
          We received your M-Pesa payment{pay?.code ? <> (code <strong>{pay.code}</strong>)</> : null}. We are confirming it now and will send your
          login details by SMS or WhatsApp. You do not need to do anything else.
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

  return (
    <section className={styles.card} aria-labelledby="pay-title">
      <h2 id="pay-title">Pay by M-Pesa</h2>
      {isPaybill ? (
        <ol className={styles.paySteps}>
          <li>Open <strong>M-Pesa</strong> on your phone and choose <strong>Lipa na M-Pesa</strong>, then <strong>Paybill</strong>.</li>
          <li>
            Business number: <strong>{pay.number}</strong> {copyBtn("number", pay.number, "Copy business number")}
          </li>
          <li>
            Account number: <strong>{pay.account}</strong> {copyBtn("account", pay.account, "Copy account number")}
            <span className={styles.payHint}> Use your business name exactly as shown, including capitals and spaces. This is how we know the payment is yours.</span>
          </li>
          <li>Amount: <strong>{formatKes(pay.amount)}</strong></li>
          <li>Enter your M-Pesa PIN and send.</li>
        </ol>
      ) : (
        <p>We will send you the payment details by SMS shortly.</p>
      )}
      {isPaybill && (
        <p className={styles.payHint} role="status">
          <FontAwesomeIcon icon={faHourglassHalf} /> That is all. This page updates by itself when your payment arrives.
        </p>
      )}
    </section>
  );
}
