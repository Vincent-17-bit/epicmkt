import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@epicmkt/ui";
import { useSession } from "../state/session.js";
import { SELLER_ID_PATTERN, normalizeSellerId } from "../lib/password.js";
import AuthFrame from "../auth/AuthFrame.jsx";
import { PasswordField, TextField } from "../auth/Fields.jsx";
import styles from "../auth/auth.module.css";

const minutes = (seconds) => Math.max(1, Math.ceil(seconds / 60));

export default function Login() {
  const signIn = useSession((s) => s.signIn);
  const sessionNotice = useSession((s) => s.notice);
  const clearNotice = useSession((s) => s.clearNotice);
  const navigate = useNavigate();
  const location = useLocation();
  const [sellerId, setSellerId] = useState("");
  const [password, setPassword] = useState("");
  const [idError, setIdError] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const notice = location.state?.notice ?? sessionNotice;

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  useEffect(() => () => clearNotice(), [clearNotice]);

  const lockedLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockedLeft > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (busy || locked) return;
    const id = normalizeSellerId(sellerId);
    setError("");
    if (!SELLER_ID_PATTERN.test(id)) return setIdError("Enter your Seller ID, for example ES123456.");
    setIdError("");
    if (!password) return setError("Enter your password.");
    setBusy(true);
    try {
      await signIn(id, password);
      setPassword("");
      navigate(location.state?.from ?? "/", { replace: true });
    } catch (err) {
      setPassword("");
      if (err.code === "locked") {
        setLockedUntil(Date.now() + (err.retryAfter ?? 900) * 1000);
        setNow(Date.now());
      } else if (err.code === "deleted") setError(err.message);
      else if (err.code === "rate_limited") setError("Too many attempts. Please try again later.");
      else setError("Seller ID or password is incorrect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Seller login"
      intro="Sign in to manage your listing."
      footer={
        <>
          <Link to="/sign-in-help" className={styles.link}>Help</Link>
        </>
      }
    >
      {notice && <p className={styles.success} role="status">{notice}</p>}
      <form className={styles.actions} onSubmit={submit} noValidate>
        <TextField label="Seller ID" value={sellerId} onChange={(e) => setSellerId(e.target.value)} onBlur={() => setSellerId((v) => v.trim())} autoComplete="username" autoCapitalize="characters" spellCheck={false} placeholder="ES123456" error={idError} />
        <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {locked && <p className={styles.alert} role="alert">Too many attempts. Try again in {minutes(lockedLeft)} {minutes(lockedLeft) === 1 ? "minute" : "minutes"}.</p>}
        {error && !locked && <p className={styles.alert} role="alert">{error}</p>}
        <div className={styles.row}>
          <Link to="/forgot-password" className={styles.link}>Forgot password</Link>
        </div>
        <Button type="submit" disabled={busy || locked}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className={styles.note}>First time here? Use the temporary password we sent you. You will be asked to choose a new one.</p>
    </AuthFrame>
  );
}
