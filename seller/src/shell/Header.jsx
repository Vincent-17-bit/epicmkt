import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faBell, faCircleQuestion, faGear, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "../state/theme.jsx";
import { PlanBadge, StatusChip } from "./Badges.jsx";
import styles from "./shell.module.css";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
];

const initials = (name) => String(name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

function AvatarMenu({ name, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { mode, setMode } = useTheme();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button type="button" className={styles.avatar} aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {initials(name)}
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Account menu">
          <p className={styles.menuName}>{name}</p>
          <Link role="menuitem" to="/settings" className={styles.menuItem} onClick={() => setOpen(false)}>
            <FontAwesomeIcon icon={faGear} aria-hidden="true" /> Settings
          </Link>
          <Link role="menuitem" to="/help" className={styles.menuItem} onClick={() => setOpen(false)}>
            <FontAwesomeIcon icon={faCircleQuestion} aria-hidden="true" /> Help
          </Link>
          <div className={styles.themeRow} role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={mode === t.value} className={styles.themeBtn} onClick={() => setMode(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={onSignOut}>
            <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ business, state, unread, onMenu, onSignOut }) {
  return (
    <header className={styles.header} data-testid="header">
      <button type="button" className={styles.hamburger} aria-label="Open menu" onClick={onMenu}>
        <FontAwesomeIcon icon={faBars} aria-hidden="true" />
      </button>
      <Link to="/" className={styles.brand} aria-label="EpicMKT Business home">
        <span className={styles.mark} aria-hidden="true">E</span>
        <span className={styles.word}>EpicMKT Business</span>
      </Link>
      <span className={styles.grow} />
      <PlanBadge plan={business.plan_key} />
      <StatusChip state={state} />
      <Link to="/notifications" className={styles.bell} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <FontAwesomeIcon icon={faBell} aria-hidden="true" />
        {unread > 0 && <span className={styles.count}>{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <AvatarMenu name={business.name} onSignOut={onSignOut} />
    </header>
  );
}
