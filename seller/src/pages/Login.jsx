import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import ui from "../styles/ui.module.css";
import ForgotPassword from "./ForgotPassword.jsx";
import { DEFAULT_CLIENT_URL, clientBase } from "./business/catalog/panel/publicItem.js";

// The application status page on the buyer site: behind an SMS code sent to the applicant's phone, it shows the Seller ID once the shop
// is live, so a seller who lost the SMS can still find it.
export const statusPageUrl = () => `${clientBase() || DEFAULT_CLIENT_URL}/become-a-seller/status`;
const check = { display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" };

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.login(identifier.trim(), password);
      await qc.invalidateQueries();
      navigate(location.state?.from ?? "/business", { replace: true });
    } catch (err) {
      setError(errorText(err, "Seller ID or password is incorrect."));
    } finally {
      setBusy(false);
    }
  };

  if (forgot) {
    return (
      <ForgotPassword
        initialIdentifier={identifier}
        onBack={() => setForgot(false)}
        onDone={() => { setForgot(false); setPassword(""); setNotice("Your password was changed. Sign in with your new password."); }}
      />
    );
  }

  return (
    <div className={ui.page} style={{ maxWidth: "26rem" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-4)" }}>
        <Logo size={44} />
      </div>
      <form className={ui.card} onSubmit={submit} noValidate>
        <h1 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Seller sign in</h1>
        {notice && <p role="status" style={{ margin: 0, color: "var(--ok-text)", fontWeight: 600 }}>{notice}</p>}
        <div className={ui.field}>
          <label className={ui.label} htmlFor="sid">Seller ID or email</label>
          <input id="sid" className={ui.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" aria-describedby="sid-hint" />
          <p id="sid-hint" className={ui.muted} style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Your Seller ID (like ES123456) came by SMS and email when your shop went live. Lost it?{" "}
            <a href={statusPageUrl()}>Check your application</a> to see it again.
          </p>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pw">Password</label>
          <input id="pw" type={show ? "text" : "password"} className={ui.input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <label style={check}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /><span>Show password</span></label>
        {error && <p className={ui.error} role="alert">{error}</p>}
        <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setForgot(true)}>Forgot password?</button>
      </form>
    </div>
  );
}
