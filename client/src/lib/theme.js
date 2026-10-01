export const THEME_KEY = "epicmkt-theme";
export const MODES = ["light", "dark", "system"];

const COLORS = { light: "#FFFFFF", dark: "#111111" };
const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export function readMode() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return MODES.includes(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function saveMode(mode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
}

export function resolveMode(mode) {
  if (mode === "system") return query().matches ? "dark" : "light";
  return mode;
}

export function applyMode(mode, animate = false) {
  const root = document.documentElement;
  const resolved = resolveMode(mode);
  if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 250);
  }
  root.dataset.theme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", COLORS[resolved]);
  });
}

export function watchSystem(getMode) {
  const media = query();
  const onChange = () => {
    if (getMode() === "system") applyMode("system", true);
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
