import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { useCooldown } from "../components/useCooldown.js";
import { authMessage } from "../lib/authErrors.js";
import { looksLikeCode, onlyDigits, passwordProblem } from "../lib/password.js";

const ROLE_LABEL = { owner: "Owner", reviewer: "Reviewer", finance: "Finance", support: "Support" };

export default function AccountPage() {
  const { admin, demo, sendChangeCode, changePassword } = useAuth();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [cooldown, startCooldown] = useCooldown(60);

  async function handleSend() {
    if (busy || cooldown > 0) return;
    setError("");
    setBusy(true);
    const { error: failure } = await sendChangeCode();
    setBusy(false);
    if (failure) return setError(authMessage(failure, "We could not send the code. Try again in a minute."));
    setCodeSent(true);
    setDone(false);
    startCooldown();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!looksLikeCode(code)) return setError("Enter the code from the email (digits only).");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The two passwords do not match.");
    setError("");
    setBusy(true);
    const { error: failure } = await changePassword(password, code);
    setBusy(false);
    if (failure) return setError(authMessage(failure, "We could not change the password. Try again."));
    setCode("");
    setPassword("");
    setConfirm("");
    setCodeSent(false);
    setDone(true);
  }

  return (
    <div className="page-shell">
      <section className="panel account-panel">
        <div className="panel__header">
          <h3>Your account</h3>
        </div>
        <dl className="account-details">
          <div><dt>Name</dt><dd>{admin?.displayName || "—"}</dd></div>
          <div><dt>Email</dt><dd>{admin?.email || "—"}</dd></div>
          <div><dt>Role</dt><dd>{ROLE_LABEL[admin?.role] ?? admin?.role ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="panel account-panel">
        <div className="panel__header">
          <h3>Change password</h3>
        </div>

        {demo ? (
          <p className="admin-login__lead">Changing the password needs the live Supabase connection, which is off in demo mode.</p>
        ) : (
          <>
            <p className="admin-login__lead">
              For your safety we send a code to <strong>{admin?.email}</strong> before the password can change.
              Other devices are signed out afterwards.
            </p>

            {done ? <p className="admin-login__success" role="status">Password changed. Other devices have been signed out.</p> : null}
            {error ? <p className="admin-login__error" role="alert">{error}</p> : null}

            {!codeSent ? (
              <button type="button" className="primary-button" onClick={handleSend} disabled={busy}>
                {busy ? "Sending…" : "Send me a code"}
              </button>
            ) : (
              <form className="account-form" onSubmit={handleSubmit} noValidate>
                <div className="admin-login__field">
                  <label htmlFor="change-code">Code from the email</label>
                  <input
                    id="change-code"
                    className="admin-login__code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    value={code}
                    onChange={(event) => setCode(onlyDigits(event.target.value))}
                  />
                </div>
                <PasswordField
                  id="change-password"
                  label="New password"
                  autoComplete="new-password"
                  value={password}
                  onChange={setPassword}
                  hint="At least 10 characters, with letters and numbers."
                />
                <PasswordField
                  id="change-confirm"
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={setConfirm}
                />
                <div className="account-form__actions">
                  <button type="submit" className="primary-button" disabled={busy || !code || !password || !confirm}>
                    {busy ? "Saving…" : "Change password"}
                  </button>
                  <button type="button" className="secondary-button" onClick={handleSend} disabled={busy || cooldown > 0}>
                    {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the code again"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
