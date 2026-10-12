const KEY = "seller-theme";

export const getTheme = () => document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
}
