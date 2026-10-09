import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { BottomSheet } from "@epicmkt/ui";
import { useTheme } from "../state/theme.jsx";
import { MORE } from "./nav.js";
import styles from "./shell.module.css";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
];

export default function MoreSheet({ open, onClose, unread, onSignOut }) {
  const { mode, setMode } = useTheme();
  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="more-title" closeAbove="(min-width: 768px)">
      <div className={styles.sheetBody}>
        <h2 id="more-title" className={styles.sheetTitle}>More</h2>
        <ul className={styles.sheetList}>
          {MORE.map((item) => (
            <li key={item.key}>
              <Link to={item.to} className={styles.sheetItem} onClick={onClose}>
                <FontAwesomeIcon icon={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
                {item.key === "notifications" && unread > 0 && <span className={styles.navCount}>{unread}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.themeRow} role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={mode === t.value} className={styles.themeBtn} onClick={() => setMode(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className={styles.sheetItem} onClick={onSignOut}>
          <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </BottomSheet>
  );
}
