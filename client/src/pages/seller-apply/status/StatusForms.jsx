import { useEffect, useState } from "react";
import { Button, PhoneInput } from "@epicmkt/ui";
import { findReference, requestStatusOtp, verifyStatusOtp, devTools } from "../../../api/applications/index.js";
import { normalizePhone } from "../../../shared/validators.js";
import { ErrorLine } from "../Field.jsx";
import form from "../form.module.css";
import styles from "./status.module.css";

const REF = /^EPM-\d{4}-[A-Z0-9]{6}$/;
const EXAMPLE = `EPM-${new Date().getFullYear()}-ABC234`;

export function RequestForm({ initial, onSent }) {
  const [ref, setRef] = useState(initial.ref ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState({ busy: false, message: "", error: "" });

  // "Lost your reference?": the phone number below is enough. The reply is the same whether or not it applied, and the SMS only
  // goes to that phone, so nobody learns anything about someone else's number.
  const sendReference = async () => {
    const norm = normalizePhone(phone);
    setFormError("");
    if (!norm) {
      setErrors({ phone: "Enter the phone number you applied with, then choose Text me my reference." });
      document.getElementById("status-phone")?.focus();
      return;
    }
    setErrors({});
    setLost({ busy: true, message: "", error: "" });
    try {
      const res = await findReference({ phone: norm });
      setLost({ busy: false, message: res.message, error: "" });
    } catch (err) {
      const key = err?.details?.error ?? err?.message;
      setLost({
        busy: false,
        message: "",
        error: key === "rate_limited"
          ? err.details?.retryAfter > 60 ? "You have asked for your reference too many times. Please try again later." : "Please wait a minute before asking again."
          : "We could not send it. Check your connection and try again."
      });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    const cleanRef = ref.trim().toUpperCase();
    const norm = normalizePhone(phone);
    if (!REF.test(cleanRef)) next.ref = `Enter your reference number, for example ${EXAMPLE}`;
    if (!norm) next.phone = "Enter the phone number you applied with. Choose its country, then type the number.";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return document.querySelector('form [aria-invalid="true"]')?.focus();
    setBusy(true);
    try {
      const res = await requestStatusOtp({ referenceNo: cleanRef, phone: norm });
      onSent({ ref: cleanRef, phone: norm, message: res.message });
    } catch (err) {
      const key = err?.details?.error ?? err?.message;
      setFormError(
        key === "rate_limited"
          ? err.details?.retryAfter > 60
            ? "You have asked for too many codes. Please try again in an hour."
            : "Please wait a minute before asking for another code."
          : "We could not send a code. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-labelledby="check-title">
      <h1 id="check-title">Check my application</h1>
      <p className={styles.small}>Enter your reference number and phone number. We will send a code by SMS.</p>
      <div className={form.field}>
        <label htmlFor="status-ref" className={form.label}>Reference number</label>
        <input id="status-ref" className={form.input} value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder={EXAMPLE} aria-invalid={errors.ref ? true : undefined} aria-describedby={errors.ref ? "status-ref-err" : undefined} />
        <ErrorLine id="status-ref-err" message={errors.ref} />
        <p className={styles.small}>
          Lost it? Enter your phone number below, then{" "}
          <button type="button" className={styles.linkBtn} onClick={sendReference} disabled={lost.busy}>
            {lost.busy ? "sending" : "text me my reference"}
          </button>
          .
        </p>
        {lost.message && <p role="status" className={styles.small}>{lost.message}</p>}
        <ErrorLine message={lost.error} />
      </div>
      <div className={form.field}>
        <label htmlFor="status-phone" className={form.label}>Phone number</label>
        <PhoneInput id="status-phone" inputClassName={form.input} value={phone} onChange={setPhone} aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? "status-phone-err" : undefined} style={{ "--phone-h": "var(--ap-input-h)", "--phone-radius": "var(--ap-r)" }} />
        <ErrorLine id="status-phone-err" message={errors.phone} />
      </div>
      <ErrorLine message={formError} />
      <Button type="submit" disabled={busy}>
        {busy ? "Sending" : "Send me a code"}
      </Button>
    </form>
  );
}

export function CodeForm({ details, onVerified, onBack }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [wait, setWait] = useState(60);
  const [resent, setResent] = useState("");
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6 digit code from your SMS.");
    setBusy(true);
    try {
      const session = await verifyStatusOtp({ referenceNo: details.ref, phone: details.phone, code, remember });
      onVerified({ ...session, ref: details.ref });
    } catch (err) {
      const key = err?.details?.error ?? err?.message;
      if (key === "too_many_attempts") {
        setLocked(true);
        setError("Too many wrong tries. Wait a minute, then ask for a new code.");
      } else if (key === "rate_limited") setError("Too many tries. Please wait a while and try again.");
      else if (key === "invalid_code") {
        const left = err.details?.attemptsLeft;
        setError(left !== undefined ? `That code is not correct. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not correct or has expired.");
      } else setError("We could not check the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    setResent("");
    try {
      await requestStatusOtp({ referenceNo: details.ref, phone: details.phone });
      setLocked(false);
      setCode("");
      setWait(60);
      setResent("If these details match an application, we have sent a new code.");
    } catch (err) {
      setError(err?.details?.retryAfter > 60 ? "You have asked for too many codes. Please try again in an hour." : "Please wait a minute before asking for another code.");
    }
  };

  return (
    <form className={styles.card} onSubmit={verify} noValidate aria-labelledby="code-title">
      <h1 id="code-title">Enter your code</h1>
      <p role="status">If these details match an application, we have sent a code.</p>
      {devTools && <p className={styles.small}>Development: the code is 123456.</p>}
      <div className={form.field}>
        <label htmlFor="status-code" className={form.label}>6 digit code</label>
        <input id="status-code" className={form.input} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={locked} aria-invalid={error ? true : undefined} aria-describedby={error ? "status-code-err" : undefined} />
        <ErrorLine id="status-code-err" message={error} />
      </div>
      <label className={form.checkRow}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember this device for 30 days</span>
      </label>
      {resent && <p role="status" className={styles.small}>{resent}</p>}
      <div className={styles.formActions}>
        <Button type="submit" disabled={busy || locked}>
          {busy ? "Checking" : "Check my application"}
        </Button>
        <Button variant="secondary" onClick={resend} disabled={wait > 0}>
          {wait > 0 ? `Resend in ${wait}s` : "Send a new code"}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Change details
        </Button>
      </div>
    </form>
  );
}
