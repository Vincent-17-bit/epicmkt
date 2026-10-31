import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@epicmkt/ui";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import ui from "../styles/ui.module.css";
import ForgotPassword from "./ForgotPassword.jsx";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
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
          <input id="sid" className={ui.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pw">Password</label>
          <input id="pw" type="password" className={ui.input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <p className={ui.error} role="alert">{error}</p>}
        <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setForgot(true)}>Forgot password?</button>
      </form>
    </div>
  );
}
