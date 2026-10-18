import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

function messageFor(error) {
  const text = String(error?.message ?? "");
  if (error?.status === 429 || /rate limit|too many/i.test(text)) return "Too many attempts. Wait a minute and try again.";
  if (/invalid login credentials/i.test(text)) return "That email and password do not match.";
  if (/email not confirmed/i.test(text)) return "This email is not confirmed yet. Confirm the user in Supabase, then try again.";
  if (/failed to fetch|network/i.test(text)) return "Cannot reach the server. Check your connection and try again.";
  return "Sign-in failed. Check your details and try again.";
}

// Only send people back to another admin page, never to an outside address.
function safeTarget(from) {
  if (typeof from !== "string") return "/admin";
  if (!from.startsWith("/admin") || from.startsWith("/admin/login") || from.startsWith("//")) return "/admin";
  return from;
}

export default function LoginPage() {
  const { status, denied, configError, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (status === "admin") return <Navigate to={safeTarget(location.state?.from)} replace />;

  const busy = submitting || status === "loading";

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || configError) return;
    setError("");
    setSubmitting(true);
    const { error: failure } = await signIn(email, password);
    setSubmitting(false);
    if (failure) setError(messageFor(failure));
  }

  const notice = configError || error || (denied ? "This account is not an EpicMKT admin. Sign in with an admin account." : "");

  return (
    <main className="admin-login">
      <form className="admin-login__card" onSubmit={handleSubmit} noValidate>
        <div className="admin-login__brand">
          <div className="admin-login__logo" aria-hidden="true">E</div>
          <div>
            <strong>EpicMKT</strong>
            <span>Admin</span>
          </div>
        </div>

        <h1 className="admin-login__title">Sign in</h1>
        <p className="admin-login__lead">Use the email and password of your admin account.</p>

        {notice ? <p className="admin-login__error" role="alert">{notice}</p> : null}

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

        <div className="admin-login__field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={Boolean(configError)}
          />
        </div>

        <button
          type="submit"
          className="primary-button admin-login__submit"
          disabled={busy || Boolean(configError) || !email || !password}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
