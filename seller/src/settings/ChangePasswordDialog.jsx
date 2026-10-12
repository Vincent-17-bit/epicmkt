import { useState } from "react";
import { Button } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { formatCountdown, maskPhone } from "../lib/password.js";
import { NewPassword, OtpField } from "../auth/Fields.jsx";
import { useCountdown } from "../auth/useCountdown.js";
import authStyles from "../auth/auth.module.css";
import Dialog from "../listings/Dialog.jsx";
import { showToast } from "../state/toast.js";

const MAX_ATTEMPTS = 5;
const SENDS = 5;

export default function ChangePasswordDialog({ open, onClose, sellerId, phone }) {
  return (
    <Dialog open={open} onClose={onClose} title="Change password">
      <Flow sellerId={sellerId} phone={phone} onDone={onClose} />
    </Dialog>
  );
}

function Flow({ sellerId, phone, onDone }) {
  const [step, setStep] = useState("otp");
  const [sent, setSent] = useState(0);
  const [code, setCode] = useState("");
  const [attempts, setAttempts] = useState(MAX_ATTEMPTS);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, startWait] = useCountdown();
  const context = { sellerId, phone };

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

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await api.changePassword({ code, newPassword: password });
      showToast("Password changed. Other devices were signed out.");
      onDone();
    } catch (err) {
      if (err.code === "invalid_code") {
        setAttempts((n) => Math.max(0, n - 1));
        setCode("");
        setPassword("");
        setConfirm("");
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
      <form className={authStyles.actions} onSubmit={submit} noValidate>
        <p className={authStyles.hint}>Choose a new password. Other devices signed in to your account will be signed out.</p>
        <NewPassword password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} context={context} />
        {error && <p className={authStyles.alert} role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !ready}>{busy ? "Saving…" : "Change password"}</Button>
      </form>
    );
  }

  return (
    <form className={authStyles.actions} onSubmit={(e) => { e.preventDefault(); if (code.length === 6 && attempts > 0) { setError(""); setStep("password"); } }} noValidate>
      <p className={authStyles.hint}>For your security, we will text a 6-digit code to {maskPhone(phone)}.</p>
      {sent === 0 ? (
        <Button type="button" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send code"}</Button>
      ) : (
        <>
          <OtpField value={code} onChange={setCode} disabled={attempts === 0} />
          <p className={authStyles.hint}>{attempts === 0 ? "No attempts left. Request a new code." : `${attempts} ${attempts === 1 ? "attempt" : "attempts"} left. Codes sent: ${sent} of ${SENDS} this hour.`}</p>
          <button type="button" className={authStyles.linkBtn} onClick={send} disabled={busy || wait > 0 || sent >= SENDS}>
            {wait > 0 ? `Resend code in ${formatCountdown(wait)}` : "Resend code"}
          </button>
          <Button type="submit" disabled={code.length !== 6 || attempts === 0}>Continue</Button>
        </>
      )}
      {error && <p className={authStyles.alert} role="alert">{error}</p>}
    </form>
  );
}
