import { useCallback, useEffect, useRef } from "react";
import { logSearch } from "../api/index.js";
import { normalizeTerm } from "../lib/recentSearches.js";

const PAUSE = 1500;

export function useTypedSearchLog() {
  const timer = useRef(null);
  const pending = useRef("");

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const term = normalizeTerm(pending.current);
    pending.current = "";
    if (term) logSearch(term);
  }, []);

  const typed = useCallback(
    (value) => {
      pending.current = value;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, PAUSE);
    },
    [flush]
  );

  useEffect(() => flush, [flush]);

  return { typed, flush };
}
