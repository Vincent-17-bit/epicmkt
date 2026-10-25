import { useState } from "react";
import * as api from "../api/index.js";
import { PASSWORD_MESSAGES, passwordProblems } from "@epicmkt/shared";
import { errorText } from "../lib/errors.js";
import { PASSWORD_HINT } from "../lib/signIn.js";
import ui from "../styles/ui.module.css";

const radio = { display: "flex", alignItems: "flex-start", gap: "var(--space-2)", cursor: "pointer" };

// Reset a forgotten password without signing in: type your Seller ID or email, pick where the code goes
// (SMS to the phone on the listing, or email to a verified sign-in email), then enter the code and a new password.
export default function ForgotPassword({ initialIdentifier = "", onBack, onDone }) {
  const [step, setStep] = useState("request"); // request | reset
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [channel, setChannel] = useState("sms");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setError("");
    if (identifier.trim().length < 3) return setError("Enter your Seller ID or email.");
    setBusy(true);
    try {
      const r = await api.forgotRequest({ identifier: identifier.trim(), channel });
      setInfo(r?.message ?? "If we found an account, we have sent a code.");
      setStep("reset");
    } catch (err) {
      setError(errorText(err, "We could not send the code. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError("");
    if (!code.trim()) return setError("Enter the code we sent you.");
    const problems = passwordProblems(password, { sellerId: identifier.trim() });
    if (problems.length) return setError(problems.map((p) => PASSWORD_MESSAGES[p]).join(" "));
    setBusy(true);
    try {
      await api.forgotVerify({ identifier: identifier.trim(), code: code.trim(), newPassword: password });
      onDone();
    } catch (err) {
      setError(err?.code === "invalid_code" ? "That code is not valid or has expired." : errorText(err, "We could not reset your password. Check the code and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ui.page} style={{ maxWidth: "26rem" }}>
      {step === "request" ? (
        <form className={ui.card} onSubmit={send} noValidate>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Reset your password</h1>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="fp-id">Seller ID or email</label>
            <input id="fp-id" className={ui.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" />
          </div>
          <fieldset style={{ display: "grid", gap: "var(--space-2)", margin: 0, padding: 0, border: 0 }}>
            <legend className={ui.label}>Send my code by</legend>
            <label style={radio}><input type="radio" name="fp-channel" value="sms" checked={channel === "sms"} onChange={() => setChannel("sms")} /><span>SMS to the phone number on your listing</span></label>
            <label style={radio}><input type="radio" name="fp-channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} /><span>Email (only if you added and verified your email)</span></label>
          </fieldset>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Sending" : "Send code"}</button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onBack}>Back to sign in</button>
        </form>
      ) : (
        <form className={ui.card} onSubmit={reset} noValidate>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Choose a new password</h1>
          <p className={ui.muted}>{info}</p>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="fp-code">Code</label>
            <input id="fp-code" className={ui.input} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="fp-pw">New password</label>
            <input id="fp-pw" type={show ? "text" : "password"} className={ui.input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="fp-pw-hint" />
            <p id="fp-pw-hint" className={ui.muted}>{PASSWORD_HINT}</p>
          </div>
          <label style={radio}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /><span>Show password</span></label>
          {error && <p className={ui.error} role="alert">{error}</p>}
          <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Reset password"}</button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => { setStep("request"); setError(""); setCode(""); }}>Start again</button>
        </form>
      )}
    </div>
  );
}
