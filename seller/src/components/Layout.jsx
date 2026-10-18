import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/index.js";
import { getTheme, setTheme } from "../lib/theme.js";
import { useRealtime } from "../lib/useRealtime.js";
import { useState } from "react";
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
  const unread = useQuery({ queryKey: BELL_KEY, queryFn: api.unreadCount });
  useRealtime(["messages"], () => {
    qc.invalidateQueries({ queryKey: BELL_KEY });
    qc.invalidateQueries({ queryKey: ["messages"] });
  });

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
          <NavLink to="/business/subscription">Subscription</NavLink>
          <Bell count={unread.data ?? 0} />
          <NavLink to="/business/questions">Questions</NavLink>
          <NavLink to="/business/exceptions">Exceptions</NavLink>
          <NavLink to="/business/flash">Flash sales</NavLink>
        </nav>
        <button type="button" className={styles.iconBtn} onClick={toggle} aria-pressed={theme === "dark"} aria-label="Dark theme">
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <button type="button" className={styles.iconBtn} onClick={signOut}>Sign out</button>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
