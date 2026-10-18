// Applies the saved (or system) theme before the first render, so the sign-in screen is themed too.
export function applySavedTheme() {
  let theme = null;
  try {
    theme = localStorage.getItem("epicmkt-admin-theme");
  } catch {
    theme = null;
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
}
