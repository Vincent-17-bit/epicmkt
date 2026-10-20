import { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import AuthShell from "./AuthShell.jsx";
import CodeField from "./CodeField.jsx";

// Every sign-in: the 6-digit code from the authenticator app.
export default function MfaChallengePage() {
  const { challengeTotp, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError("");
    const { error: failure } = await challengeTotp(code);
    if (failure) {
      setError(/rate|too many/i.test(failure.message ?? "") ? "Too many attempts. Wait a minute and try again." : "That code did not work. Check your authenticator app and try again.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Enter your code" lead="Open your authenticator app and type the 6-digit code for EpicMKT admin.">
      <form onSubmit={onSubmit} noValidate>
        {error ? <p className="admin-login__error" role="alert">{error}</p> : null}
        <CodeField id="mfa-code" value={code} onChange={setCode} />
        <button type="submit" className="primary-button admin-login__submit" disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Continue"}
        </button>
        <button type="button" className="admin-login__link" onClick={() => signOut()}>Sign out</button>
      </form>
    </AuthShell>
  );
}
