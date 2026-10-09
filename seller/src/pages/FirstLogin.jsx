import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { useSession } from "../state/session.js";
import { maskPhone } from "../lib/password.js";
import { formatCountdown } from "../lib/password.js";
import AuthFrame from "../auth/AuthFrame.jsx";
import { NewPassword, OtpField } from "../auth/Fields.jsx";
import { useCountdown } from "../auth/useCountdown.js";
import styles from "../auth/auth.module.css";

const MAX_ATTEMPTS = 5;
const SENDS = 5;

export default function FirstLogin() {
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const navigate = useNavigate();
  const [step, setStep] = useState("otp");
  const [sent, setSent] = useState(0);
  const [code, setCode] = useState("");
  const [attempts, setAttempts] = useState(MAX_ATTEMPTS);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, startWait] = useCountdown();
  const phone = me.business.phone;
  const context = { sellerId: me.business.seller_id, phone };

  const send = async () => {
    setError("");
    setBusy(true);
    try {
      await api.requestOtp();
      setSent((n) => n + 1);
      setCode("");
      setAttempts(MAX_ATTEMPTS);
      startWait(60);
    } catch (err) {
      if (err.code === "rate_limited") {
        startWait(err.retryAfter ?? 60);
        setError(sent >= SENDS - 1 ? "You have reached the limit of 5 codes per hour. Try again later." : "Please wait before requesting another code.");
      } else setError("We could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const next = (e) => {
    e.preventDefault();
    if (code.length === 6 && attempts > 0) {
      setError("");
      setStep("password");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await api.changePassword({ code, newPassword: password });
      setPassword("");
      setConfirm("");
      await refresh();
      navigate("/onboarding", { replace: true });
    } catch (err) {
      if (err.code === "invalid_code") {
        setAttempts((n) => Math.max(0, n - 1));
        setCode("");
        setStep("otp");
        setError("That code is not valid or has expired.");
      } else if (err.code === "weak_password") setError("Choose a stronger password.");
      else setError("We could not change your password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "password") {
    const ready = password.length > 0 && password === confirm;
    return (
      <AuthFrame title="First login" intro="Choose a new password. Other devices signed in to your account will be signed out.">
        <form className={styles.actions} onSubmit={submit} noValidate>
          <NewPassword password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} context={context} />
          {error && <p className={styles.alert} role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !ready}>{busy ? "Saving…" : "Save and continue"}</Button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="First login" intro={`For your security, confirm it is you. We will text a 6-digit code to ${maskPhone(phone)}.`}>
      <form className={styles.actions} onSubmit={next} noValidate>
        {sent === 0 ? (
          <Button type="button" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send code"}</Button>
        ) : (
          <>
            <OtpField value={code} onChange={setCode} disabled={attempts === 0} />
            <p className={styles.hint}>{attempts === 0 ? "No attempts left. Request a new code." : `${attempts} ${attempts === 1 ? "attempt" : "attempts"} left. Codes sent: ${sent} of ${SENDS} this hour.`}</p>
            <div className={styles.row}>
              <button type="button" className={styles.linkBtn} onClick={send} disabled={busy || wait > 0 || sent >= SENDS}>
                {wait > 0 ? `Resend code in ${formatCountdown(wait)}` : "Resend code"}
              </button>
            </div>
            <Button type="submit" disabled={code.length !== 6 || attempts === 0}>Continue</Button>
          </>
        )}
        {error && <p className={styles.alert} role="alert">{error}</p>}
      </form>
    </AuthFrame>
  );
}
