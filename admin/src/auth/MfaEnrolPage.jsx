import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useAuth } from "./AuthProvider.jsx";
import AuthShell from "./AuthShell.jsx";
import CodeField from "./CodeField.jsx";
import { isLive } from "../lib/supabase.js";

const groups = (secret) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

/** First sign-in: scan the QR code (or type the key) into an authenticator app, then prove it with one code. */
export default function MfaEnrolPage() {
  const { enrol, verifyEnrol, signOut } = useAuth();
  const [setup, setSetup] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const alive = useRef(false);

  const start = () => {
    setLoadError("");
    enrol().then((next) => alive.current && setSetup(next)).catch((err) => alive.current && setLoadError(err.message));
  };

  useEffect(() => {
    alive.current = true;
    if (!started.current) { started.current = true; start(); } // StrictMode runs effects twice; enrol once
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || !setup || code.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      await verifyEnrol(setup.factorId, code);
    } catch (err) {
      setError(err.message || "That code did not work. Try again.");
      setCode("");
      setBusy(false);
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the key is also on screen */ }
  }

  return (
    <AuthShell wide title="Set up your authenticator" lead="Every admin account needs a second step. Use an app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy.">
      {loadError ? (
        <div className="form"><p className="form__error" role="alert">{loadError}</p><button type="button" className="button" onClick={start}>Try again</button></div>
      ) : !setup ? (
        <p className="auth-help" role="status">Preparing your setup…</p>
      ) : (
        <form onSubmit={onSubmit} className="form enrol" noValidate>
          <ol className="steps">
            <li>
              <p><strong>Scan this code</strong> with the app.</p>
              {setup.qr ? <img className="qr" src={setup.qr} width="176" height="176" alt="QR code for your authenticator app" /> : <div className="qr qr--none" role="img" aria-label="No QR code in mock mode">No QR in mock mode</div>}
              <p className="enrol__alt">Cannot scan? Enter this key instead:</p>
              <p className="secret"><code>{groups(setup.secret)}</code>
                <button type="button" className="icon-button" onClick={copy} aria-label="Copy key"><Icon name={copied ? "check" : "copy"} /></button>
                <span className="sr-only" role="status">{copied ? "Key copied" : ""}</span>
              </p>
            </li>
            <li>
              <p><strong>Enter the 6-digit code</strong> the app shows.</p>
              <CodeField value={code} onChange={setCode} label="6-digit code" autoFocus={false} />
            </li>
          </ol>
          <p className="form__error" role="alert">{error}</p>
          <button type="submit" className="button button--primary button--block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on and continue"}</button>
          {isLive ? null : <p className="auth-help auth-help--mock">Mock mode: the code is 123456.</p>}
        </form>
      )}
      <button type="button" className="link-button" onClick={() => signOut()}>Sign out</button>
    </AuthShell>
  );
}
