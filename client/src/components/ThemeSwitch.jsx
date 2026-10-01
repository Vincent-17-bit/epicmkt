import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSun, faMoon, faCircleHalfStroke } from "@fortawesome/free-solid-svg-icons";
import { useUiStore } from "../stores/ui.js";
import styles from "./ThemeSwitch.module.css";

const options = [
  { mode: "light", label: "Light", icon: faSun },
  { mode: "dark", label: "Dark", icon: faMoon },
  { mode: "system", label: "System", icon: faCircleHalfStroke }
];

export default function ThemeSwitch({ className = "" }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div role="group" aria-label="Theme" className={`${styles.group} ${className}`}>
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          aria-pressed={theme === option.mode}
          className={styles.option}
          onClick={() => setTheme(option.mode)}
        >
          <FontAwesomeIcon icon={option.icon} className={styles.icon} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
