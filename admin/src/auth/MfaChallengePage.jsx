import { useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import AuthShell from "./AuthShell.jsx";
import CodeField from "./CodeField.jsx";

export default function MfaChallengePage() {
  const { challenge, signOut, user } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      await challenge(code);
    } catch (err) {
      setError(err.message || "That code did not work. Try again.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Enter your code" lead={`Open your authenticator app and enter the 6-digit code for ${user?.email ?? "your account"}.`}>
      <form onSubmit={onSubmit} className="form" noValidate>
        <CodeField value={code} onChange={setCode} />
        <p className="form__error" role="alert">{error}</p>
        <button type="submit" className="button button--primary button--block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
      </form>
      <button type="button" className="link-button" onClick={() => signOut()}>Use a different account</button>
    </AuthShell>
  );
}
