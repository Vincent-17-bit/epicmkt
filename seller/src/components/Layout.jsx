import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/index.js";
import { getTheme, setTheme } from "../lib/theme.js";
import { useRealtime } from "../lib/useRealtime.js";
import { useEffect, useState } from "react";
import ui from "../styles/ui.module.css";
import styles from "./Layout.module.css";

export const BELL_KEY = ["unread"];

export function Bell({ count }) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <NavLink to="/business/notifications" aria-label={label}>
      <span aria-hidden="true">Notifications</span>
      {count > 0 && (
        <span className={styles.badge} data-testid="bell-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [theme, setThemeState] = useState(getTheme());
  const { pathname } = useLocation();
  const unread = useQuery({ queryKey: BELL_KEY, queryFn: api.unreadCount });
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const business = me.data?.business;
  const suspended = business?.status === "suspended";
  // Receiving a message on this device is what gives staff two green ticks. Offline devices do this on next open.
  const ack = () => api.ackDelivered().then((n) => { if (n) qc.invalidateQueries({ queryKey: ["messages"] }); }).catch(() => {});
  useEffect(() => { ack(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime(["messages"], () => {
    qc.invalidateQueries({ queryKey: BELL_KEY });
    qc.invalidateQueries({ queryKey: ["messages"] });
    ack();
  });
  useRealtime(["businesses"], () => qc.invalidateQueries({ queryKey: ["subscription"] }));
  // A suspended seller can read notices and answer staff. Nothing else.
  const allowed = !suspended || /^\/business\/(notifications|questions)/.test(pathname);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  const signOut = async () => {
    await api.logout();
    qc.clear();
    navigate("/login");
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/business/subscription" className={styles.brand}>EpicMKT Seller</Link>
        <nav className={styles.nav} aria-label="Business">
          {!suspended && <NavLink to="/business/subscription">Subscription</NavLink>}
          <Bell count={unread.data ?? 0} />
          <NavLink to="/business/questions">Questions</NavLink>
          {!suspended && <NavLink to="/business/exceptions">Exceptions</NavLink>}
          {!suspended && <NavLink to="/business/flash">Flash sales</NavLink>}
        </nav>
        <button type="button" className={styles.iconBtn} onClick={toggle} aria-pressed={theme === "dark"} aria-label="Dark theme">
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <button type="button" className={styles.iconBtn} onClick={signOut}>Sign out</button>
      </header>
      <main className={styles.main}>
        {suspended && (
          <div className={`${ui.banner} ${ui.tone_danger}`} role="alert" data-testid="suspended-banner">
            <h2>Your account is suspended</h2>
            <p>{business.statusReason ? `Reason: ${business.statusReason}` : "EpicMKT suspended your account."} Your listing is hidden and you cannot change anything. You can read your notifications and answer EpicMKT under Questions.</p>
          </div>
        )}
        {!suspended && (business?.strikes ?? 0) > 0 && (
          <div className={`${ui.banner} ${ui.tone_warning}`} role="status" data-testid="strike-banner">
            <h2>{business.strikes === 1 ? "You have 1 strike" : `You have ${business.strikes} strikes`}</h2>
            <p>EpicMKT gives a strike when something on your listing breaks the rules. <Link className={ui.link} to="/business/notifications">See why in Notifications</Link>.</p>
          </div>
        )}
        {allowed ? <Outlet /> : <p className={ui.muted} data-testid="locked">This page is not available while your account is suspended.</p>}
      </main>
    </div>
  );
}
