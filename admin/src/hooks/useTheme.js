import { useCallback, useEffect, useState } from "react";

const KEY = "epicmkt-admin-theme";

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage blocked: fall through to the system setting */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return [theme, toggle];
}
