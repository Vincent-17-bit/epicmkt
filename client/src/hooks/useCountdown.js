import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateSnapshot } from "../api/flash/snapshot.js";
import { getSnapshot, isSynced, subscribe, syncServerTime } from "../lib/clock.js";
import { describeMs, endsInLabel, urgencyOf } from "../lib/flash.js";
import { invalidateFlash } from "../lib/flashSync.js";

const MINUTE = 60000;
const CLOCK_SYNC_MS = 5 * MINUTE;

export function useServerNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useCountdown(endsAtIso) {
  const now = useServerNow();
  const end = Date.parse(endsAtIso);
  return useMemo(() => describeMs(end - now), [end, now]);
}

export function useUrgency(endsAtIso) {
  const end = Date.parse(endsAtIso);
  return useSyncExternalStore(
    subscribe,
    () => urgencyOf(end - getSnapshot()),
    () => urgencyOf(end - getSnapshot())
  );
}

export function useCountdownLabel(endsAtIso) {
  const end = Date.parse(endsAtIso);
  const read = () => Math.ceil((end - getSnapshot()) / MINUTE);
  const minutes = useSyncExternalStore(subscribe, read, read);
  return useMemo(() => endsInLabel(minutes * MINUTE), [minutes]);
}

export function useLiveSales(entries) {
  const queryClient = useQueryClient();
  const seen = useRef("");
  const read = () => {
    const now = getSnapshot();
    const synced = isSynced();
    const live = [];
    const reached = [];
    for (const entry of entries) {
      const over = Date.parse(entry.sale.endsAt) <= now;
      if (over) reached.push(entry.sale.id);
      if (!over || !synced) live.push(entry.sale.id);
    }
    return `${live.join("|")}#${reached.join("|")}`;
  };
  const key = useSyncExternalStore(subscribe, read, read);
  const [liveKey, reachedKey] = key.split("#");
  useEffect(() => {
    if (reachedKey === seen.current) return;
    seen.current = reachedKey;
    if (!reachedKey) return;
    invalidateSnapshot();
    invalidateFlash(queryClient);
  }, [reachedKey, queryClient]);
  return useMemo(() => {
    const ids = new Set(liveKey ? liveKey.split("|") : []);
    return entries.filter((entry) => ids.has(entry.sale.id));
  }, [liveKey, entries]);
}

export function useServerClockSync() {
  useEffect(() => {
    syncServerTime();
    const sync = () => {
      if (document.visibilityState === "visible") syncServerTime();
    };
    const timer = window.setInterval(sync, CLOCK_SYNC_MS);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("online", syncServerTime);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("online", syncServerTime);
    };
  }, []);
}
