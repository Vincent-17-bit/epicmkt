import { useSyncExternalStore } from "react";

export function useMediaQuery(query) {
  const subscribe = (notify) => {
    const list = window.matchMedia(query);
    list.addEventListener?.("change", notify);
    return () => list.removeEventListener?.("change", notify);
  };
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
