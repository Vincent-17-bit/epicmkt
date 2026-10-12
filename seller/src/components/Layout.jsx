import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleHalfStroke, faMoon, faRightFromBracket, faSun } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import * as auth from "../api/index.js";
import { applyMode, nextMode, readMode } from "../lib/theme.js";
import { useWorkspace } from "../lib/workspace.js";
import { Button, ReadOnlyBanner, ToastHost } from "./ui.jsx";
import Brand from "./Brand.jsx";
import styles from "./Layout.module.css";

const LINKS = [
  ["offers", "Offers and flash sales"],
  ["gallery", "Gallery"],
  ["team", "Team and schedule"],
  ["qr", "QR and poster"],
];

const ICONS = { light: faSun, dark: faMoon, system: faCircleHalfStroke };

export default function Layout() {
  const navigate = useNavigate();
  const [mode, setMode] = useState(readMode);
  const { business, readOnly } = useWorkspace();
  const session = useQuery({ queryKey: ["session"], queryFn: () => auth.isSignedIn(), staleTime: 30000 });

  useEffect(() => {
    if (session.data === false) navigate("/login", { replace: true });
  }, [session.data, navigate]);

  const cycle = () => {
    const next = nextMode(mode);
    setMode(next);
    applyMode(next);
  };

  if (session.isPending || session.data === false) return null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Brand className={styles.brand} />
          <div className={styles.actions}>
            {business && <span className={styles.who}>{business.name}</span>}
            <Button variant="ghost" size="sm" onClick={cycle} aria-label={`Theme: ${mode}. Change theme`} icon={ICONS[mode]} />
            <Button
              variant="ghost"
              size="sm"
              icon={faRightFromBracket}
              aria-label="Sign out"
              onClick={async () => {
                await auth.logout();
                navigate("/login", { replace: true });
              }}
            />
          </div>
        </div>
        <nav className={styles.nav} aria-label="Business sections">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={`/business/${to}`} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={styles.main}>
        {readOnly && <ReadOnlyBanner status={business.status} />}
        <Outlet />
      </main>
      <ToastHost />
    </div>
  );
}
