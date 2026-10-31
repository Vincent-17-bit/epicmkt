const KEY = "seller-theme";
const MODES = ["light", "dark", "system"];

const systemDark = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

// The theme that is on screen right now: "light" or "dark".
export const getTheme = () => document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

// What the seller chose: "light", "dark" or "system" (follow the device).
export const getThemeMode = () => {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
};

const resolve = (mode) => (mode === "dark" || (mode === "system" && systemDark()) ? "dark" : "light");

export function setTheme(mode) {
  if (!MODES.includes(mode)) return;
  document.documentElement.setAttribute("data-theme", resolve(mode));
  try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
}

// Follows the device while the seller's choice is "system". Returns a function that stops listening.
export function watchSystemTheme() {
  const query = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : null;
  if (!query) return () => {};
  const onChange = () => { if (getThemeMode() === "system") document.documentElement.setAttribute("data-theme", resolve("system")); };
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}
