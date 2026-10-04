import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getSnapshot, subscribe, syncServerTime } from "../lib/clock.js";
import { describeMs, endsInLabel, urgencyOf } from "../lib/flash.js";

const MINUTE = 60000;

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
  const read = () => {
    const now = getSnapshot();
    return entries.filter((entry) => Date.parse(entry.sale.endsAt) > now).map((entry) => entry.sale.id).join("|");
  };
  const key = useSyncExternalStore(subscribe, read, read);
  return useMemo(() => {
    const ids = new Set(key ? key.split("|") : []);
    return entries.filter((entry) => ids.has(entry.sale.id));
  }, [key, entries]);
}

export function useServerClockSync() {
  useEffect(() => {
    syncServerTime();
    const sync = () => {
      if (document.visibilityState === "visible") syncServerTime();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", syncServerTime);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", syncServerTime);
    };
  }, []);
}
