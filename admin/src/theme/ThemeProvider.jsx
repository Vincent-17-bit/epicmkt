import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isMode,
  nextMode,
  readMode,
  resolveTheme,
  subscribeSystemTheme,
  systemPrefersDark,
  writeMode,
} from "../lib/theme.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const resolved = resolveTheme(mode, prefersDark);

  // System mode follows the OS live.
  useEffect(() => subscribeSystemTheme(setPrefersDark), []);

  // Keep several tabs in agreement.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY) setModeState(isMode(event.newValue) ? event.newValue : "system");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The only place that writes data-theme after first paint (an effect, not a memo).
  useEffect(() => {
    applyTheme(resolved, { animate: true });
  }, [resolved]);

  const setMode = useCallback((value) => {
    if (!isMode(value)) return;
    writeMode(value);
    setModeState(value);
  }, []);

  const cycleMode = useCallback(() => setMode(nextMode(mode)), [mode, setMode]);

  const value = useMemo(() => ({ mode, resolved, setMode, cycleMode }), [mode, resolved, setMode, cycleMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
