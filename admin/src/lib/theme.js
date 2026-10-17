import { useEffect, useState } from "react";

const KEY = "epicmkt-admin-theme";

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function initialTheme() {
  const saved = read();
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage can be unavailable (private mode); the attribute still applies
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((value) => (value === "light" ? "dark" : "light"));
  return { theme, toggle };
}
