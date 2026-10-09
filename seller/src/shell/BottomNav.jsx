import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { BOTTOM, byKey } from "./nav.js";
import styles from "./shell.module.css";

export default function BottomNav({ onMore, moreActive, attention }) {
  return (
    <nav className={styles.bottom} aria-label="Primary">
      {BOTTOM.map((key) => {
        const item = byKey(key);
        return (
          <NavLink key={key} to={item.to} end={item.end} className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ""}`}>
            <FontAwesomeIcon icon={item.icon} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <button type="button" className={`${styles.tab} ${moreActive ? styles.tabActive : ""}`} onClick={onMore} aria-haspopup="dialog" data-attention={attention ? "true" : undefined}>
        <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
