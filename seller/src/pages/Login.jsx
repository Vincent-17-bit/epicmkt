import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import ui from "../styles/ui.module.css";

export default function Login() {
  const [sellerId, setSellerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.login(sellerId.trim(), password);
      await qc.invalidateQueries();
      navigate(location.state?.from ?? "/business/subscription", { replace: true });
    } catch (err) {
      setError(errorText(err, "Seller ID or password is incorrect."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ui.page} style={{ maxWidth: "26rem" }}>
      <form className={ui.card} onSubmit={submit} noValidate>
        <h1 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Seller sign in</h1>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="sid">Seller ID</label>
          <input id="sid" className={ui.input} value={sellerId} onChange={(e) => setSellerId(e.target.value)} autoComplete="username" autoCapitalize="characters" />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pw">Password</label>
          <input id="pw" type="password" className={ui.input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <p className={ui.error} role="alert">{error}</p>}
        <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </div>
  );
}
