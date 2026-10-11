import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { joinSignals } from "@epicmkt/shared";
import * as api from "../api/index.js";

export function useListings() {
  const [data, setData] = useState({ phase: "loading", rows: [], signals: [], stats: null, error: null });
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.listItems();
      if (alive.current) setData({ phase: "ready", rows: res.items, signals: res.signals, stats: res.stats, error: null });
    } catch (error) {
      if (alive.current) setData((d) => ({ ...d, phase: "error", error }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const items = useMemo(() => joinSignals(data.rows, data.signals), [data.rows, data.signals]);
  const setOrder = useCallback((ids) => {
    setData((d) => {
      const pos = new Map(ids.map((id, i) => [id, i + 1]));
      return { ...d, rows: d.rows.map((r) => (pos.has(r.id) ? { ...r, sort: pos.get(r.id) } : r)) };
    });
  }, []);

  return { phase: data.phase, error: data.error, items, stats: data.stats, reload: load, setOrder };
}
