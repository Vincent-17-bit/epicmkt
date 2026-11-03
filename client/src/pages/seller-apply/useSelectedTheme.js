import { useEffect } from "react";
import { applyMode } from "../../lib/theme.js";
import { useUiStore } from "../../stores/ui.js";

// The application and status pages show the theme the visitor picked on the main site (light, dark or system).
// The "system" case keeps following the device live through the listener in main.jsx, so nothing is forced here.
export function useSelectedTheme() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    applyMode(theme);
  }, [theme]);
}
