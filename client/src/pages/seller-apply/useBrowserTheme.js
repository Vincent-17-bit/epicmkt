import { useEffect } from "react";
import { applyMode } from "../../lib/theme.js";
import { useUiStore } from "../../stores/ui.js";

export function useBrowserTheme() {
  useEffect(() => {
    applyMode("system");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system", true);
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      applyMode(useUiStore.getState().theme);
    };
  }, []);
}
