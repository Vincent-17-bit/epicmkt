import { useEffect, useRef } from "react";
import * as api from "../api/index.js";

/** Calls onChange whenever one of the seller's own rows in these tables changes. Pages refetch instead of patching, so a payment confirmed by the admin or by an automatic matcher looks identical. */
export function useRealtime(tables, onChange) {
  const ref = useRef(onChange);
  ref.current = onChange;
  // Callers pass a fresh array each render. Resubscribe only when its contents change, and read it from a ref so the effect needs no suppression.
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const key = tables.join(",");
  useEffect(() => api.subscribe(tablesRef.current, (e) => ref.current(e)), [key]);
}
