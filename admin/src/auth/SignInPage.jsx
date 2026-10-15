import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { useAuth } from "./AuthProvider.jsx";
import AuthShell from "./AuthShell.jsx";
import { isLive } from "../lib/supabase.js";

export default function SignInPage() {
  const { signIn, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || "We could not sign you in. Try again.");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" lead="Use your admin email and password. You will be asked for a code from your authenticator app next." notice={notice}>
      <form onSubmit={onSubmit} className="form" noValidate>
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <span className="field__row">
            <input type={show ? "text" : "password"} name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="icon-button" aria-pressed={show} aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}><Icon name={show ? "eyeOff" : "eye"} /></button>
          </span>
        </label>
        <p className="form__error" role="alert">{error}</p>
        <button type="submit" className="button button--primary button--block" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      {isLive ? null : <p className="auth-help auth-help--mock">Mock mode. Try owner@, reviewer@, finance@, support@ or stranger@ any domain, any password of 8+ characters, code 123456.</p>}
    </AuthShell>
  );
}
