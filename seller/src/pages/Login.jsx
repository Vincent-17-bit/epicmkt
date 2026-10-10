import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { login } from "../api/index.js";

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sellerId, setSellerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(sellerId.trim(), password);
      qc.setQueryData(["session"], true);
      navigate("/business/account", { replace: true });
    } catch (err) {
      setError(err.code === "locked" ? "Too many attempts. Try again in a few minutes." : "Seller ID or password is incorrect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="sx-center">
      <form className="sx-card sx-login" onSubmit={submit}>
        <h1>Seller sign in</h1>
        <label className="sx-field">
          <span>Seller ID</span>
          <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} autoComplete="username" autoCapitalize="characters" required />
        </label>
        <label className="sx-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="sx-error" role="alert">{error}</p>}
        <button type="submit" className="sx-btn sx-btn--primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
