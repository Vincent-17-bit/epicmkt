import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "./state/session.js";
import styles from "./auth/auth.module.css";

export const Splash = () => (
  <div className={styles.page} role="status" aria-label="Loading">
    <span className={styles.srOnly}>Loading</span>
  </div>
);

export function Boot({ children }) {
  const phase = useSession((s) => s.phase);
  const init = useSession((s) => s.init);
  useEffect(() => {
    if (phase === "loading") init();
  }, [phase, init]);
  return phase === "loading" ? <Splash /> : children;
}

export function PublicOnly() {
  const phase = useSession((s) => s.phase);
  const me = useSession((s) => s.me);
  if (phase === "authed") return <Navigate to={me.mustChangePassword ? "/first-login" : "/"} replace />;
  return <Outlet />;
}

export function RequireSeller({ firstLogin = false }) {
  const phase = useSession((s) => s.phase);
  const me = useSession((s) => s.me);
  const location = useLocation();
  if (phase !== "authed") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.mustChangePassword && !firstLogin) return <Navigate to="/first-login" replace />;
  if (!me.mustChangePassword && firstLogin) return <Navigate to="/" replace />;
  return <Outlet />;
}
