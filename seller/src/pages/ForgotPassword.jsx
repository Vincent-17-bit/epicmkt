import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { SELLER_ID_PATTERN, formatCountdown, normalizeSellerId } from "../lib/password.js";
import AuthFrame from "../auth/AuthFrame.jsx";
import { NewPassword, OtpField, TextField } from "../auth/Fields.jsx";
import { useCountdown } from "../auth/useCountdown.js";
import styles from "../auth/auth.module.css";

const GENERIC = "If these details match a listing, we have sent a code to its phone number.";
const MAX_ATTEMPTS = 5;
const digits = (v) => String(v).replace(/\D/g, "");

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("request");
  const [sellerId, setSellerId] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [code, setCode] = useState("");
  const [attempts, setAttempts] = useState(MAX_ATTEMPTS);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, startWait] = useCountdown();
  const id = normalizeSellerId(sellerId);

  const request = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const errs = {};
    if (!SELLER_ID_PATTERN.test(id)) errs.id = "Enter your Seller ID, for example ES123456.";
    if (digits(phone).length < 9) errs.phone = "Enter the phone number on your listing.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setError("");
    setBusy(true);
    try {
      await api.forgotRequest({ sellerId: id, phone: phone.trim() });
      startWait(60);
    } catch (err) {
      if (err.code === "rate_limited") {
        startWait(err.retryAfter ?? 60);
        setError("Please wait before requesting another code.");
      } else startWait(60);
    } finally {
      setBusy(false);
      setCode("");
      setAttempts(MAX_ATTEMPTS);
      setStep((s) => (s === "request" ? "code" : s));
    }
  };

  const toPassword = (e) => {
    e.preventDefault();
    if (code.length === 6 && attempts > 0) {
      setError("");
      setStep("password");
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await api.forgotVerify({ sellerId: id, code, newPassword: password });
      navigate("/login", { replace: true, state: { notice: "Your password was changed. Sign in with your new password." } });
    } catch (err) {
      if (err.code === "weak_password") setError("Choose a stronger password.");
      else if (err.code === "rate_limited") setError("Too many attempts. Please try again later.");
      else {
        setAttempts((n) => Math.max(0, n - 1));
        setCode("");
        setStep("code");
        setError("That code is not valid or has expired.");
      }
    } finally {
      setBusy(false);
    }
  };

  const back = <Link to="/login" className={styles.link}>Back to sign in</Link>;

  if (step === "password") {
    return (
      <AuthFrame title="Forgot password" intro="Choose a new password." footer={back}>
        <form className={styles.actions} onSubmit={reset} noValidate>
          <NewPassword password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} context={{ sellerId: id, phone }} />
          {error && <p className={styles.alert} role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !password || password !== confirm}>{busy ? "Saving…" : "Change password"}</Button>
        </form>
      </AuthFrame>
    );
  }

  if (step === "code") {
    return (
      <AuthFrame title="Forgot password" footer={back}>
        <p className={styles.note} role="status">{GENERIC}</p>
        <form className={styles.actions} onSubmit={toPassword} noValidate>
          <OtpField value={code} onChange={setCode} disabled={attempts === 0} />
          <p className={styles.hint}>{attempts === 0 ? "No attempts left. Request a new code." : `${attempts} ${attempts === 1 ? "attempt" : "attempts"} left.`}</p>
          <div className={styles.row}>
            <button type="button" className={styles.linkBtn} onClick={request} disabled={busy || wait > 0}>
              {wait > 0 ? `Resend code in ${formatCountdown(wait)}` : "Resend code"}
            </button>
          </div>
          {error && <p className={styles.alert} role="alert">{error}</p>}
          <Button type="submit" disabled={code.length !== 6 || attempts === 0}>Continue</Button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Forgot password" intro="Enter your Seller ID and the phone number on your listing. We will text you a code." footer={back}>
      <form className={styles.actions} onSubmit={request} noValidate>
        <TextField label="Seller ID" value={sellerId} onChange={(e) => setSellerId(e.target.value)} autoComplete="username" autoCapitalize="characters" spellCheck={false} placeholder="ES123456" error={fieldErrors.id} />
        <TextField label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="0712 345 678" error={fieldErrors.phone} />
        {error && <p className={styles.alert} role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send code"}</Button>
      </form>
    </AuthFrame>
  );
}
