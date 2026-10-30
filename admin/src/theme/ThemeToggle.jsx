import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleHalfStroke, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { nextMode } from "../lib/theme.js";
import { useTheme } from "./ThemeProvider.jsx";

const META = {
  light: { icon: faSun, label: "Light" },
  dark: { icon: faMoon, label: "Dark" },
  system: { icon: faCircleHalfStroke, label: "System" },
};

// One toggle for the header and the More menu. Cycles light -> dark -> system.
// Icon and label always show the CURRENT mode. variant="menu" matches More tiles.
export default function ThemeToggle({ variant = "header" }) {
  const { mode, cycleMode } = useTheme();
  const { icon, label } = META[mode];
  const next = META[nextMode(mode)].label;
  const className = variant === "menu" ? "admin-more__item theme-toggle" : "admin-theme-toggle theme-toggle";
  return (
    <button
      type="button"
      className={className}
      data-mode={mode}
      aria-label={`Theme: ${label}. Switch to ${next}.`}
      title={`Theme: ${label} (click for ${next})`}
      onClick={cycleMode}
    >
      <FontAwesomeIcon icon={icon} fixedWidth />
      <span className="theme-toggle__label">{label}</span>
    </button>
  );
}
