// Single source of truth for the admin theme. Pure helpers, no React.
// main.jsx calls applySavedTheme() before the first render so there is no flash;
// ThemeProvider (src/theme/ThemeProvider.jsx) then keeps the DOM in sync.

export const THEME_STORAGE_KEY = "epicmkt-admin-theme";
export const THEME_MODES = ["light", "dark", "system"];
const DARK_QUERY = "(prefers-color-scheme: dark)";
const FALLBACK_COLOR = { light: "#ffffff", dark: "#1a1a1a" };
const SWITCH_MS = 150;

export function isMode(value) {
  return THEME_MODES.includes(value);
}

export function readMode() {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isMode(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export function writeMode(mode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export function systemPrefersDark() {
  try {
    return Boolean(window.matchMedia?.(DARK_QUERY).matches);
  } catch {
    return false;
  }
}

export function resolveTheme(mode, prefersDark = systemPrefersDark()) {
  if (mode === "light" || mode === "dark") return mode;
  return prefersDark ? "dark" : "light";
}

export function nextMode(mode) {
  return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
}

export function subscribeSystemTheme(onChange) {
  let query;
  try {
    query = window.matchMedia?.(DARK_QUERY);
  } catch {
    query = null;
  }
  if (!query) return () => {};
  const handler = (event) => onChange(Boolean(event.matches));
  if (query.addEventListener) query.addEventListener("change", handler);
  else query.addListener?.(handler);
  return () => {
    if (query.removeEventListener) query.removeEventListener("change", handler);
    else query.removeListener?.(handler);
  };
}

// Keeps the browser chrome (mobile address bar) in step with the header colour.
export function updateMetaThemeColor(resolved) {
  const root = document.documentElement;
  let color = "";
  try {
    color = getComputedStyle(root).getPropertyValue("--surface").trim();
  } catch {
    color = "";
  }
  if (!color) color = FALLBACK_COLOR[resolved];
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

let switchTimer = null;

// animate=true adds a short colour transition (CSS drops it for reduced motion).
export function applyTheme(resolved, { animate = false } = {}) {
  const root = document.documentElement;
  const changed = root.getAttribute("data-theme") !== resolved;
  if (animate && changed) {
    root.setAttribute("data-theme-switching", "");
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => root.removeAttribute("data-theme-switching"), SWITCH_MS + 50);
  }
  root.setAttribute("data-theme", resolved);
  updateMetaThemeColor(resolved);
}

export function applySavedTheme() {
  const resolved = resolveTheme(readMode());
  applyTheme(resolved);
  return resolved;
}
