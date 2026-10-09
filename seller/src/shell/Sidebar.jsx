import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAnglesLeft, faAnglesRight } from "@fortawesome/free-solid-svg-icons";
import { NAV } from "./nav.js";
import styles from "./shell.module.css";

export function NavList({ unread, attention, onNavigate, className = "" }) {
  return (
    <nav className={`${styles.nav} ${className}`} aria-label="Main">
      {NAV.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.end}
          title={item.label}
          onClick={onNavigate}
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ""}`}
          data-attention={attention === item.key ? "true" : undefined}
        >
          <FontAwesomeIcon icon={item.icon} className={styles.navIcon} aria-hidden="true" />
          <span className={styles.label}>{item.label}</span>
          {item.key === "notifications" && unread > 0 && <span className={styles.navCount}>{unread > 99 ? "99+" : unread}</span>}
          {attention === item.key && <span className={styles.attn} aria-label="Needs attention" />}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Sidebar({ collapsed, onToggle, unread, attention }) {
  return (
    <aside className={styles.sidebar} aria-label="Sidebar">
      <div className={styles.sideBrand}>
        <span className={styles.mark} aria-hidden="true">E</span>
        <span className={`${styles.label} ${styles.sideWord}`}>EpicMKT Business</span>
      </div>
      <NavList unread={unread} attention={attention} />
      <button type="button" className={styles.collapse} onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-keyshortcuts="[" title="Toggle sidebar ([)">
        <FontAwesomeIcon icon={collapsed ? faAnglesRight : faAnglesLeft} aria-hidden="true" />
        <span className={styles.label}>Collapse</span>
      </button>
    </aside>
  );
}
