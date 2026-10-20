import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import AuthShell from "./AuthShell.jsx";
import CodeField from "./CodeField.jsx";

const groups = (secret) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

// First sign-in: scan the QR code (or type the key) into an authenticator app, then prove it with one code.
export default function MfaEnrolPage() {
  const { enrolTotp, verifyEnrol, signOut } = useAuth();
  const [setup, setSetup] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const alive = useRef(false);

  const start = async () => {
    setLoadError("");
    const result = await enrolTotp();
    if (!alive.current) return;
    if (result.error) {
      setLoadError(
        /disabled|not enabled|mfa_totp/i.test(`${result.error.message} ${result.error.code ?? ""}`)
          ? "Authenticator setup is turned off for this Supabase project. Enable TOTP under Authentication, Multi-Factor, then try again."
          : "We could not start setup. Try again.",
      );
      return;
    }
    setSetup(result);
  };

  useEffect(() => {
    alive.current = true;
    if (!started.current) {
      started.current = true; // StrictMode runs effects twice; enrol once
      start();
    }
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || !setup || code.length !== 6) return;
    setBusy(true);
    setError("");
    const { error: failure } = await verifyEnrol(setup.factorId, code);
    if (failure) {
      setError("That code did not work. Check your authenticator app and try again.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set up your authenticator"
      lead="Every admin account needs a second step. Use an app such as Google Authenticator, Microsoft Authenticator or Authy."
    >
      {loadError ? (
        <>
          <p className="admin-login__error" role="alert">{loadError}</p>
          <button type="button" className="primary-button admin-login__submit" onClick={start}>Try again</button>
        </>
      ) : !setup ? (
        <p className="admin-login__lead" role="status">Preparing your setup…</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <ol className="admin-login__steps">
            <li>
              <p><strong>Scan this code</strong> with the app.</p>
              {setup.qr ? <img className="admin-login__qr" src={setup.qr} width="176" height="176" alt="QR code for your authenticator app" /> : null}
              <p className="admin-login__alt">Cannot scan? Enter this key instead:</p>
              <p><code className="admin-login__secret">{groups(setup.secret)}</code></p>
            </li>
            <li>
              <p><strong>Enter the 6-digit code</strong> the app shows.</p>
              {error ? <p className="admin-login__error" role="alert">{error}</p> : null}
              <CodeField id="mfa-enrol-code" value={code} onChange={setCode} autoFocus={false} />
            </li>
          </ol>
          <button type="submit" className="primary-button admin-login__submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Turn on and continue"}
          </button>
        </form>
      )}
      <button type="button" className="admin-login__link" onClick={() => signOut()}>Sign out</button>
    </AuthShell>
  );
}
