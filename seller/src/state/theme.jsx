import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readStore, writeStore } from "../lib/storage.js";

export const THEME_KEY = "epicmkt-seller-theme";
const MODES = ["light", "dark", "system"];
const COLORS = { light: "#FFFFFF", dark: "#0F0F10" };

const Ctx = createContext({ mode: "system", resolved: "light", setMode: () => {} });

const systemDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (mode, dark = systemDark()) => (mode === "dark" || (mode === "system" && dark) ? "dark" : "light");

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    const stored = readStore(THEME_KEY);
    return MODES.includes(stored) ? stored : "system";
  });
  const [dark, setDark] = useState(systemDark);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return undefined;
    const onChange = () => setDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(mode, dark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", COLORS[resolved]));
  }, [resolved]);

  const setMode = useCallback((next) => {
    if (!MODES.includes(next)) return;
    setModeState(next);
    writeStore(THEME_KEY, next);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
