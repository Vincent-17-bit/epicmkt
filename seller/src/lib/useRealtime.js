import { useEffect, useRef } from "react";
import * as api from "../api/index.js";

/** Calls onChange whenever one of the seller's own rows in these tables changes. Pages refetch instead of patching, so a payment confirmed by the admin or by an automatic matcher looks identical. */
export function useRealtime(tables, onChange) {
  const ref = useRef(onChange);
  ref.current = onChange;
  const key = tables.join(",");
  useEffect(() => api.subscribe(tables, (e) => ref.current(e)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
