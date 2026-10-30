import { useCallback, useState } from "react";
import { initialCollapsed, readSaved, writeSaved } from "../lib/sidebar.js";

// The sidebar's collapsed state, remembered between visits.
export default function useSidebar() {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window === "undefined" ? false : initialCollapsed(readSaved(window.localStorage), window.innerWidth),
  );
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeSaved(window.localStorage, !current);
      return !current;
    });
  }, []);
  return { collapsed, toggle };
}
