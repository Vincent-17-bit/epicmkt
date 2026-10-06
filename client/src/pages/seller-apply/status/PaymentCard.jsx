import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import Button from "../../../components/Button.jsx";
import { formatKes } from "../../../shared/billing.js";
import { submitPaymentCode } from "../../../api/applications/index.js";
import { ErrorLine } from "../Field.jsx";
import form from "../form.module.css";
import styles from "./status.module.css";

const ERRORS = {
  invalid_code_format: "Enter the 10 character M-Pesa transaction code from your SMS.",
  rate_limited: "Too many tries. Please wait a while and try again.",
  session_expired: "Your session ended. Check your application again to continue."
};

export default function PaymentCard({ app, session, onDone, onExpired }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pay = app.payment;

  if (app.status === "payment_confirming") {
    return (
      <section className={styles.card} aria-labelledby="pay-title">
        <h2 id="pay-title">
          <FontAwesomeIcon icon={faHourglassHalf} /> Payment under confirmation
        </h2>
        <p>We have your M-Pesa code {pay?.code ? <strong>{pay.code}</strong> : null}. We will confirm it and send your login details by SMS or WhatsApp.</p>
      </section>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pay.number);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const submit = async () => {
    setError("");
    const value = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(value)) return setError(ERRORS.invalid_code_format);
    setBusy(true);
    try {
      await submitPaymentCode(session, value);
      onDone();
    } catch (e) {
      const key = e?.details?.error ?? e?.message;
      if (key === "session_expired") onExpired();
      setError(ERRORS[key] ?? "We could not save your code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="pay-title">
      <h2 id="pay-title">Pay by M-Pesa</h2>
      {pay?.number ? (
        <dl className={styles.pay}>
          <div>
            <dt>{pay.method === "paybill" ? "Paybill number" : "Buy Goods till number"}</dt>
            <dd>
              <strong>{pay.number}</strong>
              <button type="button" className={styles.iconBtn} onClick={copy} aria-label="Copy number">
                <FontAwesomeIcon icon={faCopy} />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </dd>
          </div>
          {pay.method === "paybill" && pay.account && (
            <div>
              <dt>Account number</dt>
              <dd>{pay.account}</dd>
            </div>
          )}
          {pay.name && (
            <div>
              <dt>Name shown</dt>
              <dd>{pay.name}</dd>
            </div>
          )}
          <div>
            <dt>Amount</dt>
            <dd>
              <strong>{formatKes(pay.amount)}</strong>
            </dd>
          </div>
        </dl>
      ) : (
        <p>We will send you the payment details by SMS shortly.</p>
      )}
      <div className={form.field}>
        <label htmlFor="mpesa-code" className={form.label}>
          M-Pesa transaction code
        </label>
        <input id="mpesa-code" className={form.input} value={code} maxLength={10} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={error ? true : undefined} aria-describedby={error ? "mpesa-err" : undefined} />
        <ErrorLine id="mpesa-err" message={error} />
      </div>
      <Button onClick={submit} disabled={busy}>
        {busy ? "Saving" : "I have paid"}
      </Button>
    </section>
  );
}
