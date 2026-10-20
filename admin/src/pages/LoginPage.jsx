import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { useCooldown } from "../components/useCooldown.js";
import { authMessage } from "../lib/authErrors.js";
import { looksLikeCode, onlyDigits, passwordProblem } from "../lib/password.js";
import { IDLE_NOTICE_KEY } from "../auth/IdleGuard.jsx";

// Only send people back to another admin page, never to an outside address.
function safeTarget(from) {
  if (typeof from !== "string") return "/admin";
  if (!from.startsWith("/admin") || from.startsWith("/admin/login") || from.startsWith("//")) return "/admin";
  return from;
}

function Brand() {
  return (
    <div className="admin-login__brand">
      <div className="admin-login__logo" aria-hidden="true">E</div>
      <div>
        <strong>EpicMKT</strong>
        <span>Admin</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const auth = useAuth();
  const { status, denied, configError } = auth;
  const location = useLocation();

  // step: signin | email | code | (new is derived from status === "recovering")
  const [step, setStep] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [idleNotice] = useState(() => {
    try {
      const text = sessionStorage.getItem(IDLE_NOTICE_KEY) ?? "";
      sessionStorage.removeItem(IDLE_NOTICE_KEY);
      return text;
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, startCooldown] = useCooldown(60);

  if (status === "admin") return <Navigate to={safeTarget(location.state?.from)} replace />;

  const view = status === "recovering" ? "new" : step;
  const working = busy || status === "loading";

  function go(next) {
    setStep(next);
    setError("");
    setInfo("");
  }

  async function handleSignIn(event) {
    event.preventDefault();
    if (working || configError) return;
    setError("");
    setInfo("");
    setBusy(true);
    const { error: failure } = await auth.signIn(email, password);
    setBusy(false);
    if (failure) setError(authMessage(failure, "Sign-in failed. Check your details and try again."));
  }

  async function sendCode() {
    setError("");
    setBusy(true);
    const { error: failure } = await auth.sendRecoveryCode(email);
    setBusy(false);
    if (failure) {
      setError(authMessage(failure, "We could not send the code. Try again in a minute."));
      return false;
    }
    startCooldown();
    // Same answer whether or not the address has an account, so this cannot be used to look people up.
    setInfo("If that email belongs to an account, a code has been sent. It expires in an hour.");
    return true;
  }

  async function handleEmail(event) {
    event.preventDefault();
    if (working || !email.trim()) return;
    if (await sendCode()) setStep("code");
  }

  async function handleResend() {
    if (working || cooldown > 0) return;
    await sendCode();
  }

  async function handleCode(event) {
    event.preventDefault();
    if (working) return;
    if (!looksLikeCode(code)) {
      setError("Enter the code from the email (digits only).");
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    const { error: failure } = await auth.verifyRecoveryCode(email, code);
    setBusy(false);
    if (failure) setError(authMessage(failure, "That code is wrong or has expired. Request a new one."));
    else {
      setCode("");
      setPassword("");
    }
  }

  async function handleNewPassword(event) {
    event.preventDefault();
    if (working) return;
    const problem = passwordProblem(newPassword);
    if (problem) return setError(problem);
    if (newPassword !== confirm) return setError("The two passwords do not match.");
    setError("");
    setBusy(true);
    const { error: failure } = await auth.finishRecovery(newPassword);
    setBusy(false);
    if (failure) {
      setError(authMessage(failure, "We could not change the password. Try again."));
      return;
    }
    setNewPassword("");
    setConfirm("");
    setStep("signin");
    setInfo("Password changed. Sign in with your new password.");
  }

  async function handleCancel() {
    await auth.cancelRecovery();
    setNewPassword("");
    setConfirm("");
    go("signin");
  }

  const notice = configError || error || (view === "signin" && denied ? "This account is not an EpicMKT admin. Sign in with an admin account." : "");

  return (
    <main className="admin-login">
      <div className="admin-login__card">
        <Brand />

        {view === "signin" && (
          <form onSubmit={handleSignIn} noValidate>
            <h1 className="admin-login__title">Sign in</h1>
            <p className="admin-login__lead">Use the email and password of your admin account.</p>
            {notice ? <p className="admin-login__error" role="alert">{notice}</p> : null}
            {!notice && (info || idleNotice) ? <p className="admin-login__success" role="status">{info || idleNotice}</p> : null}

            <div className="admin-login__field">
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(configError)}
              />
            </div>

            <PasswordField
              id="admin-password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              disabled={Boolean(configError)}
            />

            <button
              type="submit"
              className="primary-button admin-login__submit"
              disabled={working || Boolean(configError) || !email || !password}
            >
              {working ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" className="admin-login__link" onClick={() => go("email")} disabled={Boolean(configError)}>
              Forgot password?
            </button>
          </form>
        )}

        {view === "email" && (
          <form onSubmit={handleEmail} noValidate>
            <h1 className="admin-login__title">Reset password</h1>
            <p className="admin-login__lead">Enter your admin email and we will send you a code.</p>
            {error ? <p className="admin-login__error" role="alert">{error}</p> : null}
            <div className="admin-login__field">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <button type="submit" className="primary-button admin-login__submit" disabled={working || !email.trim()}>
              {working ? "Sending…" : "Send code"}
            </button>
            <button type="button" className="admin-login__link" onClick={() => go("signin")}>Back to sign in</button>
          </form>
        )}

        {view === "code" && (
          <form onSubmit={handleCode} noValidate>
            <h1 className="admin-login__title">Enter the code</h1>
            <p className="admin-login__lead">We sent a code to <strong>{email.trim()}</strong>.</p>
            {error ? <p className="admin-login__error" role="alert">{error}</p> : null}
            {!error && info ? <p className="admin-login__success" role="status">{info}</p> : null}
            <div className="admin-login__field">
              <label htmlFor="reset-code">Code from the email</label>
              <input
                id="reset-code"
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
            <button type="submit" className="primary-button admin-login__submit" disabled={working || !looksLikeCode(code)}>
              {working ? "Checking…" : "Verify code"}
            </button>
            <button type="button" className="admin-login__link" onClick={handleResend} disabled={working || cooldown > 0}>
              {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the code again"}
            </button>
            <button type="button" className="admin-login__link" onClick={() => go("email")}>Use a different email</button>
          </form>
        )}

        {view === "new" && (
          <form onSubmit={handleNewPassword} noValidate>
            <h1 className="admin-login__title">Choose a new password</h1>
            <p className="admin-login__lead">Your code was accepted. Set a new password for your account.</p>
            {error ? <p className="admin-login__error" role="alert">{error}</p> : null}
            <PasswordField
              id="new-password"
              label="New password"
              autoComplete="new-password"
              autoFocus
              value={newPassword}
              onChange={setNewPassword}
              hint="At least 10 characters, with letters and numbers."
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
            />
            <button type="submit" className="primary-button admin-login__submit" disabled={working || !newPassword || !confirm}>
              {working ? "Saving…" : "Change password"}
            </button>
            <button type="button" className="admin-login__link" onClick={handleCancel} disabled={working}>Cancel</button>
          </form>
        )}
      </div>
    </main>
  );
}
